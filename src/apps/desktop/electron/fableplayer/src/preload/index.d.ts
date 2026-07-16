import { ElectronAPI } from '@electron-toolkit/preload'

interface AuthStatus {
  isAuthenticated: boolean
  user: {
    id: number
    username: string
    avatar_url: string
    permalink_url: string
    full_name: string
  } | null
}

interface FableAPI {
  auth: {
    login: () => Promise<{
      success: boolean
      isAuthenticated?: boolean
      user?: unknown
      error?: string
    }>
    logout: () => Promise<{ success: boolean }>
    getStatus: () => Promise<AuthStatus>
    onAuthStateChanged: (callback: (status: AuthStatus) => void) => () => void
  }
  soundcloud: {
    getMe: () => Promise<unknown>
    getPlaylists: (params?: { limit?: number; offset?: number }) => Promise<unknown>
    getLikedTracks: (params?: { limit?: number; offset?: number }) => Promise<unknown>
    getMyTracks: (params?: { limit?: number; offset?: number }) => Promise<unknown>
    search: (query: string, limit?: number) => Promise<unknown>
    getStreamUrl: (trackId: number) => Promise<{ url?: string; error?: string }>
    getRecommendations: (
      seedsOrTrack: unknown,
      options?: { excludeIds?: number[]; limit?: number }
    ) => Promise<unknown>
    getNewReleases: (params?: { genres?: string[]; limit?: number }) => Promise<unknown>
    getTrending: (params?: { genres?: string[]; limit?: number }) => Promise<unknown>
    getPlaylist: (playlistId: number) => Promise<unknown>
    createPlaylist: (params: {
      title: string
      trackIds?: number[]
      sharing?: 'public' | 'private'
    }) => Promise<unknown>
    updatePlaylistTracks: (playlistId: number, trackIds: number[]) => Promise<unknown>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    openExternal: (url: string) => Promise<void>
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
  }
  discord: {
    getStatus: () => Promise<{
      enabled: boolean
      connected: boolean
      clientId: string
      hasClientId: boolean
    }>
    setEnabled: (enabled: boolean) => Promise<{
      enabled: boolean
      connected: boolean
      clientId: string
      hasClientId: boolean
    }>
    setClientId: (clientId: string) => Promise<{
      success: boolean
      error?: string
      enabled: boolean
      connected: boolean
      clientId: string
      hasClientId: boolean
    }>
    updatePresence: (payload: {
      title: string
      artist: string
      artworkUrl?: string | null
      durationMs?: number
      positionMs?: number
      isPlaying: boolean
      permalinkUrl?: string | null
    }) => Promise<{ success: boolean }>
    clearPresence: () => Promise<{ success: boolean }>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    fableAPI: FableAPI
  }
}
