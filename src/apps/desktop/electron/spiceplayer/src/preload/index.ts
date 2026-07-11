import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// SpicePlayer API exposed to renderer
const spiceAPI = {
  // ── Auth ──
  auth: {
    login: () => ipcRenderer.invoke('auth:login'),
    logout: () => ipcRenderer.invoke('auth:logout'),
    getStatus: () => ipcRenderer.invoke('auth:status'),
    onAuthStateChanged: (
      callback: (status: { isAuthenticated: boolean; user: unknown }) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        status: { isAuthenticated: boolean; user: unknown }
      ): void => {
        callback(status)
      }
      ipcRenderer.on('auth:state-changed', handler)
      return () => {
        ipcRenderer.removeListener('auth:state-changed', handler)
      }
    }
  },

  // ── SoundCloud ──
  soundcloud: {
    getMe: () => ipcRenderer.invoke('sc:me'),
    getPlaylists: (params?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('sc:playlists', params || {}),
    getLikedTracks: (params?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('sc:liked-tracks', params || {}),
    getMyTracks: (params?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('sc:my-tracks', params || {}),
    search: (query: string, limit?: number) => ipcRenderer.invoke('sc:search', { query, limit }),
    getStreamUrl: (trackId: number) => ipcRenderer.invoke('sc:stream-url', trackId),
    getRecommendations: (track: unknown) => ipcRenderer.invoke('sc:recommendations', track),
    getPlaylist: (playlistId: number) => ipcRenderer.invoke('sc:playlist', playlistId)
  },

  // ── Window Controls ──
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
    onMaximizedChanged: (callback: (isMaximized: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, isMaximized: boolean): void => {
        callback(isMaximized)
      }
      ipcRenderer.on('window:maximized-changed', handler)
      return () => {
        ipcRenderer.removeListener('window:maximized-changed', handler)
      }
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('spiceAPI', spiceAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.spiceAPI = spiceAPI
}
