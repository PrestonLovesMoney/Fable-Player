import { BrowserWindow, shell } from 'electron'
import { getRedirectUri, setAuthCallbackHandler } from '../protocol'
import { clearTokens, getAccessToken, saveTokens } from './token-store'

// This is intentionally not a secret. SoundCloud credentials live only on the
// backend; deployments may override the address without rebuilding the app.
const SERVER_URL = (process.env.FABLE_SERVER_URL || 'http://16.16.74.196:3000').replace(/\/$/, '')

export interface UserProfile {
  id: number
  username: string
  avatar_url: string
  permalink_url: string
  full_name: string
}

export interface AuthStatus {
  isAuthenticated: boolean
  user: UserProfile | null
}

interface LoginResponse {
  url: string
  state: string
}

interface CallbackResponse {
  success: boolean
  token: string
  expiresIn?: string | number
  error?: string
}

function parseExpiresIn(value: string | number | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  const match = typeof value === 'string' ? /^(\d+)\s*([smhd])$/i.exec(value) : null
  if (!match) return 7 * 24 * 60 * 60

  const multiplier = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 }[match[2].toLowerCase()]
  return Number(match[1]) * (multiplier ?? 7 * 24 * 60 * 60)
}

async function serverFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${SERVER_URL}${path}`, {
    ...options,
    headers: { Accept: 'application/json', ...options.headers }
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Server request failed (${response.status}): ${body}`)
  }

  return response.json() as Promise<T>
}

/** Starts OAuth through the backend, which owns the SoundCloud credentials. */
export async function startAuthFlow(): Promise<boolean> {
  const redirectUri = getRedirectUri()
  const login = await serverFetch<LoginResponse>(
    `/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`
  )

  if (!login.url || !login.state) {
    throw new Error('The server returned an invalid OAuth login response.')
  }

  setAuthCallbackHandler(async (callbackUrl: string) => {
    const callback = new URL(callbackUrl)
    const error = callback.searchParams.get('error')
    const code = callback.searchParams.get('code')
    const state = callback.searchParams.get('state')

    if (error) throw new Error(`OAuth error: ${error}`)
    if (!code || !state) throw new Error('No authorization code received.')

    const result = await serverFetch<CallbackResponse>(
      `/auth/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    )
    if (!result.success || !result.token) {
      throw new Error(result.error || 'The server did not issue an authentication token.')
    }

    // This is a short-lived backend JWT, never a SoundCloud access token.
    saveTokens(result.token, '', parseExpiresIn(result.expiresIn))
    const status = await getAuthStatus()
    broadcastAuthState(status)
  })

  await shell.openExternal(login.url)
  return true
}

/** The backend refreshes SoundCloud credentials internally. */
export async function refreshAccessToken(): Promise<boolean> {
  return false
}

/** Returns the backend JWT used for all API calls. */
export async function getValidAccessToken(): Promise<string | null> {
  return getAccessToken()
}

/** Gets the current user from the backend session. */
export async function getAuthStatus(): Promise<AuthStatus> {
  const token = await getValidAccessToken()
  if (!token) return { isAuthenticated: false, user: null }

  try {
    return await serverFetch<AuthStatus>('/auth/status', {
      headers: { Authorization: `Bearer ${token}` }
    })
  } catch {
    clearTokens()
    return { isAuthenticated: false, user: null }
  }
}

/** Logs out the backend session and removes the local JWT. */
export async function logout(): Promise<void> {
  const token = await getValidAccessToken()
  try {
    if (token) {
      await serverFetch<{ success: boolean }>('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      })
    }
  } finally {
    clearTokens()
  }
}

export function broadcastAuthState(status: AuthStatus): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('auth:state-changed', status)
  }
}
