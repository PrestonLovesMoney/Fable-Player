import { getValidAccessToken } from './auth-service'
import { net } from 'electron'

const SERVER_URL = (process.env.FABLE_SERVER_URL || 'http://16.16.74.196:3000').replace(/\/$/, '')

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

/** Sends requests only to the Fable backend; SoundCloud tokens never leave it. */
async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getValidAccessToken()
  if (!token) throw new Error('Not authenticated. Please login first.')

  let response: Response
  try {
    // Use Chromium's network stack so requests inherit the user's proxy and
    // network configuration instead of failing with a generic fetch error.
    response = await net.fetch(`${SERVER_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...options.headers
      }
    })
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown network error'
    throw new Error(`Cannot reach the Fable Player server. Check your internet connection or proxy settings. (${reason})`)
  }

  if (!response.ok) {
    throw new Error(`Server API error (${response.status}): ${await response.text()}`)
  }

  return response.json() as Promise<T>
}

export async function getMe(): Promise<SCUser> {
  return serverFetch<SCUser>('/sc/me')
}

export async function getUserPlaylists(limit = 50, offset = 0): Promise<SCPlaylist[]> {
  return serverFetch<SCPlaylist[]>(`/sc/playlists?limit=${limit}&offset=${offset}`)
}

export async function getLikedTracks(limit = 50, offset = 0): Promise<SCTrack[]> {
  return serverFetch<SCTrack[]>(`/sc/liked-tracks?limit=${limit}&offset=${offset}`)
}

export async function getUserTracks(limit = 50, offset = 0): Promise<SCTrack[]> {
  return serverFetch<SCTrack[]>(`/sc/my-tracks?limit=${limit}&offset=${offset}`)
}

export async function searchTracks(query: string, limit = 20): Promise<SCTrack[]> {
  return serverFetch<SCTrack[]>(`/sc/search?query=${encodeURIComponent(query)}&limit=${limit}`)
}

function pickDiverseSeeds(tracks: SCTrack[], count: number): SCTrack[] {
  const selected: SCTrack[] = []
  const artists = new Set<string>()
  const genres = new Set<string>()
  for (const track of tracks) {
    if (selected.length >= count) break
    const artist = track.user?.username?.toLowerCase() || ''
    const genre = track.genre?.toLowerCase().trim() || ''
    if (selected.length === 0 || !artists.has(artist) || !genres.has(genre)) {
      selected.push(track)
      if (artist) artists.add(artist)
      if (genre) genres.add(genre)
    }
  }
  return selected.length >= count
    ? selected
    : [...selected, ...tracks.filter((track) => !selected.some((item) => item.id === track.id))].slice(0, count)
}

function dedupeTracks(tracks: SCTrack[], excluded: Set<number> = new Set()): SCTrack[] {
  const seen = new Set(excluded)
  return tracks.filter((track) => Boolean(track?.id) && !seen.has(track.id) && Boolean(seen.add(track.id)))
}

function interleave<T>(pools: T[][]): T[] {
  const result: T[] = []
  const max = Math.max(0, ...pools.map((pool) => pool.length))
  for (let i = 0; i < max; i++) for (const pool of pools) if (pool[i]) result.push(pool[i])
  return result
}

export async function getRelatedTracks(track: SCTrack, limit = 12): Promise<SCTrack[]> {
  const tracks = await serverFetch<SCTrack[]>('/sc/recommendations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ track })
  })
  return tracks.slice(0, limit)
}

export async function getPersonalizedRecommendations(
  seeds: SCTrack[],
  options: { limit?: number; excludeIds?: number[] } = {}
): Promise<SCTrack[]> {
  const limit = options.limit ?? 36
  const excluded = new Set([...(options.excludeIds ?? []), ...seeds.map((track) => track.id)])
  if (!seeds.length) return []

  const seedTracks = pickDiverseSeeds(seeds.slice(0, 40), Math.min(5, seeds.length))
  const pools = await Promise.all(seedTracks.map((track) => getRelatedTracks(track, 14).catch(() => [])))
  return dedupeTracks(interleave(pools), excluded).slice(0, limit)
}

export async function getNewReleases(genres: string[] = [], limit = 40): Promise<SCTrack[]> {
  const queries = genres.map((genre) => genre.trim()).filter(Boolean).slice(0, 3)
  const pools = await Promise.all((queries.length ? queries : ['new music']).map((query) => searchTracks(query, limit)))
  return dedupeTracks(interleave(pools))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)
}

export async function getTrendingTracks(genres: string[] = [], limit = 40): Promise<SCTrack[]> {
  const queries = genres.map((genre) => genre.trim()).filter(Boolean).slice(0, 3)
  const pools = await Promise.all((queries.length ? queries : ['pop', 'electronic', 'hip hop']).map((query) => searchTracks(query, 20)))
  return dedupeTracks(interleave(pools))
    .sort((a, b) => (b.likes_count || 0) + (b.playback_count || 0) / 50 - ((a.likes_count || 0) + (a.playback_count || 0) / 50))
    .slice(0, limit)
}

export async function createPlaylist(
  title: string,
  trackIds: number[] = [],
  sharing: 'public' | 'private' = 'private'
): Promise<SCPlaylist> {
  return serverFetch<SCPlaylist>('/sc/playlists', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, trackIds, sharing })
  })
}

export async function updatePlaylistTracks(playlistId: number, trackIds: number[]): Promise<SCPlaylist> {
  return serverFetch<SCPlaylist>(`/sc/playlists/${playlistId}/tracks`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trackIds })
  })
}

export async function getTrack(trackId: number): Promise<SCTrack> {
  return serverFetch<SCTrack>(`/sc/tracks/${trackId}`)
}

export async function getPlaylist(playlistId: number): Promise<SCPlaylist> {
  return serverFetch<SCPlaylist>(`/sc/playlist/${playlistId}`)
}

export async function getStreamUrl(trackId: number): Promise<string> {
  return (await serverFetch<{ url: string }>(`/sc/stream/${trackId}`)).url
}
