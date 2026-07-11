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
