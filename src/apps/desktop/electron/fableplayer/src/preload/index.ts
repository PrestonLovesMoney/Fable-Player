import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Fable Player API exposed to renderer
const fableAPI = {
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
    getRecommendations: (
      seedsOrTrack: unknown,
      options?: { excludeIds?: number[]; limit?: number }
    ) => {
      if (
        seedsOrTrack &&
        typeof seedsOrTrack === 'object' &&
        !Array.isArray(seedsOrTrack) &&
        'seeds' in (seedsOrTrack as object)
      ) {
        return ipcRenderer.invoke('sc:recommendations', seedsOrTrack)
      }
      if (Array.isArray(seedsOrTrack)) {
        return ipcRenderer.invoke('sc:recommendations', {
          seeds: seedsOrTrack,
          excludeIds: options?.excludeIds,
          limit: options?.limit
        })
      }
      return ipcRenderer.invoke('sc:recommendations', seedsOrTrack)
    },
    getNewReleases: (params?: { genres?: string[]; limit?: number }) =>
      ipcRenderer.invoke('sc:new-releases', params || {}),
    getTrending: (params?: { genres?: string[]; limit?: number }) =>
      ipcRenderer.invoke('sc:trending', params || {}),
    getPlaylist: (playlistId: number) => ipcRenderer.invoke('sc:playlist', playlistId),
    createPlaylist: (params: {
      title: string
      trackIds?: number[]
      sharing?: 'public' | 'private'
    }) => ipcRenderer.invoke('sc:create-playlist', params),
    updatePlaylistTracks: (playlistId: number, trackIds: number[]) =>
      ipcRenderer.invoke('sc:update-playlist-tracks', { playlistId, trackIds })
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
  },

  // ── Discord Rich Presence ──
  discord: {
    getStatus: () => ipcRenderer.invoke('discord:status'),
    setEnabled: (enabled: boolean) => ipcRenderer.invoke('discord:set-enabled', enabled),
    setClientId: (clientId: string) => ipcRenderer.invoke('discord:set-client-id', clientId),
    updatePresence: (payload: {
      title: string
      artist: string
      artworkUrl?: string | null
      durationMs?: number
      positionMs?: number
      isPlaying: boolean
      permalinkUrl?: string | null
    }) => ipcRenderer.invoke('discord:update', payload),
    clearPresence: () => ipcRenderer.invoke('discord:clear')
  }
}

// Use `contextBridge` APIs to expose Electron APIs to renderer
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('fableAPI', fableAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.fableAPI = fableAPI
}
