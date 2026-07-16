import { safeStorage } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

interface StoredTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const TOKEN_FILE = 'auth-tokens.enc'

function getTokenPath(): string {
  const dir = join(app.getPath('userData'), 'auth')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, TOKEN_FILE)
}

/**
 * Save OAuth tokens securely using Electron's safeStorage encryption.
 */
export function saveTokens(accessToken: string, refreshToken: string, expiresIn: number): void {
  const data: StoredTokens = {
    accessToken,
    refreshToken,
    expiresAt: Date.now() + expiresIn * 1000
  }

  const jsonString = JSON.stringify(data)

  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(jsonString)
    writeFileSync(getTokenPath(), encrypted)
  } else {
    // Fallback: store as base64 (not truly secure, but functional)
    const encoded = Buffer.from(jsonString).toString('base64')
    writeFileSync(getTokenPath(), encoded, 'utf-8')
  }
}

/**
 * Load stored tokens. Returns null if no tokens exist or decryption fails.
 */
export function loadTokens(): StoredTokens | null {
  const tokenPath = getTokenPath()

  if (!existsSync(tokenPath)) {
    return null
  }

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = readFileSync(tokenPath)
      const decrypted = safeStorage.decryptString(encrypted)
      return JSON.parse(decrypted) as StoredTokens
    } else {
      const encoded = readFileSync(tokenPath, 'utf-8')
      const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
      return JSON.parse(decoded) as StoredTokens
    }
  } catch {
    return null
  }
}

/**
 * Get the current access token. Returns null if expired or not available.
 */
export function getAccessToken(): string | null {
  const tokens = loadTokens()
  if (!tokens) return null

  // Check if token is expired (with 60s buffer)
  if (Date.now() >= tokens.expiresAt - 60_000) {
    return null
  }

  return tokens.accessToken
}

/**
 * Get the stored refresh token.
 */
export function getRefreshToken(): string | null {
  const tokens = loadTokens()
  return tokens?.refreshToken ?? null
}

/**
 * Check if access token is expired.
 */
export function isTokenExpired(): boolean {
  const tokens = loadTokens()
  if (!tokens) return true
  return Date.now() >= tokens.expiresAt - 60_000
}

/**
 * Clear all stored tokens (logout).
 */
export function clearTokens(): void {
  const tokenPath = getTokenPath()
  if (existsSync(tokenPath)) {
    writeFileSync(tokenPath, '')
    try {
      unlinkSync(tokenPath)
    } catch {
      // Ignore cleanup errors
    }
  }
}
