import { ipcMain, BrowserWindow, shell } from 'electron'
import { startAuthFlow, getAuthStatus, logout, broadcastAuthState } from './services/auth-service'
import {
  getMe,
  getUserPlaylists,
  getLikedTracks,
  getUserTracks,
  getPersonalizedRecommendations,
  getNewReleases,
  getTrendingTracks,
  searchTracks,
  getStreamUrl,
  getPlaylist,
  createPlaylist,
  updatePlaylistTracks,
  type SCTrack
} from './services/soundcloud-client'
import {
  clearDiscordPresence,
  getDiscordPresenceStatus,
  setDiscordClientId,
  setDiscordPresenceEnabled,
  updateDiscordPresence,
  type DiscordPresencePayload
} from './services/discord-rpc'

/**
 * Register all IPC handlers for renderer ↔ main process communication.
 */
export function registerIpcHandlers(): void {
  // ── Auth Handlers ──

  ipcMain.handle('auth:login', async () => {
    try {
      await startAuthFlow()
      const status = await getAuthStatus()
      broadcastAuthState(status)
      return { success: true, ...status }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  })

  ipcMain.handle('auth:logout', async () => {
    await logout()
    const status = { isAuthenticated: false, user: null }
    broadcastAuthState(status)
    return { success: true }
  })

  ipcMain.handle('auth:status', async () => {
    try {
      return await getAuthStatus()
    } catch {
      return { isAuthenticated: false, user: null }
    }
  })

  // ── SoundCloud API Handlers ──

  ipcMain.handle('sc:me', async () => {
    try {
      return await getMe()
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(
    'sc:playlists',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      try {
        return await getUserPlaylists(limit, offset)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:my-tracks',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      try {
        return await getUserTracks(limit, offset)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:liked-tracks',
    async (_event, { limit, offset }: { limit?: number; offset?: number } = {}) => {
      try {
        return await getLikedTracks(limit, offset)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:search',
    async (_event, { query, limit }: { query: string; limit?: number }) => {
      try {
        return await searchTracks(query, limit)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle('sc:stream-url', async (_event, trackId: number) => {
    try {
      return { url: await getStreamUrl(trackId) }
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('sc:playlist', async (_event, playlistId: number) => {
    try {
      return await getPlaylist(playlistId)
    } catch (error) {
      return { error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle(
    'sc:recommendations',
    async (
      _event,
      payload: SCTrack | { seeds: SCTrack[]; excludeIds?: number[]; limit?: number }
    ) => {
      try {
        // Legacy single-seed call still supported for older renderer builds.
        if (payload && typeof payload === 'object' && 'seeds' in payload) {
          return await getPersonalizedRecommendations(payload.seeds || [], {
            excludeIds: payload.excludeIds,
            limit: payload.limit
          })
        }
        return await getPersonalizedRecommendations([payload as SCTrack])
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:new-releases',
    async (_event, { genres, limit }: { genres?: string[]; limit?: number } = {}) => {
      try {
        return await getNewReleases(genres || [], limit)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:trending',
    async (_event, { genres, limit }: { genres?: string[]; limit?: number } = {}) => {
      try {
        return await getTrendingTracks(genres || [], limit)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:create-playlist',
    async (
      _event,
      {
        title,
        trackIds,
        sharing
      }: { title: string; trackIds?: number[]; sharing?: 'public' | 'private' }
    ) => {
      try {
        return await createPlaylist(title, trackIds || [], sharing || 'private')
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle(
    'sc:update-playlist-tracks',
    async (_event, { playlistId, trackIds }: { playlistId: number; trackIds: number[] }) => {
      try {
        return await updatePlaylistTracks(playlistId, trackIds)
      } catch (error) {
        return { error: error instanceof Error ? error.message : 'Unknown error' }
      }
    }
  )

  ipcMain.handle('shell:open-external', async (_event, url: string) => {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('soundcloud.com')) {
      throw new Error('Only SoundCloud profile links can be opened.')
    }
    await shell.openExternal(parsed.toString())
  })

  // ── Window Controls ──

  ipcMain.handle('window:minimize', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.minimize()
  })

  ipcMain.handle('window:maximize', () => {
    const win = BrowserWindow.getFocusedWindow()
    if (win?.isMaximized()) {
      win.unmaximize()
    } else {
      win?.maximize()
    }
  })

  ipcMain.handle('window:close', () => {
    const win = BrowserWindow.getFocusedWindow()
    win?.close()
  })

  ipcMain.handle('window:is-maximized', () => {
    const win = BrowserWindow.getFocusedWindow()
    return win?.isMaximized() ?? false
  })

  // ── Discord Rich Presence ──

  ipcMain.handle('discord:status', () => getDiscordPresenceStatus())

  ipcMain.handle('discord:set-enabled', (_event, enabled: boolean) => {
    setDiscordPresenceEnabled(Boolean(enabled))
    return getDiscordPresenceStatus()
  })

  ipcMain.handle('discord:set-client-id', async (_event, clientId: string) => {
    const result = await setDiscordClientId(String(clientId || ''))
    return { ...result, ...getDiscordPresenceStatus() }
  })

  ipcMain.handle('discord:update', async (_event, payload: DiscordPresencePayload) => {
    await updateDiscordPresence(payload)
    return { success: true }
  })

  ipcMain.handle('discord:clear', async () => {
    await clearDiscordPresence()
    return { success: true }
  })
}
