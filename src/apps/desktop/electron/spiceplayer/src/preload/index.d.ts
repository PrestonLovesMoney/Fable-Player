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

interface SpiceAPI {
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
    getRecommendations: (track: unknown) => Promise<unknown>
    getPlaylist: (playlistId: number) => Promise<unknown>
  }
  window: {
    minimize: () => Promise<void>
    maximize: () => Promise<void>
    close: () => Promise<void>
    isMaximized: () => Promise<boolean>
    openExternal: (url: string) => Promise<void>
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    spiceAPI: SpiceAPI
  }
}
