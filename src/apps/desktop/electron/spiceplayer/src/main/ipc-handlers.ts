import { ipcMain, BrowserWindow, shell } from 'electron'
import { startAuthFlow, getAuthStatus, logout, broadcastAuthState } from './services/auth-service'
import {
  getMe,
  getUserPlaylists,
  getLikedTracks,
  getUserTracks,
  getRelatedTracks,
  searchTracks,
  getStreamUrl,
  getPlaylist
} from './services/soundcloud-client'

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
    logout()
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
    async (_event, track: Parameters<typeof getRelatedTracks>[0]) => {
      try {
        return await getRelatedTracks(track)
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
}
