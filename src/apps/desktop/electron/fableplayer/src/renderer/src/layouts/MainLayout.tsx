import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Hls from 'hls.js'
import './MainLayout.css'

interface UserProfile {
  id: number
  username: string
  avatar_url: string
  permalink_url: string
  full_name: string
}

interface MainLayoutProps {
  user: UserProfile | null
  onLogout: () => void
}

interface SCTrack {
  id: number
  urn?: string
  title: string
  user: { username: string; avatar_url?: string }
  artwork_url: string | null
  duration: number
  genre?: string
  created_at?: string
  playback_count?: number
  likes_count?: number
  permalink_url?: string
}

interface SCPlaylist {
  id: number
  title: string
  artwork_url: string | null
  track_count: number
  tracks: SCTrack[]
  isLocal?: boolean
  synced?: boolean
}

type RepeatMode = 'off' | 'all' | 'one'
type ActiveTab =
  | 'home'
  | 'trending'
  | 'new-releases'
  | 'for-you'
  | 'search'
  | 'likes'
  | 'playlist'
  | 'history'
  | 'downloads'
  | 'settings'
type UiDensity = 'comfortable' | 'compact'

interface AppCustomization {
  accentPreset: string
  customAccent: string
  density: UiDensity
  reduceMotion: boolean
  showQueueByDefault: boolean
  compactPlayer: boolean
  discordPresence: boolean
  discordClientId: string
}

const DEFAULT_CUSTOMIZATION: AppCustomization = {
  accentPreset: 'Bronze',
  customAccent: '#8B7355',
  density: 'comfortable',
  reduceMotion: false,
  showQueueByDefault: true,
  compactPlayer: false,
  discordPresence: true,
  discordClientId: ''
}

const LOCAL_PLAYLISTS_KEY = 'fable-local-playlists'
const CUSTOMIZATION_KEY = 'fable-customization'
const RECENT_KEY = 'fable-recently-played'

// ── Genre color map for playlist icons ──
const PLAYLIST_COLORS = [
  '#8B7355', '#6B8E5A', '#C49B4A', '#7A8899', '#A07060',
  '#5A7A8E', '#8E5A7A', '#5A8E6B', '#8E8A5A', '#6B5A8E'
]

// ── Accent color presets for Settings ──
const ACCENT_PRESETS = [
  { name: 'Bronze', color: '#8B7355', darkColor: '#DEC4A6' },
  { name: 'Violet', color: '#7C5CFC', darkColor: '#A78BFA' },
  { name: 'Rose', color: '#E84393', darkColor: '#F472B6' },
  { name: 'Ocean', color: '#0984E3', darkColor: '#60A5FA' },
  { name: 'Emerald', color: '#00B894', darkColor: '#34D399' },
  { name: 'Sunset', color: '#E17055', darkColor: '#FB923C' }
]

const loadJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

// Fisher-Yates shuffle (pure function)
const shuffleArray = <T,>(arr: T[]): T[] => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

export default function MainLayout({ user, onLogout }: MainLayoutProps): React.JSX.Element {
  // ── Data ──
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([])
  const [likedTracks, setLikedTracks] = useState<SCTrack[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SCTrack[]>([])
  const [recommendations, setRecommendations] = useState<SCTrack[]>([])
  const [newReleases, setNewReleases] = useState<SCTrack[]>([])
  const [trendingTracks, setTrendingTracks] = useState<SCTrack[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('home')
  const [activePlaylist, setActivePlaylist] = useState<SCPlaylist | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)
  const [feedsLoading, setFeedsLoading] = useState(false)

  // ── Playlist creation / add-to-playlist ──
  const [showCreatePlaylist, setShowCreatePlaylist] = useState(false)
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('')
  const [creatingPlaylist, setCreatingPlaylist] = useState(false)
  const [addToPlaylistTrack, setAddToPlaylistTrack] = useState<SCTrack | null>(null)
  const [playlistToast, setPlaylistToast] = useState<string | null>(null)
  /* Uncomment when implementing Discord Rich Presence UI
  const [discordStatus, setDiscordStatus] = useState<{
    enabled: boolean
    connected: boolean
    clientId: string
    hasClientId: boolean
  } | null>(null)
  const [discordClientIdDraft, setDiscordClientIdDraft] = useState('')
  const [discordBusy, setDiscordBusy] = useState(false)
  */

  // ── Customization ──
  const [customization, setCustomization] = useState<AppCustomization>(() => {
    const saved = loadJson<Partial<AppCustomization>>(CUSTOMIZATION_KEY, {})
    const legacyAccent = localStorage.getItem('fable-accent')
    return {
      ...DEFAULT_CUSTOMIZATION,
      ...saved,
      customAccent: saved.customAccent || legacyAccent || DEFAULT_CUSTOMIZATION.customAccent
    }
  })

  // ── Recently Played ──
  const [recentlyPlayed, setRecentlyPlayed] = useState<SCTrack[]>(() =>
    loadJson<SCTrack[]>(RECENT_KEY, []).slice(0, 50)
  )

  // ── Queue Panel Visibility ──
  const [showQueue, setShowQueue] = useState(() => customization.showQueueByDefault)

  // ── Hero Banner ──
  const [heroBannerIndex, setHeroBannerIndex] = useState(0)

  // ── Playback State ──
  const [currentTrack, setCurrentTrack] = useState<SCTrack | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [trackDuration, setTrackDuration] = useState(0)
  const [playbackError, setPlaybackError] = useState<string | null>(null)

  // ── Queue & Controls ──
  const [queue, setQueue] = useState<SCTrack[]>([])
  const [queueIndex, setQueueIndex] = useState(-1)
  const [volume, setVolume] = useState(0.7)
  const [isMuted, setIsMuted] = useState(false)
  const [shuffleOn, setShuffleOn] = useState(false)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>('off')

  // ── Liked state for player bar ──
  const [likedTrackIds, setLikedTrackIds] = useState<Set<number>>(new Set())

  // ── Drag state ──
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [isDraggingVolume, setIsDraggingVolume] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const volumeBarRef = useRef<HTMLDivElement>(null)

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const playbackRequestRef = useRef(0)
  const queueBeforeShuffleRef = useRef<SCTrack[] | null>(null)
  const repeatModeRef = useRef<RepeatMode>('off')
  const playNextTrackRef = useRef<() => void>(() => undefined)
  const recScrollRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fallbackArtwork = 'https://a-v2.sndcdn.com/assets/images/default_avatar_large-5d20da0.png'

  // ── Helpers ──
  const mediaUrl = (url: string): string =>
    `fableplayer-media://image?url=${encodeURIComponent(url.replace('http://', 'https://'))}`

  const artworkFor = (track: SCTrack): string => {
    const artwork = track.artwork_url || track.user.avatar_url || fallbackArtwork
    return mediaUrl(artwork.replace('-large.', '-t500x500.'))
  }

  const artworkSmall = (track: SCTrack): string => {
    const artwork = track.artwork_url || track.user.avatar_url || fallbackArtwork
    return mediaUrl(artwork.replace('-large.', '-t200x200.'))
  }

  const useFallbackArtwork = (event: React.SyntheticEvent<HTMLImageElement>): void => {
    const img = event.currentTarget
    const fb = mediaUrl(fallbackArtwork)
    if (!img.src.includes(encodeURIComponent(fallbackArtwork))) {
      img.src = fb
    }
  }

  const formatTime = (seconds: number): string => {
    const total = Math.max(0, Math.floor(seconds))
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
  }

  const showError = (msg: string): void => {
    setPlaybackError(msg)
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current)
    errorTimerRef.current = setTimeout(() => setPlaybackError(null), 4000)
  }

  // ── Genre Analysis from listening history ──
  const topGenres = useMemo(() => {
    const genreCount: Record<string, number> = {}
    const trackPool = [...recentlyPlayed, ...likedTracks]
    for (const track of trackPool) {
      const genre = track.genre?.toLowerCase().trim()
      if (genre) {
        genreCount[genre] = (genreCount[genre] || 0) + 1
      }
    }
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([genre]) => genre)
  }, [recentlyPlayed, likedTracks])

  // ── Hero Banner Data (based on top genres) ──
  const heroBanners = useMemo(() => {
    const banners = topGenres.slice(0, 3).map((genre) => {
      const genreTitle = genre.charAt(0).toUpperCase() + genre.slice(1)
      const tracksInGenre = [...recentlyPlayed, ...likedTracks].filter(
        (t) => t.genre?.toLowerCase().trim() === genre
      )
      return {
        title: `${genreTitle} Drift`,
        subtitle: `The best ${genre} tracks right now.`,
        badge: 'TRENDING',
        tracks: tracksInGenre.slice(0, 10),
        backgroundTrack: tracksInGenre[0] || null
      }
    })
    if (banners.length === 0) {
      banners.push({
        title: 'Discover New Music',
        subtitle: 'Start listening to get personalized recommendations.',
        badge: 'FOR YOU',
        tracks: likedTracks.slice(0, 10),
        backgroundTrack: likedTracks[0] || null
      })
    }
    return banners
  }, [topGenres, recentlyPlayed, likedTracks])

  // Auto-rotate hero banner
  useEffect(() => {
    if (heroBanners.length <= 1 || customization.reduceMotion) return
    const interval = setInterval(() => {
      setHeroBannerIndex((prev) => (prev + 1) % heroBanners.length)
    }, 8000)
    return () => clearInterval(interval)
  }, [heroBanners.length, customization.reduceMotion])

  // ── Add to recently played ──
  const addToRecentlyPlayed = useCallback((track: SCTrack) => {
    setRecentlyPlayed((prev) => {
      const filtered = prev.filter((t) => t.id !== track.id)
      return [track, ...filtered].slice(0, 50)
    })
  }, [])

  // ── Track liked IDs ──
  useEffect(() => {
    setLikedTrackIds(new Set(likedTracks.map((t) => t.id)))
  }, [likedTracks])

  // ── Persist recently played ──
  useEffect(() => {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentlyPlayed.slice(0, 50)))
  }, [recentlyPlayed])

  const applyAccentToDom = useCallback((accent: string) => {
    const roots = [document.documentElement, document.body]
    for (const el of roots) {
      el.style.setProperty('--color-accent', accent)
      el.style.setProperty('--color-accent-hover', accent + 'dd')
      el.style.setProperty('--color-accent-active', accent + 'bb')
      el.style.setProperty('--color-accent-glow', accent + '26')
    }
  }, [])

  const resolveAccent = useCallback((settings: AppCustomization): string => {
    const isDark = document.documentElement.classList.contains('dark-theme')
    const preset = ACCENT_PRESETS.find((p) => p.name === settings.accentPreset)
    if (settings.accentPreset === 'Custom' || !preset) return settings.customAccent
    return isDark ? preset.darkColor : preset.color
  }, [])

  // ── Customization application ──
  useEffect(() => {
    localStorage.setItem(CUSTOMIZATION_KEY, JSON.stringify(customization))
    localStorage.setItem('fable-accent', customization.customAccent)

    applyAccentToDom(resolveAccent(customization))

    document.documentElement.dataset.density = customization.density
    document.documentElement.dataset.compactPlayer = String(customization.compactPlayer)
    document.documentElement.classList.toggle('reduce-motion', customization.reduceMotion)
    document.body.classList.toggle('reduce-motion', customization.reduceMotion)
  }, [customization, applyAccentToDom, resolveAccent])

  // Re-apply accent when theme class flips (title bar toggle)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      applyAccentToDom(resolveAccent(customization))
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [customization, applyAccentToDom, resolveAccent])

  const updateCustomization = (patch: Partial<AppCustomization>): void => {
    setCustomization((prev) => ({ ...prev, ...patch }))
  }

  const handleAccentPreset = (presetName: string): void => {
    const preset = ACCENT_PRESETS.find((p) => p.name === presetName)
    if (!preset) return
    updateCustomization({ accentPreset: preset.name, customAccent: preset.color })
  }

  const handleCustomAccent = (color: string): void => {
    updateCustomization({ accentPreset: 'Custom', customAccent: color })
  }

  const showPlaylistToast = (msg: string): void => {
    setPlaylistToast(msg)
    window.setTimeout(() => setPlaylistToast(null), 2800)
  }

  const mergePlaylists = useCallback((remote: SCPlaylist[], local: SCPlaylist[]): SCPlaylist[] => {
    const byId = new Map<number, SCPlaylist>()
    for (const pl of remote) byId.set(pl.id, { ...pl, isLocal: false, synced: true })
    for (const pl of local) {
      if (pl.synced && pl.id > 0 && byId.has(pl.id)) continue
      byId.set(pl.id, pl)
    }
    return Array.from(byId.values()).sort((a, b) => {
      if (a.isLocal && !b.isLocal) return -1
      if (!a.isLocal && b.isLocal) return 1
      return a.title.localeCompare(b.title)
    })
  }, [])

  const persistLocalPlaylists = useCallback((list: SCPlaylist[]) => {
    const localOnly = list.filter((pl) => pl.isLocal || !pl.synced)
    localStorage.setItem(LOCAL_PLAYLISTS_KEY, JSON.stringify(localOnly))
  }, [])

  const toggleLikeTrack = useCallback((track: SCTrack, e?: React.MouseEvent): void => {
    e?.stopPropagation()
    setLikedTrackIds((prev) => {
      const next = new Set(prev)
      if (next.has(track.id)) {
        next.delete(track.id)
        setLikedTracks((prevList) => prevList.filter((t) => t.id !== track.id))
      } else {
        next.add(track.id)
        setLikedTracks((prevList) => {
          if (prevList.some((t) => t.id === track.id)) return prevList
          return [track, ...prevList]
        })
      }
      return next
    })
  }, [])

  const toggleLikeCurrentTrack = (): void => {
    if (!currentTrack) return
    toggleLikeTrack(currentTrack)
  }

  // ── Data Fetching ──
  const loadRecommendations = useCallback(async (tracks: SCTrack[]): Promise<void> => {
    if (!tracks.length) {
      setRecommendations([])
      return
    }
    const seedPool = tracks.slice(0, 40)
    try {
      const result = await window.fableAPI.soundcloud.getRecommendations(seedPool, {
        excludeIds: seedPool.map((t) => t.id),
        limit: 36
      })
      if (Array.isArray(result)) setRecommendations(result as SCTrack[])
    } catch {
      // silently fail
    }
  }, [])

  const loadDiscoveryFeeds = useCallback(async (genres: string[]): Promise<void> => {
    setFeedsLoading(true)
    try {
      const [releases, trending] = await Promise.all([
        window.fableAPI.soundcloud.getNewReleases({ genres, limit: 40 }),
        window.fableAPI.soundcloud.getTrending({ genres, limit: 40 })
      ])
      if (Array.isArray(releases)) setNewReleases(releases as SCTrack[])
      if (Array.isArray(trending)) setTrendingTracks(trending as SCTrack[])
    } catch (err) {
      console.error('Failed to load discovery feeds:', err)
    } finally {
      setFeedsLoading(false)
    }
  }, [])

  useEffect(() => {
    const fetchUserData = async (): Promise<void> => {
      try {
        const localSaved = loadJson<SCPlaylist[]>(LOCAL_PLAYLISTS_KEY, [])
        const [scPlaylists, scLikes, scUploads] = await Promise.all([
          window.fableAPI.soundcloud.getPlaylists({ limit: 200 }),
          window.fableAPI.soundcloud.getLikedTracks({ limit: 200 }),
          window.fableAPI.soundcloud.getMyTracks({ limit: 200 })
        ])

        const remote = Array.isArray(scPlaylists) ? (scPlaylists as SCPlaylist[]) : []
        const merged = mergePlaylists(remote, localSaved)
        setPlaylists(merged)
        persistLocalPlaylists(merged)

        const tracks = [
          ...(Array.isArray(scUploads) ? scUploads : []),
          ...(Array.isArray(scLikes) ? scLikes : [])
        ]
          .filter(
            (track): track is SCTrack =>
              Boolean(track && typeof track === 'object' && 'id' in track)
          )
          .filter((track, index, all) => all.findIndex((item) => item.id === track.id) === index)

        setLikedTracks(tracks)

        const genreCount: Record<string, number> = {}
        for (const track of [...recentlyPlayed, ...tracks]) {
          const genre = track.genre?.toLowerCase().trim()
          if (genre) genreCount[genre] = (genreCount[genre] || 0) + 1
        }
        const genres = Object.entries(genreCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([g]) => g)

        const seedPool = recentlyPlayed.length > 0 ? recentlyPlayed : tracks
        void loadRecommendations(seedPool)
        void loadDiscoveryFeeds(genres)
      } catch (err) {
        console.error('Failed to load user SoundCloud data:', err)
      }
    }

    void fetchUserData()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial library bootstrap only
  }, [loadRecommendations, loadDiscoveryFeeds, mergePlaylists, persistLocalPlaylists])

  // Refresh recommendations every 5 minutes
  useEffect(() => {
    if (!likedTracks.length) return
    const seedPool = recentlyPlayed.length > 0 ? recentlyPlayed : likedTracks
    const interval = setInterval(() => void loadRecommendations(seedPool), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [likedTracks, recentlyPlayed, loadRecommendations])

  const createNewPlaylist = async (): Promise<void> => {
    const title = newPlaylistTitle.trim()
    if (!title || creatingPlaylist) return
    setCreatingPlaylist(true)

    const seedTrack = addToPlaylistTrack
    const initialTracks = seedTrack ? [seedTrack] : []
    const localId = -Date.now()
    const localPlaylist: SCPlaylist = {
      id: localId,
      title,
      artwork_url: seedTrack?.artwork_url || null,
      track_count: initialTracks.length,
      tracks: initialTracks,
      isLocal: true,
      synced: false
    }

    setPlaylists((prev) => {
      const next = [localPlaylist, ...prev]
      persistLocalPlaylists(next)
      return next
    })
    setShowCreatePlaylist(false)
    setNewPlaylistTitle('')
    setAddToPlaylistTrack(null)
    setActivePlaylist(localPlaylist)
    setActiveTab('playlist')
    showPlaylistToast(
      seedTrack ? `Created "${title}" with 1 track` : `Created "${title}"`
    )

    try {
      const remote = await window.fableAPI.soundcloud.createPlaylist({
        title,
        trackIds: initialTracks.map((t) => t.id),
        sharing: 'private'
      })
      if (remote && typeof remote === 'object' && 'id' in remote && !('error' in remote)) {
        const synced: SCPlaylist = {
          ...(remote as SCPlaylist),
          tracks: (remote as SCPlaylist).tracks?.length
            ? (remote as SCPlaylist).tracks
            : initialTracks,
          track_count:
            (remote as SCPlaylist).track_count ||
            ((remote as SCPlaylist).tracks?.length ? (remote as SCPlaylist).tracks.length : initialTracks.length),
          artwork_url: (remote as SCPlaylist).artwork_url || seedTrack?.artwork_url || null,
          isLocal: false,
          synced: true
        }
        setPlaylists((prev) => {
          const next = prev.map((pl) => (pl.id === localId ? synced : pl))
          persistLocalPlaylists(next)
          return next
        })
        setActivePlaylist((prev) => (prev?.id === localId ? synced : prev))
        showPlaylistToast(`"${title}" synced to SoundCloud`)
      }
    } catch {
      showPlaylistToast(`"${title}" saved locally (sync later)`)
    } finally {
      setCreatingPlaylist(false)
    }
  }

  const addTrackToPlaylist = async (playlist: SCPlaylist, track: SCTrack): Promise<void> => {
    const already = playlist.tracks?.some((t) => t.id === track.id)
    if (already) {
      showPlaylistToast('Track is already in this playlist')
      setAddToPlaylistTrack(null)
      return
    }

    const updatedTracks = [...(playlist.tracks || []), track]
    const updated: SCPlaylist = {
      ...playlist,
      tracks: updatedTracks,
      track_count: updatedTracks.length,
      artwork_url: playlist.artwork_url || track.artwork_url
    }

    setPlaylists((prev) => {
      const next = prev.map((pl) => (pl.id === playlist.id ? updated : pl))
      persistLocalPlaylists(next)
      return next
    })
    setActivePlaylist((prev) => (prev?.id === playlist.id ? updated : prev))
    setAddToPlaylistTrack(null)
    showPlaylistToast(`Added to ${playlist.title}`)

    if (playlist.id > 0 && !playlist.isLocal) {
      try {
        await window.fableAPI.soundcloud.updatePlaylistTracks(
          playlist.id,
          updatedTracks.map((t) => t.id)
        )
      } catch {
        showPlaylistToast('Saved locally — SoundCloud sync failed')
      }
    }
  }

  // Cleanup audio and Hls on unmount
  useEffect(() => {
    return () => {
      audioRef.current?.pause()
      if (hlsRef.current) {
        hlsRef.current.destroy()
      }
    }
  }, [])

  // ── Playback Engine ──
  // Flag: when HLS.js is managing the audio element, native <audio> error
  // events are expected (HLS triggers them during init/recovery) and should
  // be ignored — HLS.js surfaces real errors via Hls.Events.ERROR instead.
  const hlsActiveRef = useRef(false)

  useEffect(() => {
    repeatModeRef.current = repeatMode
  }, [repeatMode])

  const startPlayback = useCallback(
    async (track: SCTrack): Promise<void> => {
      // A stream URL request can finish after the user has selected another
      // track. Only the most recent request is allowed to change playback.
      const requestId = ++playbackRequestRef.current
      setPlaybackError(null)

      // Stop the previous session before resolving the next stream. This also
      // prevents a previous HLS instance from continuing in the background.
      audioRef.current?.pause()
      audioRef.current = null
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      hlsActiveRef.current = false
      try {
        const result = await window.fableAPI.soundcloud.getStreamUrl(track.id)
        if (requestId !== playbackRequestRef.current) return
        if (!result.url) throw new Error(result.error || 'Track unavailable.')
        const streamUrl = result.url

        const audio = new Audio()
        audio.volume = isMuted ? 0 : volume

        audio.addEventListener('loadedmetadata', () => setTrackDuration(audio.duration))
        audio.addEventListener('timeupdate', () => {
          if (!isDraggingProgress) {
            setElapsed(audio.currentTime)
            setProgress(audio.duration ? (audio.currentTime / audio.duration) * 100 : 0)
          }
        })
        audio.addEventListener('ended', () => {
          if (audioRef.current !== audio || requestId !== playbackRequestRef.current) return
          if (repeatModeRef.current === 'one') {
            audio.currentTime = 0
            void audio.play()
            return
          }
          playNextTrackRef.current()
        })
        audio.addEventListener('error', (e) => {
          // When HLS.js is active it triggers native audio errors during
          // initialization and media recovery — these are not real failures.
          // HLS.js reports actual problems via its own Hls.Events.ERROR handler.
          if (hlsActiveRef.current) return
          console.error('Audio playback error:', e)
          showError('Stream failed to load.')
          setIsPlaying(false)
        })

        audioRef.current = audio
        setCurrentTrack(track)
        
        if ('mediaSession' in navigator) {
          const artwork = track.artwork_url || track.user.avatar_url || fallbackArtwork
          const rawUrl = artwork.replace('-large.', '-t500x500.').replace('http://', 'https://')
          navigator.mediaSession.metadata = new MediaMetadata({
            title: track.title,
            artist: track.user.username,
            album: 'Fable Player',
            artwork: [
              { src: rawUrl, sizes: '500x500', type: 'image/jpeg' }
            ]
          })
        }
        
        setElapsed(0)
        setTrackDuration(track.duration / 1000)
        setProgress(0)

        // Track in recently played
        addToRecentlyPlayed(track)

        // Try HLS first (SoundCloud now returns HLS AAC streams)
        if (Hls.isSupported()) {
          const hls = new Hls({
            maxBufferLength: 30,
            maxMaxBufferLength: 60
          })
          hlsRef.current = hls
          hlsActiveRef.current = true

          hls.on(Hls.Events.MANIFEST_PARSED, async () => {
            if (audioRef.current !== audio || requestId !== playbackRequestRef.current) return
            try {
              await audio.play()
              setIsPlaying(true)
            } catch (err) {
              console.error('Playback failed after HLS manifest parsed:', err)
              showError('Playback blocked or failed.')
              setIsPlaying(false)
            }
          })

          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (audioRef.current !== audio || requestId !== playbackRequestRef.current) return
            if (data.fatal) {
              console.error('HLS fatal error:', data.type, data.details)
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.destroy()
                hlsRef.current = null
                hlsActiveRef.current = false
                audio.src = streamUrl
                audio.play().then(() => setIsPlaying(true)).catch(() => {
                  showError('Stream failed to load.')
                  setIsPlaying(false)
                })
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError()
              } else {
                showError('Streaming error.')
                setIsPlaying(false)
              }
            }
          })

          hls.loadSource(streamUrl)
          hls.attachMedia(audio)
        } else {
          audio.src = streamUrl
          await audio.play()
          setIsPlaying(true)
        }

        // Refresh recommendations based on recently played + current track
        const seedPool = recentlyPlayed.length > 3
          ? recentlyPlayed.slice(0, 10)
          : [track, ...likedTracks.slice(0, 10)]
        void loadRecommendations(seedPool)
      } catch (error) {
        if (requestId !== playbackRequestRef.current) return
        showError(error instanceof Error ? error.message : 'Could not start playback.')
        setIsPlaying(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volume, isMuted, repeatMode, likedTracks, recentlyPlayed, isDraggingProgress, addToRecentlyPlayed]
  )

  const playTrack = useCallback(
    async (track: SCTrack, trackList?: SCTrack[], index?: number): Promise<void> => {
      if (currentTrack?.id === track.id && audioRef.current) {
        if (audioRef.current.paused) {
          await audioRef.current.play()
          setIsPlaying(true)
        } else {
          audioRef.current.pause()
          setIsPlaying(false)
        }
        return
      }

      if (trackList) {
        if (shuffleOn) {
          queueBeforeShuffleRef.current = [...trackList]
          const shuffled = shuffleArray([...trackList])
          const clickedIdx = shuffled.findIndex((t) => t.id === track.id)
          if (clickedIdx > 0) {
            ;[shuffled[0], shuffled[clickedIdx]] = [shuffled[clickedIdx], shuffled[0]]
          }
          setQueue(shuffled)
          setQueueIndex(0)
        } else {
          queueBeforeShuffleRef.current = null
          setQueue(trackList)
          setQueueIndex(index ?? trackList.findIndex((t) => t.id === track.id))
        }
      }

      await startPlayback(track)
    },
    [currentTrack, shuffleOn, startPlayback]
  )

  const togglePlayback = useCallback(async (): Promise<void> => {
    if (!audioRef.current) {
      if (currentTrack) await startPlayback(currentTrack)
      return
    }
    if (audioRef.current.paused) {
      await audioRef.current.play()
      setIsPlaying(true)
    } else {
      audioRef.current.pause()
      setIsPlaying(false)
    }
  }, [currentTrack, startPlayback])


  const playNextTrack = useCallback((): void => {
    if (queue.length === 0) {
      setIsPlaying(false)
      return
    }
    let nextIdx = queueIndex + 1
    if (nextIdx >= queue.length) {
      if (repeatMode === 'all') {
        nextIdx = 0
      } else {
        setIsPlaying(false)
        return
      }
    }
    setQueueIndex(nextIdx)
    void startPlayback(queue[nextIdx])
  }, [queue, queueIndex, repeatMode, startPlayback])

  useEffect(() => {
    playNextTrackRef.current = playNextTrack
  }, [playNextTrack])

  const playPrevTrack = useCallback((): void => {
    if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0
      return
    }
    if (queue.length === 0) return
    let prevIdx = queueIndex - 1
    if (prevIdx < 0) {
      if (repeatMode === 'all') {
        prevIdx = queue.length - 1
      } else {
        prevIdx = 0
      }
    }
    setQueueIndex(prevIdx)
    void startPlayback(queue[prevIdx])
  }, [queue, queueIndex, repeatMode, startPlayback])

  // ── Media Session Action Handlers ──
  useEffect(() => {
    if ('mediaSession' in navigator) {
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          void togglePlayback()
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          void togglePlayback()
        })
        navigator.mediaSession.setActionHandler('previoustrack', () => {
          playPrevTrack()
        })
        navigator.mediaSession.setActionHandler('nexttrack', () => {
          playNextTrack()
        })
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined && audioRef.current) {
            audioRef.current.currentTime = details.seekTime
          }
        })
      } catch (error) {
        console.warn('Media Session Action Handlers error:', error)
      }
    }
  }, [togglePlayback, playNextTrack, playPrevTrack])

  useEffect(() => {
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused'
    }
  }, [isPlaying])

  // ── Volume ──
  const handleVolumeChange = (newVol: number): void => {
    const clamped = Math.max(0, Math.min(1, newVol))
    setVolume(clamped)
    setIsMuted(clamped === 0)
    if (audioRef.current) audioRef.current.volume = clamped
  }

  const toggleMute = (): void => {
    if (isMuted) {
      setIsMuted(false)
      if (audioRef.current) audioRef.current.volume = volume || 0.5
      if (volume === 0) setVolume(0.5)
    } else {
      setIsMuted(true)
      if (audioRef.current) audioRef.current.volume = 0
    }
  }

  // ── Shuffle ──
  const toggleShuffle = (): void => {
    if (!shuffleOn && queue.length > 0) {
      queueBeforeShuffleRef.current = [...queue]
      const current = queue[queueIndex]
      const remaining = queue.filter((_, i) => i !== queueIndex)
      const shuffled = current ? [current, ...shuffleArray(remaining)] : shuffleArray([...queue])
      setQueue(shuffled)
      setQueueIndex(current ? 0 : -1)
      setShuffleOn(true)
      return
    }

    if (shuffleOn) {
      const originalQueue = queueBeforeShuffleRef.current
      if (originalQueue) {
        const currentIndex = currentTrack
          ? originalQueue.findIndex((track) => track.id === currentTrack.id)
          : -1
        setQueue(originalQueue)
        setQueueIndex(currentIndex)
      }
      queueBeforeShuffleRef.current = null
      setShuffleOn(false)
    }
  }

  const cycleRepeat = (): void => {
    setRepeatMode((prev) => {
      if (prev === 'off') return 'all'
      if (prev === 'all') return 'one'
      return 'off'
    })
  }

  // ── Search ──
  const handleSearch = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!searchQuery.trim()) return
    try {
      const results = await window.fableAPI.soundcloud.search(searchQuery)
      if (Array.isArray(results)) {
        setSearchResults(results as SCTrack[])
        setActiveTab('search')
      }
    } catch (err) {
      console.error('Search failed:', err)
    }
  }

  const clearSearch = (): void => {
    setSearchQuery('')
    setSearchResults([])
    if (activeTab === 'search') setActiveTab('home')
  }

  // ── Playlist browsing ──
  const openPlaylist = async (pl: SCPlaylist): Promise<void> => {
    setPlaylistLoading(true)
    setActiveTab('playlist')
    try {
      if (pl.isLocal || pl.id < 0 || (pl.tracks && pl.tracks.length > 0)) {
        setActivePlaylist(pl)
      } else {
        const full = await window.fableAPI.soundcloud.getPlaylist(pl.id)
        if (full && typeof full === 'object' && 'tracks' in full) {
          setActivePlaylist(full as SCPlaylist)
        } else {
          setActivePlaylist(pl)
        }
      }
    } catch {
      setActivePlaylist(pl)
    }
    setPlaylistLoading(false)
  }

  // ── Clear Queue ──
  const clearQueue = (): void => {
    setQueue([])
    setQueueIndex(-1)
    queueBeforeShuffleRef.current = null
  }

  // ── Queue stats ──
  const queueStats = useMemo(() => {
    const totalMs = queue.reduce((sum, t) => sum + t.duration, 0)
    const totalSec = Math.floor(totalMs / 1000)
    const mins = Math.floor(totalSec / 60)
    const secs = totalSec % 60
    return { count: queue.length, time: `${mins}:${String(secs).padStart(2, '0')}` }
  }, [queue])

  // ── Draggable Progress Bar ──
  const seekToPercent = useCallback((percent: number) => {
    const clamped = Math.max(0, Math.min(100, percent))
    setProgress(clamped)
    setElapsed((clamped / 100) * trackDuration)
    if (audioRef.current && trackDuration) {
      audioRef.current.currentTime = (clamped / 100) * trackDuration
    }
  }, [trackDuration])

  const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDraggingProgress(true)
    const bar = progressBarRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    seekToPercent(((e.clientX - rect.left) / rect.width) * 100)
  }

  useEffect(() => {
    if (!isDraggingProgress) return
    const onMove = (e: MouseEvent): void => {
      const bar = progressBarRef.current
      if (!bar) return
      const rect = bar.getBoundingClientRect()
      seekToPercent(((e.clientX - rect.left) / rect.width) * 100)
    }
    const onUp = (): void => {
      setIsDraggingProgress(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDraggingProgress, seekToPercent])

  // ── Draggable Volume Slider ──
  const setVolumeFromEvent = useCallback((e: MouseEvent | React.MouseEvent): void => {
    const bar = volumeBarRef.current
    if (!bar) return
    const rect = bar.getBoundingClientRect()
    handleVolumeChange((e.clientX - rect.left) / rect.width)
  }, [])

  const handleVolumeMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    e.preventDefault()
    setIsDraggingVolume(true)
    setVolumeFromEvent(e)
  }

  useEffect(() => {
    if (!isDraggingVolume) return
    const onMove = (e: MouseEvent): void => setVolumeFromEvent(e)
    const onUp = (): void => setIsDraggingVolume(false)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [isDraggingVolume, setVolumeFromEvent])

  const openProfile = (): void => {
    if (user?.permalink_url) void window.fableAPI.window.openExternal(user.permalink_url)
  }

  const scrollRight = (ref: React.RefObject<HTMLDivElement | null>): void => {
    ref.current?.scrollBy({ left: 300, behavior: 'smooth' })
  }

  const featuredTracks = recommendations.length > 0 ? recommendations : likedTracks.slice(0, 12)
  const accentColor = customization.customAccent

  // Helper to render a track list (DRY)
  const renderTrackList = (tracks: SCTrack[], showLike = false): React.JSX.Element => (
    <div className="track-list">
      {tracks.map((track, i) => (
        <div
          key={track.id}
          className={`track-row ${currentTrack?.id === track.id ? 'active' : ''}`}
          onClick={() => void playTrack(track, tracks, i)}
        >
          <span className="track-row-num">
            {currentTrack?.id === track.id && isPlaying ? (
              <span className="eq-bars"><span /><span /><span /></span>
            ) : (
              i + 1
            )}
          </span>
          <img className="track-row-cover" src={artworkSmall(track)} onError={useFallbackArtwork} alt="" />
          <div className="track-row-info">
            <span className={`track-row-title ${currentTrack?.id === track.id ? 'highlight' : ''}`}>{track.title}</span>
            <span className="track-row-artist">{track.user.username}</span>
          </div>
          <span className="track-row-duration">{formatTime(track.duration / 1000)}</span>
          <button
            className="track-row-add"
            title="Add to playlist"
            onClick={(e) => {
              e.stopPropagation()
              setAddToPlaylistTrack(track)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14m-7-7h14" />
            </svg>
          </button>
          {showLike && (
            <button
              className={`track-row-like ${likedTrackIds.has(track.id) ? 'liked' : ''}`}
              onClick={(e) => toggleLikeTrack(track, e)}
              title="Like"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill={likedTrackIds.has(track.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  )

  // ── Render ──
  return (
    <div className={`main-layout animate-fade-in ${customization.compactPlayer ? 'compact-player' : ''}`}>
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <svg width="22" height="22" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fgrad-sidebar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-accent, #3D004E)"/>
                <stop offset="55%" stopColor="var(--color-accent-hover, #F83A75)"/>
                <stop offset="100%" stopColor="var(--color-accent-active, #FD6860)"/>
              </linearGradient>
            </defs>
            <g fill="url(#fgrad-sidebar)">
              <rect x="176" y="140" width="72" height="240" rx="16"/>
              <rect x="176" y="140" width="160" height="64" rx="16"/>
              <rect x="176" y="228" width="120" height="64" rx="16"/>
            </g>
          </svg>
          <span>Fable Player</span>
        </div>

        <div className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            id="nav-home"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'trending' ? 'active' : ''}`}
            onClick={() => setActiveTab('trending')}
            id="nav-trending"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
            <span>Trending</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'new-releases' ? 'active' : ''}`}
            onClick={() => setActiveTab('new-releases')}
            id="nav-new-releases"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707-.707M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" />
            </svg>
            <span>New Releases</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'for-you' ? 'active' : ''}`}
            onClick={() => setActiveTab('for-you')}
            id="nav-for-you"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            <span>For You</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('search')
              setTimeout(() => document.getElementById('search-input')?.focus(), 50)
            }}
            id="nav-search"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
            </svg>
            <span>Search</span>
          </button>
        </div>

        {/* YOUR LIBRARY */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Your Library</div>
          <div className="sidebar-library-links">
            <button
              className={`nav-item small ${activeTab === 'likes' ? 'active' : ''}`}
              onClick={() => setActiveTab('likes')}
              id="nav-likes"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
              </svg>
              <span>Liked Songs</span>
            </button>

            <button
              className={`nav-item small ${activeTab === 'playlist' && !activePlaylist ? 'active' : ''}`}
              onClick={() => {
                setActivePlaylist(null)
                setActiveTab('playlist')
              }}
              id="nav-playlists-lib"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
              <span>Playlists</span>
            </button>

            <button
              className={`nav-item small ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
              id="nav-history"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
              </svg>
              <span>History</span>
            </button>

            <button
              className={`nav-item small ${activeTab === 'downloads' ? 'active' : ''}`}
              onClick={() => setActiveTab('downloads')}
              id="nav-downloads"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Downloads</span>
            </button>
          </div>
        </div>

        {/* PLAYLISTS */}
        <div className="sidebar-section playlists-section">
          <div className="sidebar-section-title">
            Playlists
            <button
              className="sidebar-section-add"
              title="New playlist"
              onClick={() => setShowCreatePlaylist(true)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          </div>
          <div className="playlist-list">
            {playlists.length > 0 ? (
              playlists.slice(0, 20).map((pl, idx) => (
                <button
                  key={pl.id}
                  className={`playlist-item ${activeTab === 'playlist' && activePlaylist?.id === pl.id ? 'active' : ''}`}
                  onClick={() => void openPlaylist(pl)}
                >
                  <div
                    className="playlist-item-icon"
                    style={{ background: PLAYLIST_COLORS[idx % PLAYLIST_COLORS.length] + '22', color: PLAYLIST_COLORS[idx % PLAYLIST_COLORS.length] }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div className="playlist-item-info">
                    <span className="playlist-item-name">{pl.title}</span>
                    <span className="playlist-item-count">
                      {pl.track_count} tracks{pl.isLocal ? ' · Local' : ''}
                    </span>
                  </div>
                </button>
              ))
            ) : (
              <p className="empty-message">No playlists yet</p>
            )}
          </div>
        </div>

        {/* Bottom links */}
        <div className="sidebar-bottom">
          <button
            className={`nav-item small ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
            style={{ marginBottom: '4px' }}
            id="nav-settings-btn"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
          <button className="nav-item small" onClick={onLogout} id="btn-logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ── Main Content ── */}
      <main className={`content-area ${showQueue ? 'queue-open' : ''}`}>
        <header className="content-header">
          <form className="search-box" onSubmit={handleSearch}>
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search for songs, artists, albums..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              id="search-input"
            />
            {searchQuery && (
              <button type="button" className="search-clear" onClick={clearSearch}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m18 6-12 12" /><path d="m6 6 12 12" />
                </svg>
              </button>
            )}
            <button type="button" className="search-filter" title="Filters">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6" /><line x1="8" y1="12" x2="20" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
                <circle cx="7" cy="6" r="2" fill="currentColor" /><circle cx="14" cy="12" r="2" fill="currentColor" /><circle cx="9" cy="18" r="2" fill="currentColor" />
              </svg>
            </button>
          </form>

          <div className="header-actions">
            <button className="header-bell" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
              </svg>
            </button>
            {user && (
              <button className="header-profile" onClick={openProfile} title="Open SoundCloud profile">
                <img
                  src={mediaUrl(user.avatar_url || fallbackArtwork)}
                  onError={useFallbackArtwork}
                  alt={user.username}
                />
                <span className="header-profile-name">{user.username}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
          </div>
        </header>

        <div className="content-scroll">
          {/* ── Home Tab ── */}
          {activeTab === 'home' && (
            <>
              {/* Hero Banner */}
              {heroBanners.length > 0 && (
                <section className="hero-banner">
                  <div className="hero-banner-bg">
                    {heroBanners[heroBannerIndex]?.backgroundTrack && (
                      <img
                        src={artworkFor(heroBanners[heroBannerIndex].backgroundTrack!)}
                        onError={useFallbackArtwork}
                        alt=""
                        className="hero-banner-bg-img"
                      />
                    )}
                    <div className="hero-banner-overlay" />
                  </div>
                  <div className="hero-banner-content">
                    <span className="hero-badge">{heroBanners[heroBannerIndex]?.badge}</span>
                    <h1 className="hero-title">{heroBanners[heroBannerIndex]?.title}</h1>
                    <p className="hero-subtitle">{heroBanners[heroBannerIndex]?.subtitle}</p>
                    <button
                      className="hero-play-btn"
                      onClick={() => {
                        const banner = heroBanners[heroBannerIndex]
                        if (banner?.tracks?.length > 0) {
                          void playTrack(banner.tracks[0], banner.tracks, 0)
                        }
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                      Play Now
                    </button>
                  </div>
                  {heroBanners.length > 1 && (
                    <div className="hero-dots">
                      {heroBanners.map((_, idx) => (
                        <button
                          key={idx}
                          className={`hero-dot ${idx === heroBannerIndex ? 'active' : ''}`}
                          onClick={() => setHeroBannerIndex(idx)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* For You Section */}
              <section className="section">
                <div className="section-header">
                  <h2>For You</h2>
                  <div className="section-header-right">
                    <button className="section-refresh" onClick={() => {
                      const seedPool = recentlyPlayed.length > 0 ? recentlyPlayed : likedTracks
                      void loadRecommendations(seedPool)
                    }} title="Refresh">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                      </svg>
                    </button>
                    <button className="section-view-all" onClick={() => setActiveTab('for-you')}>View all</button>
                  </div>
                </div>
                <div className="card-scroll-container">
                  <div className="card-scroll" ref={recScrollRef}>
                    {featuredTracks.map((track, i) => (
                      <div
                        key={track.id}
                        className={`track-card ${currentTrack?.id === track.id ? 'playing' : ''}`}
                        onClick={() => void playTrack(track, featuredTracks, i)}
                      >
                        <div className="track-card-cover">
                          <img src={artworkFor(track)} onError={useFallbackArtwork} alt={track.title} />
                          <div className="track-card-overlay">
                            <div className="track-card-play">
                              {currentTrack?.id === track.id && isPlaying ? (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                              ) : (
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="track-card-info">
                          <span className="track-card-title">{track.title}</span>
                          <span className="track-card-artist">{track.user.username}</span>
                          <span className="track-card-duration">{formatTime(track.duration / 1000)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  {featuredTracks.length > 4 && (
                    <button className="scroll-btn" onClick={() => scrollRight(recScrollRef)} aria-label="Scroll right">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="m9 18 6-6-6-6" /></svg>
                    </button>
                  )}
                </div>
              </section>

              {/* Recently Played Section */}
              <section className="section">
                <div className="section-header">
                  <h2>Recently Played</h2>
                  {recentlyPlayed.length > 5 && (
                    <button className="section-view-all" onClick={() => setActiveTab('history')}>View all</button>
                  )}
                </div>
                {recentlyPlayed.length > 0 ? (
                  renderTrackList(recentlyPlayed.slice(0, 8), true)
                ) : (
                  <p className="empty-message">Start playing to see your history here.</p>
                )}
              </section>
            </>
          )}

          {/* ── For You Tab ── */}
          {activeTab === 'for-you' && (
            <div className="for-you-container">
              {/* Header */}
              <div className="section-header" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 'var(--space-1)' }}>For You</h2>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    Personalized music selection based on your listening history
                  </p>
                </div>
                <button className="playlist-play-all" onClick={() => {
                  const seedPool = recentlyPlayed.length > 0 ? recentlyPlayed : likedTracks
                  void loadRecommendations(seedPool)
                }} title="Refresh recommendations" style={{ height: 'fit-content' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight: '8px' }}>
                    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                  </svg>
                  Refresh
                </button>
              </div>

              {/* Recommendations Section */}
              <section className="section" style={{ marginBottom: 'var(--space-6)' }}>
                <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-3)' }}>Recommended for You</h3>
                {recommendations.length > 0 ? (
                  renderTrackList(recommendations, true)
                ) : (
                  <div style={{ padding: 'var(--space-6)', textAlign: 'center', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-lg)', border: '1px dashed var(--color-border)' }}>
                    <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-2)' }}>Getting recommendations...</p>
                    <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>Listen to more songs to get better recommendations</p>
                  </div>
                )}
              </section>

              {/* Genre Mixes Section */}
              {topGenres.length > 0 && (
                <section className="section">
                  <h3 style={{ fontSize: 'var(--text-lg)', fontWeight: 'var(--weight-bold)', marginBottom: 'var(--space-3)' }}>Your Genre Mixes</h3>
                  <div className="card-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-4)', overflowX: 'unset' }}>
                    {topGenres.map((genre, idx) => {
                      const genreTitle = genre.charAt(0).toUpperCase() + genre.slice(1);
                      const genreTracks = [...recentlyPlayed, ...likedTracks].filter(
                        (t) => t.genre?.toLowerCase().trim() === genre
                      );
                      if (genreTracks.length === 0) return null;
                      return (
                        <div
                          key={genre}
                          className="track-card"
                          onClick={() => {
                            void playTrack(genreTracks[0], genreTracks, 0);
                          }}
                        >
                          <div className="track-card-cover" style={{ width: '100%', height: 'unset', aspectRatio: '1/1', position: 'relative', background: `linear-gradient(135deg, ${PLAYLIST_COLORS[idx % PLAYLIST_COLORS.length]}, #171513)` }}>
                            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', justifyContent: 'space-between', padding: 'var(--space-3)', color: '#fff' }}>
                              <span style={{ fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em' }}>FABLE MIX</span>
                              <span style={{ fontSize: '1.25rem', fontWeight: 800, lineHeight: 1.1 }}>{genreTitle}</span>
                            </div>
                            <div className="track-card-overlay">
                              <div className="track-card-play">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                              </div>
                            </div>
                          </div>
                          <div className="track-card-info">
                            <span className="track-card-title">{genreTitle} Mix</span>
                            <span className="track-card-artist">{genreTracks.length} custom tracks</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* ── Likes Tab ── */}
          {activeTab === 'likes' && (
            <section className="section">
              <h2>Liked Songs</h2>
              {likedTracks.length > 0 ? (
                renderTrackList(likedTracks, true)
              ) : (
                <p className="empty-message">No liked tracks loaded yet.</p>
              )}
            </section>
          )}

          {/* ── History Tab ── */}
          {activeTab === 'history' && (
            <section className="section">
              <h2>Listening History</h2>
              {recentlyPlayed.length > 0 ? (
                renderTrackList(recentlyPlayed, true)
              ) : (
                <p className="empty-message">No listening history yet.</p>
              )}
            </section>
          )}

          {/* ── Search Tab ── */}
          {activeTab === 'search' && (
            <section className="section">
              <h2>Search results for &ldquo;{searchQuery}&rdquo;</h2>
              {searchResults.length > 0 ? (
                renderTrackList(searchResults)
              ) : (
                <p className="empty-message">No results found.</p>
              )}
            </section>
          )}

          {/* ── Playlist Tab ── */}
          {activeTab === 'playlist' && (
            <section className="section">
              {playlistLoading ? (
                <div className="playlist-loading">
                  <span className="spinner-large" />
                </div>
              ) : activePlaylist ? (
                <>
                  <div className="playlist-header">
                    <div className="playlist-header-art">
                      {activePlaylist.artwork_url ? (
                        <img src={mediaUrl(activePlaylist.artwork_url.replace('-large.', '-t300x300.'))} onError={useFallbackArtwork} alt="" />
                      ) : (
                        <div className="playlist-header-art-placeholder">
                          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="playlist-header-info">
                      <span className="playlist-header-label">
                        {activePlaylist.isLocal ? 'Local Playlist' : 'Playlist'}
                      </span>
                      <h2 className="playlist-header-title">{activePlaylist.title}</h2>
                      <span className="playlist-header-count">{activePlaylist.track_count} tracks</span>
                      {activePlaylist.tracks?.length > 0 && (
                        <button
                          className="playlist-play-all"
                          onClick={() => {
                            if (activePlaylist.tracks.length > 0) {
                              void playTrack(activePlaylist.tracks[0], activePlaylist.tracks, 0)
                            }
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                          Play all
                        </button>
                      )}
                    </div>
                  </div>
                  {activePlaylist.tracks?.length > 0 ? (
                    renderTrackList(activePlaylist.tracks)
                  ) : (
                    <p className="empty-message">This playlist has no tracks.</p>
                  )}
                </>
              ) : (
                <>
                  <div className="playlist-header" style={{ borderBottom: 'none', paddingBottom: 0, marginBottom: 'var(--space-4)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-4)' }}>
                    <div className="playlist-header-info">
                      <h2 className="playlist-header-title" style={{ fontSize: '2.5rem', marginBottom: 0 }}>Your Playlists</h2>
                      <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-2)' }}>
                        Local playlists sync to SoundCloud when possible
                      </p>
                    </div>
                    <button className="playlist-play-all" onClick={() => setShowCreatePlaylist(true)}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 5v14m-7-7h14" />
                      </svg>
                      New playlist
                    </button>
                  </div>
                  {playlists.length > 0 ? (
                    <div className="card-scroll" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 'var(--space-4)', overflowX: 'unset' }}>
                      {playlists.map((pl) => (
                        <div key={pl.id} className="track-card" onClick={() => void openPlaylist(pl)}>
                          <div className="track-card-cover" style={{ width: '100%', height: 'unset', aspectRatio: '1/1' }}>
                            {pl.artwork_url ? (
                              <img src={mediaUrl(pl.artwork_url.replace('-large.', '-t300x300.'))} onError={useFallbackArtwork} alt="" />
                            ) : (
                              <div className="playlist-header-art-placeholder" style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                                </svg>
                              </div>
                            )}
                          </div>
                          <div className="track-card-info">
                            <span className="track-card-title">{pl.title}</span>
                            <span className="track-card-artist">
                              {pl.track_count} tracks{pl.isLocal ? ' · Local' : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-message">No playlists yet. Create your first one.</p>
                  )}
                </>
              )}
            </section>
          )}

          {/* ── Trending Tab ── */}
          {activeTab === 'trending' && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>Trending Music</h2>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                    High-engagement tracks based on your taste
                  </p>
                </div>
                <button
                  className="section-refresh"
                  onClick={() => void loadDiscoveryFeeds(topGenres)}
                  title="Refresh"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                  </svg>
                </button>
              </div>
              {feedsLoading && trendingTracks.length === 0 ? (
                <p className="empty-message">Loading trending tracks...</p>
              ) : trendingTracks.length > 0 ? (
                renderTrackList(trendingTracks, true)
              ) : (
                <p className="empty-message">No trending music available yet.</p>
              )}
            </section>
          )}

          {/* ── New Releases Tab ── */}
          {activeTab === 'new-releases' && (
            <section className="section">
              <div className="section-header">
                <div>
                  <h2>New Releases</h2>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)', marginTop: 'var(--space-1)' }}>
                    Fresh uploads from the last 45 days
                    {topGenres.length > 0 ? ` · ${topGenres.slice(0, 3).join(', ')}` : ''}
                  </p>
                </div>
                <button
                  className="section-refresh"
                  onClick={() => void loadDiscoveryFeeds(topGenres)}
                  title="Refresh"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                  </svg>
                </button>
              </div>
              {feedsLoading && newReleases.length === 0 ? (
                <p className="empty-message">Loading new releases...</p>
              ) : newReleases.length > 0 ? (
                renderTrackList(newReleases, true)
              ) : (
                <p className="empty-message">No new releases available yet. Listen to more music to personalize this feed.</p>
              )}
            </section>
          )}

          {/* ── Settings Tab ── */}
          {activeTab === 'settings' && (
            <section className="section">
              <div className="section-header" style={{ marginBottom: 'var(--space-6)' }}>
                <div>
                  <h2 style={{ fontSize: '2rem', fontWeight: 800 }}>Settings</h2>
                  <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
                    Customize your Fable Player interface
                  </p>
                </div>
              </div>

              <div className="settings-grid">
                <div className="settings-card">
                  <h3 className="settings-card-title">Accent Color</h3>
                  <p className="settings-card-desc">
                    Theme color for buttons, active items, and gradients. Dark mode uses lighter variants automatically.
                  </p>

                  <div className="settings-accent-grid">
                    {ACCENT_PRESETS.map((preset) => (
                      <button
                        key={preset.name}
                        className={`settings-accent-btn ${customization.accentPreset === preset.name ? 'active' : ''}`}
                        onClick={() => handleAccentPreset(preset.name)}
                      >
                        <span className="settings-accent-swatch" style={{ backgroundColor: preset.color }} />
                        <span>{preset.name}</span>
                      </button>
                    ))}
                  </div>

                  <div className="settings-custom-color">
                    <label htmlFor="custom-color-picker">Custom Color</label>
                    <input
                      id="custom-color-picker"
                      type="color"
                      value={accentColor}
                      onChange={(e) => handleCustomAccent(e.target.value)}
                    />
                    <span className="settings-hex">{accentColor.toUpperCase()}</span>
                  </div>
                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Layout &amp; Density</h3>
                  <p className="settings-card-desc">Control spacing and how much content fits on screen.</p>

                  <div className="settings-toggle-row">
                    <div>
                      <strong>Comfortable</strong>
                      <span>More spacing, larger cards</span>
                    </div>
                    <button
                      className={`settings-chip ${customization.density === 'comfortable' ? 'active' : ''}`}
                      onClick={() => updateCustomization({ density: 'comfortable' })}
                    >
                      On
                    </button>
                  </div>
                  <div className="settings-toggle-row">
                    <div>
                      <strong>Compact</strong>
                      <span>Denser lists and sidebar</span>
                    </div>
                    <button
                      className={`settings-chip ${customization.density === 'compact' ? 'active' : ''}`}
                      onClick={() => updateCustomization({ density: 'compact' })}
                    >
                      On
                    </button>
                  </div>
                  <div className="settings-toggle-row">
                    <div>
                      <strong>Compact player</strong>
                      <span>Shorter playback bar</span>
                    </div>
                    <button
                      className={`settings-chip ${customization.compactPlayer ? 'active' : ''}`}
                      onClick={() => updateCustomization({ compactPlayer: !customization.compactPlayer })}
                    >
                      {customization.compactPlayer ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                <div className="settings-card">
                  <h3 className="settings-card-title">Behavior</h3>
                  <p className="settings-card-desc">Defaults for queue and motion.</p>

                  <div className="settings-toggle-row">
                    <div>
                      <strong>Show queue by default</strong>
                      <span>Open the queue panel on launch</span>
                    </div>
                    <button
                      className={`settings-chip ${customization.showQueueByDefault ? 'active' : ''}`}
                      onClick={() => {
                        const next = !customization.showQueueByDefault
                        updateCustomization({ showQueueByDefault: next })
                        setShowQueue(next)
                      }}
                    >
                      {customization.showQueueByDefault ? 'On' : 'Off'}
                    </button>
                  </div>
                  <div className="settings-toggle-row">
                    <div>
                      <strong>Reduce motion</strong>
                      <span>Minimize animations and banner transitions</span>
                    </div>
                    <button
                      className={`settings-chip ${customization.reduceMotion ? 'active' : ''}`}
                      onClick={() => updateCustomization({ reduceMotion: !customization.reduceMotion })}
                    >
                      {customization.reduceMotion ? 'On' : 'Off'}
                    </button>
                  </div>
                </div>

                <div className="settings-card settings-support-card">
                  <h3 className="settings-card-title">Support Fable Player</h3>
                  <p className="settings-card-desc">
                    Enjoying the player? Your support helps keep new features and fixes coming.
                  </p>
                  <button
                    className="settings-support-btn"
                    onClick={() => void window.fableAPI.window.openExternal('https://ko-fi.com/skibidisigmatrollface')}
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M12 21.35 10.55 20C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09A6.01 6.01 0 0 1 16.5 3C19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.51L12 21.35Z" />
                    </svg>
                    Support me on Ko-fi
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── Downloads Tab ── */}
          {activeTab === 'downloads' && (
            <section className="section">
              <div className="section-header" style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 'var(--space-1)' }}>
                <h2>Offline Downloads</h2>
                <span className="hero-badge" style={{ background: 'var(--color-success)', color: '#fff', fontSize: '10px' }}>Offline Cache Enabled</span>
              </div>
              <p className="empty-message" style={{ marginBottom: 'var(--space-4)' }}>
                All tracks in your library are cached automatically for offline playback. Here is your offline-ready list:
              </p>
              {likedTracks.length > 0 ? (
                renderTrackList(likedTracks, true)
              ) : (
                <p className="empty-message">No offline tracks cached yet.</p>
              )}
            </section>
          )}
        </div>
      </main>

      {/* ── Queue Panel ── */}
      {showQueue && (
        <aside className="queue-panel">
          <div className="queue-header">
            <h3>Queue</h3>
            <button className="queue-clear" onClick={clearQueue}>Clear</button>
          </div>
          <div className="queue-list">
            {queue.length > 0 ? (
              queue.map((track, i) => (
                <div
                  key={`${track.id}-${i}`}
                  className={`queue-item ${i === queueIndex ? 'active' : ''}`}
                  onClick={() => {
                    setQueueIndex(i)
                    void startPlayback(track)
                  }}
                >
                  <span className="queue-item-num">
                    {i === queueIndex && isPlaying ? (
                      <span className="eq-bars small"><span /><span /><span /></span>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <img className="queue-item-cover" src={artworkSmall(track)} onError={useFallbackArtwork} alt="" />
                  <div className="queue-item-info">
                    <span className={`queue-item-title ${i === queueIndex ? 'highlight' : ''}`}>{track.title}</span>
                    <span className="queue-item-artist">{track.user.username}</span>
                  </div>
                  <span className="queue-item-duration">{formatTime(track.duration / 1000)}</span>
                </div>
              ))
            ) : (
              <p className="empty-message queue-empty">Add tracks to your queue</p>
            )}
          </div>
          {queue.length > 0 && (
            <div className="queue-footer">
              <span className="queue-stats">{queueStats.count} tracks • {queueStats.time}</span>
              <div className="queue-footer-controls">
                <button
                  className={`queue-ctrl-btn ${shuffleOn ? 'active' : ''}`}
                  onClick={toggleShuffle}
                  title="Shuffle"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
                  </svg>
                </button>
                <button
                  className={`queue-ctrl-btn ${repeatMode !== 'off' ? 'active' : ''}`}
                  onClick={cycleRepeat}
                  title={`Repeat: ${repeatMode}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                    <path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
                  </svg>
                  {repeatMode === 'one' && <span className="repeat-one-badge">1</span>}
                </button>
              </div>
            </div>
          )}
        </aside>
      )}

      {/* ── Player Bar ── */}
      <footer className="player-bar">
        {/* Left: Track info */}
        <div className="player-track-info">
          {currentTrack && (
            <>
              <img className="player-track-cover" src={artworkSmall(currentTrack)} onError={useFallbackArtwork} alt="" />
              <div className="player-track-text">
                <span className="player-track-title">{currentTrack.title}</span>
                <span className="player-track-artist">{currentTrack.user.username}</span>
              </div>
              <button
                className={`player-like-btn ${likedTrackIds.has(currentTrack.id) ? 'liked' : ''}`}
                onClick={toggleLikeCurrentTrack}
                title="Like"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill={likedTrackIds.has(currentTrack.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Center: Controls + Progress */}
        <div className="player-center">
          <div className="player-controls">
            <button
              className={`player-ctrl-btn ${shuffleOn ? 'active' : ''}`}
              onClick={toggleShuffle}
              title="Shuffle"
              id="btn-shuffle"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 3h5v5" /><path d="M4 20 21 3" /><path d="M21 16v5h-5" /><path d="m15 15 6 6" /><path d="M4 4l5 5" />
              </svg>
            </button>

            <button className="player-ctrl-btn" onClick={playPrevTrack} title="Previous" id="btn-prev">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="3" y="5" width="3" height="14" rx="1" />
                <polygon points="21 5 10 12 21 19 21 5" />
              </svg>
            </button>

            <button className="player-play-btn" onClick={() => void togglePlayback()} id="btn-play-toggle">
              {isPlaying ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
              )}
            </button>

            <button className="player-ctrl-btn" onClick={playNextTrack} title="Next" id="btn-next">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="18" y="5" width="3" height="14" rx="1" />
                <polygon points="3 5 14 12 3 19 3 5" />
              </svg>
            </button>

            <button
              className={`player-ctrl-btn ${repeatMode !== 'off' ? 'active' : ''}`}
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode}`}
              id="btn-repeat"
            >
              {repeatMode === 'one' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
                  <text x="12" y="15" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="700">1</text>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
                  <path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
                </svg>
              )}
            </button>
          </div>

          <div className="player-progress">
            <span className="player-time">{formatTime(elapsed)}</span>
            <div
              className={`progress-bar ${isDraggingProgress ? 'dragging' : ''}`}
              ref={progressBarRef}
              onMouseDown={handleProgressMouseDown}
            >
              <div className="progress-filled" style={{ width: `${progress}%` }} />
              <div className="progress-knob" style={{ left: `${progress}%` }} />
            </div>
            <span className="player-time">{formatTime(trackDuration)}</span>
          </div>
        </div>

        {/* Right: Volume + Queue toggle */}
        <div className="player-right">
          <button className="player-ctrl-btn volume-btn" onClick={toggleMute} title={isMuted ? 'Unmute' : 'Mute'}>
            {isMuted || volume === 0 ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : volume < 0.5 ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            )}
          </button>
          <div
            className={`volume-slider ${isDraggingVolume ? 'dragging' : ''}`}
            ref={volumeBarRef}
            onMouseDown={handleVolumeMouseDown}
          >
            <div className="volume-filled" style={{ width: `${isMuted ? 0 : volume * 100}%` }} />
            <div className="volume-knob" style={{ left: `${isMuted ? 0 : volume * 100}%` }} />
          </div>
          <button
            className={`player-ctrl-btn queue-toggle-btn ${showQueue ? 'active' : ''}`}
            onClick={() => setShowQueue((prev) => !prev)}
            title="Queue"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15V6" /><path d="M18.5 18a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
              <path d="M12 12H3" /><path d="M16 6H3" /><path d="M12 18H3" />
            </svg>
          </button>
        </div>
      </footer>

      {/* ── Error Toast ── */}
      {playbackError && (
        <div className="error-toast animate-fade-in-up">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          {playbackError}
        </div>
      )}

      {playlistToast && (
        <div className="success-toast animate-fade-in-up">{playlistToast}</div>
      )}

      {/* ── Create Playlist Modal ── */}
      {showCreatePlaylist && (
        <div className="modal-overlay" onClick={() => !creatingPlaylist && setShowCreatePlaylist(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Create playlist</h3>
            <p>Saved locally and synced to SoundCloud when possible.</p>
            <input
              autoFocus
              className="modal-input"
              placeholder="Playlist name"
              value={newPlaylistTitle}
              onChange={(e) => setNewPlaylistTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void createNewPlaylist()
                if (e.key === 'Escape') setShowCreatePlaylist(false)
              }}
            />
            <div className="modal-actions">
              <button className="modal-btn ghost" onClick={() => setShowCreatePlaylist(false)} disabled={creatingPlaylist}>
                Cancel
              </button>
              <button
                className="modal-btn primary"
                onClick={() => void createNewPlaylist()}
                disabled={!newPlaylistTitle.trim() || creatingPlaylist}
              >
                {creatingPlaylist ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add to Playlist Modal ── */}
      {addToPlaylistTrack && (
        <div className="modal-overlay" onClick={() => setAddToPlaylistTrack(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>Add to playlist</h3>
            <p>
              {addToPlaylistTrack.title}
              <span style={{ color: 'var(--color-text-muted)' }}> · {addToPlaylistTrack.user.username}</span>
            </p>
            <div className="modal-playlist-list">
              {playlists.length > 0 ? (
                playlists.map((pl) => (
                  <button
                    key={pl.id}
                    className="modal-playlist-item"
                    onClick={() => void addTrackToPlaylist(pl, addToPlaylistTrack)}
                  >
                    <span>{pl.title}</span>
                    <span>{pl.track_count} tracks{pl.isLocal ? ' · Local' : ''}</span>
                  </button>
                ))
              ) : (
                <p className="empty-message">No playlists yet</p>
              )}
            </div>
            <div className="modal-actions">
              <button className="modal-btn ghost" onClick={() => setAddToPlaylistTrack(null)}>
                Cancel
              </button>
              <button
                className="modal-btn primary"
                onClick={() => {
                  setShowCreatePlaylist(true)
                }}
              >
                New playlist
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
