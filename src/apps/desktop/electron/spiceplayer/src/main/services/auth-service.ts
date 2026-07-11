import { BrowserWindow, shell } from 'electron'
import { randomBytes, createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { getRedirectUri, setAuthCallbackHandler } from '../protocol'
import {
  saveTokens,
  clearTokens,
  getAccessToken,
  isTokenExpired,
  getRefreshToken
} from './token-store'

// SoundCloud OAuth 2.1 endpoints
const SC_AUTH_URL = 'https://secure.soundcloud.com/authorize'
const SC_TOKEN_URL = 'https://secure.soundcloud.com/oauth/token'
const SC_API_URL = 'https://api.soundcloud.com'

function readLocalEnv(name: string): string {
  const envPath = join(process.cwd(), '.env')
  if (!existsSync(envPath)) return ''
  const line = readFileSync(envPath, 'utf-8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`))
  return line
    ? line
        .slice(line.indexOf('=') + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '')
    : ''
}

// Production uses OS environment variables. The local .env fallback keeps
// development credentials out of the renderer process and source control.
const clientId = process.env.SOUNDCLOUD_CLIENT_ID || readLocalEnv('SOUNDCLOUD_CLIENT_ID')
const clientSecret =
  process.env.SOUNDCLOUD_CLIENT_SECRET || readLocalEnv('SOUNDCLOUD_CLIENT_SECRET')

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

/**
 * Generate PKCE code verifier and challenge (SHA-256).
 */
function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .substring(0, 128)

  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')

  return { codeVerifier, codeChallenge }
}

/**
 * Start the OAuth 2.1 Authorization Code flow with PKCE.
 * Opens the SoundCloud login page in the user's default browser.
 */
export function startAuthFlow(): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!clientId) {
      reject(
        new Error(
          'SoundCloud client_id not configured. Set SOUNDCLOUD_CLIENT_ID environment variable.'
        )
      )
      return
    }

    if (!clientSecret) {
      reject(new Error('SoundCloud client secret not configured. Set SOUNDCLOUD_CLIENT_SECRET.'))
      return
    }

    const { codeVerifier, codeChallenge } = generatePKCE()
    const redirectUri = getRedirectUri()
    const state = randomBytes(16).toString('hex')

    const authUrl = new URL(SC_AUTH_URL)
    authUrl.searchParams.set('client_id', clientId)
    authUrl.searchParams.set('redirect_uri', redirectUri)
    authUrl.searchParams.set('response_type', 'code')
    authUrl.searchParams.set('code_challenge', codeChallenge)
    authUrl.searchParams.set('code_challenge_method', 'S256')
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('scope', 'non-expiring')

    // Set up the callback handler
    setAuthCallbackHandler(async (callbackUrl: string) => {
      try {
        const url = new URL(callbackUrl)
        const code = url.searchParams.get('code')
        const returnedState = url.searchParams.get('state')
        const error = url.searchParams.get('error')

        if (error) {
          reject(new Error(`OAuth error: ${error}`))
          return
        }

        if (returnedState !== state) {
          reject(new Error('OAuth state mismatch — possible CSRF attack.'))
          return
        }

        if (!code) {
          reject(new Error('No authorization code received.'))
          return
        }

        // Exchange code for tokens
        const success = await exchangeCodeForTokens(code, codeVerifier, redirectUri)
        resolve(success)
      } catch (err) {
        reject(err)
      }
    })

    // Open the authorization URL in the default browser
    void shell.openExternal(authUrl.toString()).catch(reject)
  })
}

/**
 * Exchange the authorization code for access and refresh tokens.
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string
): Promise<boolean> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    code,
    code_verifier: codeVerifier,
    redirect_uri: redirectUri
  })

  const response = await fetch(SC_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params.toString()
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Token exchange failed (${response.status}): ${errorBody}`)
  }

  const data = await response.json()
  const { access_token, refresh_token, expires_in } = data

  saveTokens(access_token, refresh_token, expires_in)
  return true
}

/**
 * Refresh the access token using the stored refresh token.
 */
export async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken()
  if (!refreshToken) {
    return false
  }

  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    })

    const response = await fetch(SC_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      },
      body: params.toString()
    })

    if (!response.ok) {
      clearTokens()
      return false
    }

    const data = await response.json()
    saveTokens(data.access_token, data.refresh_token, data.expires_in)
    return true
  } catch {
    return false
  }
}

/**
 * Get a valid access token, refreshing if necessary.
 */
export async function getValidAccessToken(): Promise<string | null> {
  let token = getAccessToken()
  if (token) return token

  // Token is expired, try to refresh
  if (isTokenExpired() && getRefreshToken()) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      token = getAccessToken()
      return token
    }
  }

  return null
}

/**
 * Get the current authentication status.
 */
export async function getAuthStatus(): Promise<AuthStatus> {
  const token = await getValidAccessToken()

  if (!token) {
    return { isAuthenticated: false, user: null }
  }

  try {
    const response = await fetch(`${SC_API_URL}/me`, {
      headers: {
        Authorization: `OAuth ${token}`,
        Accept: 'application/json'
      }
    })

    if (!response.ok) {
      if (response.status === 401) {
        clearTokens()
      }
      return { isAuthenticated: false, user: null }
    }

    const user = (await response.json()) as UserProfile
    return { isAuthenticated: true, user }
  } catch {
    return { isAuthenticated: false, user: null }
  }
}

/**
 * Logout — clear all stored tokens.
 */
export function logout(): void {
  clearTokens()
}

/**
 * Notify all renderer windows about auth state changes.
 */
export function broadcastAuthState(status: AuthStatus): void {
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    win.webContents.send('auth:state-changed', status)
  }
}
