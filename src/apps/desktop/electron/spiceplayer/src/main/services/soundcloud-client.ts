import { getValidAccessToken } from './auth-service'

const SC_API_URL = 'https://api.soundcloud.com'

export interface SCTrack {
  id: number
  urn?: string
  title: string
  user: { username: string; avatar_url: string }
  artwork_url: string | null
  duration: number
  stream_url?: string
  permalink_url: string
  genre: string
  playback_count: number
  likes_count: number
  created_at: string
}

export interface SCPlaylist {
  id: number
  title: string
  user: { username: string; avatar_url: string }
  artwork_url: string | null
  track_count: number
  duration: number
  tracks: SCTrack[]
  permalink_url: string
  created_at: string
}

interface CollectionResponse<T> {
  collection: T[]
  next_href?: string | null
}

export interface SCUser {
  id: number
  username: string
  avatar_url: string
  full_name: string
  followers_count: number
  followings_count: number
  track_count: number
  playlist_count: number
  permalink_url: string
}

/**
 * Make an authenticated request to the SoundCloud API.
 * Automatically includes the OAuth token.
 */
async function scFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidAccessToken()

  if (!token) {
    throw new Error('Not authenticated. Please login first.')
  }

  const url = endpoint.startsWith('http') ? endpoint : `${SC_API_URL}${endpoint}`

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: 'application/json',
      ...options.headers
    }
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`SoundCloud API error (${response.status}): ${errorText}`)
  }

  return response.json() as Promise<T>
}

async function scCollection<T>(endpoint: string, maximum = 1_000): Promise<T[]> {
  const items: T[] = []
  let nextEndpoint: string | null = endpoint

  while (nextEndpoint && items.length < maximum) {
    const data = await scFetch<T[] | CollectionResponse<T>>(nextEndpoint)
    if (Array.isArray(data)) return data.slice(0, maximum)

    items.push(...(data.collection ?? []))
    nextEndpoint = data.next_href ?? null
  }

  return items.slice(0, maximum)
}

/**
 * Get the authenticated user's profile.
 */
export async function getMe(): Promise<SCUser> {
  return scFetch<SCUser>('/me')
}

/**
 * Get the authenticated user's playlists.
 */
export async function getUserPlaylists(limit = 50, offset = 0): Promise<SCPlaylist[]> {
  return scCollection<SCPlaylist>(
    `/me/playlists?show_tracks=false&linked_partitioning=true&limit=${limit}&offset=${offset}`
  )
}

/**
 * Get the authenticated user's liked tracks.
 */
export async function getLikedTracks(limit = 50, offset = 0): Promise<SCTrack[]> {
  return scCollection<SCTrack>(
    `/me/likes/tracks?linked_partitioning=true&limit=${limit}&offset=${offset}`
  )
}

/** Get tracks uploaded by the authenticated user. */
export async function getUserTracks(limit = 50, offset = 0): Promise<SCTrack[]> {
  return scCollection<SCTrack>(
    `/me/tracks?linked_partitioning=true&limit=${limit}&offset=${offset}`
  )
}

/**
 * Search for tracks.
 */
export async function searchTracks(query: string, limit = 20): Promise<SCTrack[]> {
  const encoded = encodeURIComponent(query)
  return scCollection<SCTrack>(`/tracks?q=${encoded}&access=playable&limit=${limit}`)
}

function formatScDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`
}

function pickDiverseSeeds(tracks: SCTrack[], count: number): SCTrack[] {
  const selected: SCTrack[] = []
  const usedArtists = new Set<string>()
  const usedGenres = new Set<string>()

  for (const track of tracks) {
    if (selected.length >= count) break
    const artist = track.user?.username?.toLowerCase() || ''
    const genre = track.genre?.toLowerCase().trim() || ''
    const artistUsed = artist && usedArtists.has(artist)
    const genreUsed = genre && usedGenres.has(genre)
    if (selected.length === 0 || !artistUsed || !genreUsed) {
      selected.push(track)
      if (artist) usedArtists.add(artist)
      if (genre) usedGenres.add(genre)
    }
  }

  if (selected.length < count) {
    for (const track of tracks) {
      if (selected.length >= count) break
      if (!selected.some((t) => t.id === track.id)) selected.push(track)
    }
  }

  return selected
}

function dedupeTracks(tracks: SCTrack[], excludeIds: Set<number> = new Set()): SCTrack[] {
  const seen = new Set(excludeIds)
  const result: SCTrack[] = []
  for (const track of tracks) {
    if (!track?.id || seen.has(track.id)) continue
    seen.add(track.id)
    result.push(track)
  }
  return result
}

function interleave<T>(pools: T[][]): T[] {
  const result: T[] = []
  const maxLen = Math.max(0, ...pools.map((p) => p.length))
  for (let i = 0; i < maxLen; i++) {
    for (const pool of pools) {
      if (i < pool.length) result.push(pool[i])
    }
  }
  return result
}

/** Find tracks related to a library track for the home recommendations shelf. */
export async function getRelatedTracks(track: SCTrack, limit = 12): Promise<SCTrack[]> {
  const resource = track.urn || track.id
  try {
    return await scCollection<SCTrack>(
      `/tracks/${encodeURIComponent(String(resource))}/related?access=playable&limit=${limit}`,
      limit
    )
  } catch {
    // Some catalogue tracks do not expose related content. A genre search still
    // produces relevant recommendations instead of an empty home screen.
    return searchTracks(track.genre || track.user.username, limit)
  }
}

/**
 * Build a personalized recommendation feed from multiple seed tracks.
 * Uses related tracks + genre affinity, then dedupes and interleaves for variety.
 */
export async function getPersonalizedRecommendations(
  seeds: SCTrack[],
  options: { limit?: number; excludeIds?: number[] } = {}
): Promise<SCTrack[]> {
  const limit = options.limit ?? 36
  const exclude = new Set(options.excludeIds ?? [])
  for (const seed of seeds) exclude.add(seed.id)

  if (!seeds.length) return []

  const diverseSeeds = pickDiverseSeeds(seeds.slice(0, 40), Math.min(5, seeds.length))
  const relatedPools = await Promise.all(
    diverseSeeds.map((seed) => getRelatedTracks(seed, 14).catch(() => [] as SCTrack[]))
  )

  const topGenres = [
    ...new Set(
      seeds
        .map((t) => t.genre?.trim())
        .filter((g): g is string => Boolean(g))
        .slice(0, 8)
    )
  ].slice(0, 3)

  let genrePool: SCTrack[] = []
  if (topGenres.length > 0) {
    try {
      genrePool = await scCollection<SCTrack>(
        `/tracks?genres=${encodeURIComponent(topGenres.join(','))}&access=playable&limit=24&linked_partitioning=true`,
        24
      )
    } catch {
      genrePool = []
    }
  }

  const merged = interleave([...relatedPools, genrePool])
  return dedupeTracks(merged, exclude).slice(0, limit)
}

/** Recently uploaded tracks, optionally filtered by the listener's top genres. */
export async function getNewReleases(genres: string[] = [], limit = 40): Promise<SCTrack[]> {
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - 45)
  const fromParam = encodeURIComponent(formatScDate(from))
  const cleanedGenres = genres
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 4)

  const endpoint =
    cleanedGenres.length > 0
      ? `/tracks?genres=${encodeURIComponent(cleanedGenres.join(','))}&created_at[from]=${fromParam}&access=playable&limit=${limit}&linked_partitioning=true`
      : `/tracks?q=${encodeURIComponent('new music')}&created_at[from]=${fromParam}&access=playable&limit=${limit}&linked_partitioning=true`

  try {
    const tracks = await scCollection<SCTrack>(endpoint, limit)
    return [...tracks].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  } catch {
    // Fallback: genre / keyword search, then keep only recent items client-side.
    const fallbackQuery = cleanedGenres[0] || 'electronic'
    const tracks = await searchTracks(fallbackQuery, limit)
    const cutoff = from.getTime()
    const recent = tracks.filter((t) => new Date(t.created_at).getTime() >= cutoff)
    const pool = recent.length > 0 ? recent : tracks
    return [...pool].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
  }
}

/** High-engagement tracks for the Trending tab. */
export async function getTrendingTracks(genres: string[] = [], limit = 40): Promise<SCTrack[]> {
  const cleanedGenres = genres
    .map((g) => g.trim())
    .filter(Boolean)
    .slice(0, 3)
  const queries = cleanedGenres.length > 0 ? cleanedGenres : ['pop', 'electronic', 'hip hop']

  const pools = await Promise.all(
    queries.map(async (q) => {
      try {
        if (cleanedGenres.length > 0) {
          return await scCollection<SCTrack>(
            `/tracks?genres=${encodeURIComponent(q)}&access=playable&limit=20&linked_partitioning=true`,
            20
          )
        }
        return await searchTracks(q, 20)
      } catch {
        return [] as SCTrack[]
      }
    })
  )

  return dedupeTracks(interleave(pools))
    .sort(
      (a, b) =>
        (b.likes_count || 0) + (b.playback_count || 0) / 50 -
        ((a.likes_count || 0) + (a.playback_count || 0) / 50)
    )
    .slice(0, limit)
}

/** Create a playlist on SoundCloud (optionally with initial tracks). */
export async function createPlaylist(
  title: string,
  trackIds: number[] = [],
  sharing: 'public' | 'private' = 'private'
): Promise<SCPlaylist> {
  return scFetch<SCPlaylist>('/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playlist: {
        title,
        sharing,
        tracks: trackIds.map((id) => ({ id }))
      }
    })
  })
}

/** Replace playlist track list on SoundCloud. */
export async function updatePlaylistTracks(
  playlistId: number,
  trackIds: number[]
): Promise<SCPlaylist> {
  return scFetch<SCPlaylist>(`/playlists/${playlistId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      playlist: {
        tracks: trackIds.map((id) => ({ id }))
      }
    })
  })
}

/**
 * Get a specific track by ID.
 */
export async function getTrack(trackId: number): Promise<SCTrack> {
  return scFetch<SCTrack>(`/tracks/${trackId}`)
}

/**
 * Get a specific playlist by ID.
 */
export async function getPlaylist(playlistId: number): Promise<SCPlaylist> {
  return scFetch<SCPlaylist>(`/playlists/${playlistId}?show_tracks=true`)
}

export async function getStreamUrl(trackId: number): Promise<string> {
  const data = await scFetch<Record<string, string>>(`/tracks/${trackId}/streams`)
  const proxyUrl =
    data.hls_opus_64_url ||
    data.http_mp3_128_url ||
    data.hls_mp3_128_url ||
    data.hls_aac_160_url ||
    data.hls_aac_96_url ||
    data.url
  if (!proxyUrl) throw new Error('No playable stream is available for this track.')
  
  const token = await getValidAccessToken()
  const response = await fetch(proxyUrl, {
    headers: { Authorization: `OAuth ${token}` }
  })
  
  if (!response.ok) {
    throw new Error(`Failed to resolve stream media URL: ${response.status}`)
  }
  
  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const json = await response.json()
    return json.url
  }
  
  return response.url
}
