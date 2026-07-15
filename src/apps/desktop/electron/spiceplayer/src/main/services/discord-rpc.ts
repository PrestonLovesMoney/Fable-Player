import { Client } from '@xhayper/discord-rpc'
import { ActivityType } from 'discord-api-types/v10'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface DiscordPresencePayload {
  title: string
  artist: string
  artworkUrl?: string | null
  durationMs?: number
  positionMs?: number
  isPlaying: boolean
  permalinkUrl?: string | null
}

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

let client: Client | null = null
let clientId = process.env.DISCORD_CLIENT_ID || readLocalEnv('DISCORD_CLIENT_ID') || ''
let enabled = true
let ready = false
let connecting = false
let lastPayload: DiscordPresencePayload | null = null
let lastAppliedKey = ''

function normalizeArtwork(url?: string | null): string | undefined {
  if (!url) return undefined
  return url.replace('http://', 'https://').replace('-large.', '-t500x500.')
}

function presenceKey(payload: DiscordPresencePayload): string {
  return [
    payload.title,
    payload.artist,
    payload.isPlaying ? '1' : '0',
    Math.floor((payload.positionMs ?? 0) / 5000),
    payload.artworkUrl || '',
    payload.permalinkUrl || ''
  ].join('|')
}

export function getDiscordPresenceStatus(): {
  enabled: boolean
  connected: boolean
  clientId: string
  hasClientId: boolean
} {
  return {
    enabled,
    connected: ready,
    clientId,
    hasClientId: Boolean(clientId)
  }
}

export function setDiscordPresenceEnabled(next: boolean): void {
  enabled = next
  if (!enabled) {
    void clearDiscordPresence()
    return
  }
  void ensureDiscordClient()
  if (lastPayload) void updateDiscordPresence(lastPayload, true)
}

export async function setDiscordClientId(nextClientId: string): Promise<{
  success: boolean
  error?: string
}> {
  const trimmed = nextClientId.trim()
  if (trimmed && !/^\d{17,20}$/.test(trimmed)) {
    return { success: false, error: 'Client ID must be a Discord Application ID (17–20 digits).' }
  }

  clientId = trimmed
  ready = false
  connecting = false
  lastAppliedKey = ''

  if (client) {
    try {
      client.destroy()
    } catch {
      // ignore
    }
    client = null
  }

  if (!clientId || !enabled) {
    return { success: true }
  }

  try {
    await ensureDiscordClient()
    if (lastPayload) await updateDiscordPresence(lastPayload, true)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to connect to Discord'
    }
  }
}

async function ensureDiscordClient(): Promise<boolean> {
  if (!enabled || !clientId) return false
  if (ready && client) return true
  if (connecting) return false

  connecting = true
  try {
    client = new Client({ clientId })
    client.on('ready', () => {
      ready = true
      connecting = false
      if (lastPayload) void applyPresence(lastPayload)
    })
    client.on('disconnected', () => {
      ready = false
    })
    await client.login()
    return true
  } catch (error) {
    ready = false
    connecting = false
    client = null
    console.warn('[discord-rpc] connection failed:', error)
    return false
  }
}

async function applyPresence(payload: DiscordPresencePayload): Promise<void> {
  if (!enabled || !client?.user || !ready) return

  if (!payload.isPlaying) {
    await client.user.clearActivity()
    return
  }

  const now = Date.now()
  const positionMs = Math.max(0, payload.positionMs ?? 0)
  const durationMs = Math.max(0, payload.durationMs ?? 0)
  const startTimestamp = now - positionMs
  const endTimestamp = durationMs > 0 ? startTimestamp + durationMs : undefined
  const artwork = normalizeArtwork(payload.artworkUrl)

  const activity: Parameters<NonNullable<typeof client.user>['setActivity']>[0] = {
    name: 'Fable Player',
    type: ActivityType.Listening,
    details: payload.title.slice(0, 128) || 'Unknown track',
    state: payload.artist ? `by ${payload.artist}`.slice(0, 128) : 'Unknown artist',
    startTimestamp,
    largeImageKey: artwork || 'logo',
    largeImageText: 'Fable Player'
  }

  if (endTimestamp) activity.endTimestamp = endTimestamp

  if (payload.permalinkUrl?.startsWith('https://soundcloud.com')) {
    activity.buttons = [{ label: 'Open on SoundCloud', url: payload.permalinkUrl }]
  }

  await client.user.setActivity(activity)
}

export async function updateDiscordPresence(
  payload: DiscordPresencePayload,
  force = false
): Promise<void> {
  lastPayload = payload

  if (!enabled || !clientId) return

  const key = presenceKey(payload)
  if (!force && key === lastAppliedKey) return
  lastAppliedKey = key

  const connected = await ensureDiscordClient()
  if (!connected || !ready) return

  try {
    await applyPresence(payload)
  } catch (error) {
    console.warn('[discord-rpc] failed to update presence:', error)
  }
}

export async function clearDiscordPresence(): Promise<void> {
  lastPayload = null
  lastAppliedKey = ''
  if (!client?.user || !ready) return
  try {
    await client.user.clearActivity()
  } catch {
    // ignore
  }
}

export function destroyDiscordPresence(): void {
  ready = false
  connecting = false
  lastPayload = null
  lastAppliedKey = ''
  if (client) {
    try {
      client.destroy()
    } catch {
      // ignore
    }
    client = null
  }
}

/** Soft-start: connect once Discord is available, without blocking app boot. */
export function initDiscordPresence(): void {
  if (!enabled || !clientId) return
  void ensureDiscordClient()
}
