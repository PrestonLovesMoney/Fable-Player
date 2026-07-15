import { app } from 'electron'
import { resolve } from 'path'

const PROTOCOL = 'fableplayer'

let authCallbackHandler: ((url: string) => void) | null = null

/**
 * Register the custom protocol `fableplayer://` for OAuth callbacks.
 * Must be called before app.whenReady().
 */
export function registerProtocol(): void {
  if (process.defaultApp) {
    if (process.argv.length >= 2 && process.argv[1]) {
      const absoluteAppPath = resolve(process.argv[1])
      app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [absoluteAppPath])
    }
  } else {
    app.setAsDefaultProtocolClient(PROTOCOL)
  }
}

/**
 * Set a handler for incoming OAuth callback URLs.
 */
export function setAuthCallbackHandler(handler: (url: string) => void): void {
  authCallbackHandler = handler
}

/**
 * Handle the protocol URL (called from second-instance or open-url events).
 * Extracts the authorization code from the callback URL.
 */
export function handleProtocolUrl(url: string): void {
  if (url.startsWith(`${PROTOCOL}://callback`)) {
    authCallbackHandler?.(url)
  }
}

/**
 * Get the redirect URI for OAuth.
 */
export function getRedirectUri(): string {
  return `${PROTOCOL}://callback`
}
