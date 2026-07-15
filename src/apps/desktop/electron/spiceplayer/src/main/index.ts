import { app, shell, BrowserWindow, net, protocol } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { registerProtocol, handleProtocolUrl } from './protocol'
import { registerIpcHandlers } from './ipc-handlers'
import { getAuthStatus, broadcastAuthState } from './services/auth-service'
import { destroyDiscordPresence, initDiscordPresence } from './services/discord-rpc'

// Register custom protocol before app is ready
registerProtocol()
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'fableplayer-media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false, // Frameless for custom title bar
    titleBarStyle: 'hidden',
    autoHideMenuBar: true,
    backgroundColor: '#0A0A0A',
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Broadcast maximize/unmaximize state to renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-changed', false)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer based on electron-vite cli
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Handle the protocol URL on Windows/Linux (single instance lock)
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    // Windows: the protocol URL is in the command line args
    const url = commandLine.find((arg) => arg.startsWith('fableplayer://'))
    if (url) {
      handleProtocolUrl(url)
    }

    // Focus the main window
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(async () => {
    // Set app user model id for Windows
    electronApp.setAppUserModelId('com.fableplayer.app')
    if (process.platform === 'win32') {
      app.setAppUserModelId('com.fableplayer.app')
    }

    // SoundCloud's CDN can reject direct renderer image requests. Fetch the
    // image in the trusted main process and expose only SoundCloud CDN assets.
    protocol.handle('fableplayer-media', async (request) => {
      const source = new URL(request.url).searchParams.get('url')
      if (!source) return new Response('Missing image URL', { status: 400 })

      const imageUrl = new URL(source)
      if (imageUrl.protocol !== 'https:' || !imageUrl.hostname.endsWith('sndcdn.com')) {
        return new Response('Unsupported image host', { status: 403 })
      }
      return net.fetch(imageUrl.toString(), {
        headers: { Referer: 'https://soundcloud.com/', Accept: 'image/avif,image/webp,image/*,*/*' }
      })
    })

    // Default open or close DevTools by F12 in development
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // Register IPC handlers
    registerIpcHandlers()
    initDiscordPresence()

    // On Windows a callback can launch this first instance directly, before the
    // `second-instance` event is available.
    const initialProtocolUrl = process.argv.find((arg) => arg.startsWith('fableplayer://'))
    if (initialProtocolUrl) handleProtocolUrl(initialProtocolUrl)

    // Create the main window
    createWindow()

    // Check auth status on startup and broadcast to renderer
    try {
      const status = await getAuthStatus()
      setTimeout(() => broadcastAuthState(status), 1000)
    } catch {
      // Auth check failed, user will need to login
    }

    app.on('activate', function () {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })

  // Handle protocol URL on macOS
  app.on('open-url', (_event, url) => {
    handleProtocolUrl(url)
  })

  app.on('window-all-closed', () => {
    destroyDiscordPresence()
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
}
