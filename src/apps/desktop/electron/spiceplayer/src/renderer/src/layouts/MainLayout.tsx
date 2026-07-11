import { useState, useEffect, useRef, useCallback } from 'react'
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
}

interface SCPlaylist {
  id: number
  title: string
  artwork_url: string | null
  track_count: number
  tracks: SCTrack[]
}

type RepeatMode = 'off' | 'all' | 'one'
type ActiveTab = 'home' | 'likes' | 'search' | 'playlist'

export default function MainLayout({ user, onLogout }: MainLayoutProps): React.JSX.Element {
  // ── Data ──
  const [playlists, setPlaylists] = useState<SCPlaylist[]>([])
  const [likedTracks, setLikedTracks] = useState<SCTrack[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SCTrack[]>([])
  const [recommendations, setRecommendations] = useState<SCTrack[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('home')
  const [activePlaylist, setActivePlaylist] = useState<SCPlaylist | null>(null)
  const [playlistLoading, setPlaylistLoading] = useState(false)

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

  // ── Drag state ──
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [isDraggingVolume, setIsDraggingVolume] = useState(false)
  const progressBarRef = useRef<HTMLDivElement>(null)
  const volumeBarRef = useRef<HTMLDivElement>(null)

  // ── Refs ──
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const hlsRef = useRef<Hls | null>(null)
  const recScrollRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fallbackArtwork = 'https://a-v2.sndcdn.com/assets/images/default_avatar_large-5d20da0.png'

  // ── Helpers ──
  const mediaUrl = (url: string): string =>
    `spiceplayer-media://image?url=${encodeURIComponent(url.replace('http://', 'https://'))}`

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

  // ── Data Fetching ──
  const loadRecommendations = useCallback(async (tracks: SCTrack[]): Promise<void> => {
    if (!tracks.length) return setRecommendations([])
    const seed = tracks[Math.floor(Math.random() * Math.min(tracks.length, 20))]
    try {
      const result = await window.spiceAPI.soundcloud.getRecommendations(seed)
      if (Array.isArray(result)) setRecommendations(result as SCTrack[])
    } catch {
      // silently fail
    }
  }, [])

  useEffect(() => {
    const fetchUserData = async (): Promise<void> => {
      try {
        const [scPlaylists, scLikes, scUploads] = await Promise.all([
          window.spiceAPI.soundcloud.getPlaylists({ limit: 200 }),
          window.spiceAPI.soundcloud.getLikedTracks({ limit: 200 }),
          window.spiceAPI.soundcloud.getMyTracks({ limit: 200 })
        ])
        if (Array.isArray(scPlaylists)) setPlaylists(scPlaylists as SCPlaylist[])

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
        void loadRecommendations(tracks)
      } catch (err) {
        console.error('Failed to load user SoundCloud data:', err)
      }
    }

    fetchUserData()
  }, [loadRecommendations])

  // Refresh recommendations every 5 minutes
  useEffect(() => {
    if (!likedTracks.length) return
    const interval = setInterval(() => void loadRecommendations(likedTracks), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [likedTracks, loadRecommendations])

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
  const startPlayback = useCallback(
    async (track: SCTrack): Promise<void> => {
      setPlaybackError(null)
      try {
        const result = await window.spiceAPI.soundcloud.getStreamUrl(track.id)
        if (!result.url) throw new Error(result.error || 'Track unavailable.')
        const streamUrl = result.url

        // Pause current audio & destroy active Hls session
        audioRef.current?.pause()
        if (hlsRef.current) {
          hlsRef.current.destroy()
          hlsRef.current = null
        }

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
          if (repeatMode === 'one') {
            audio.currentTime = 0
            void audio.play()
            return
          }
          playNextTrack()
        })
        audio.addEventListener('error', (e) => {
          console.error('Audio playback error:', e)
          showError('Stream failed to load.')
          setIsPlaying(false)
        })

        audioRef.current = audio
        setCurrentTrack(track)
        setElapsed(0)
        setTrackDuration(track.duration / 1000)
        setProgress(0)

        // Try HLS first (SoundCloud now returns HLS AAC streams)
        // HLS URLs may or may not have .m3u8 in them - use Hls.js for all
        // remote streams since it gracefully handles non-HLS too
        if (Hls.isSupported()) {
          const hls = new Hls({
            // Low-latency config for faster start
            maxBufferLength: 30,
            maxMaxBufferLength: 60
          })
          hlsRef.current = hls

          hls.on(Hls.Events.MANIFEST_PARSED, async () => {
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
            if (data.fatal) {
              console.error('HLS fatal error:', data.type, data.details)
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                // If HLS fails with network error, it might not be an HLS stream
                // Try direct playback as fallback
                hls.destroy()
                hlsRef.current = null
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
          // Fallback: native HLS support (Safari) or direct URL
          audio.src = streamUrl
          await audio.play()
          setIsPlaying(true)
        }

        // Refresh recommendations based on current track
        void loadRecommendations([track, ...likedTracks.slice(0, 10)])
      } catch (error) {
        showError(error instanceof Error ? error.message : 'Could not start playback.')
        setIsPlaying(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [volume, isMuted, repeatMode, likedTracks, isDraggingProgress]
  )

  const playTrack = useCallback(
    async (track: SCTrack, trackList?: SCTrack[], index?: number): Promise<void> => {
      if (currentTrack?.id === track.id && audioRef.current) {
        // Toggle play/pause for the same track
        if (audioRef.current.paused) {
          await audioRef.current.play()
          setIsPlaying(true)
        } else {
          audioRef.current.pause()
          setIsPlaying(false)
        }
        return
      }

      // Set queue context
      if (trackList) {
        if (shuffleOn) {
          const shuffled = shuffleArray([...trackList])
          const clickedIdx = shuffled.findIndex((t) => t.id === track.id)
          if (clickedIdx > 0) {
            ;[shuffled[0], shuffled[clickedIdx]] = [shuffled[clickedIdx], shuffled[0]]
          }
          setQueue(shuffled)
          setQueueIndex(0)
        } else {
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

  // Fisher-Yates shuffle
  const shuffleArray = <T,>(arr: T[]): T[] => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }

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
    setShuffleOn((prev) => {
      if (!prev && queue.length > 0) {
        const current = queue[queueIndex]
        const remaining = queue.filter((_, i) => i !== queueIndex)
        const shuffled = [current, ...shuffleArray(remaining)]
        setQueue(shuffled)
        setQueueIndex(0)
      }
      return !prev
    })
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
      const results = await window.spiceAPI.soundcloud.search(searchQuery)
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
      // If we already have tracks, use them; otherwise fetch
      if (pl.tracks && pl.tracks.length > 0) {
        setActivePlaylist(pl)
      } else {
        const full = await window.spiceAPI.soundcloud.getPlaylist(pl.id)
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
    if (user?.permalink_url) void window.spiceAPI.window.openExternal(user.permalink_url)
  }

  const scrollRight = (ref: React.RefObject<HTMLDivElement | null>): void => {
    ref.current?.scrollBy({ left: 300, behavior: 'smooth' })
  }

  const featuredTracks = recommendations.length > 0 ? recommendations : likedTracks.slice(0, 12)

  // Helper to render a track list (DRY)
  const renderTrackList = (tracks: SCTrack[]): React.JSX.Element => (
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
        </div>
      ))}
    </div>
  )

  // ── Render ──
  return (
    <div className="main-layout animate-fade-in">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
            id="nav-home"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
            <span>Home</span>
          </button>

          <button
            className={`nav-item ${activeTab === 'likes' ? 'active' : ''}`}
            onClick={() => setActiveTab('likes')}
            id="nav-likes"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
            </svg>
            <span>Liked</span>
          </button>
        </div>

        {/* Playlists */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Your Library</div>
          <div className="playlist-list">
            {playlists.length > 0 ? (
              playlists.slice(0, 20).map((pl) => (
                <button
                  key={pl.id}
                  className={`playlist-item ${activeTab === 'playlist' && activePlaylist?.id === pl.id ? 'active' : ''}`}
                  onClick={() => void openPlaylist(pl)}
                >
                  <div className="playlist-item-icon">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div className="playlist-item-info">
                    <span className="playlist-item-name">{pl.title}</span>
                    <span className="playlist-item-count">{pl.track_count} tracks</span>
                  </div>
                </button>
              ))
            ) : (
              <p className="empty-message">No playlists yet</p>
            )}
          </div>
        </div>

        {/* User */}
        {user && (
          <div className="sidebar-user">
            <img
              src={mediaUrl(user.avatar_url || fallbackArtwork)}
              onError={useFallbackArtwork}
              alt={user.username}
              className="sidebar-user-avatar"
            />
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.username}</span>
              <span className="sidebar-user-status">Connected</span>
            </div>
            <button className="sidebar-user-logout" onClick={onLogout} title="Sign Out" id="btn-signout">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          </div>
        )}
      </aside>

      {/* ── Main Content ── */}
      <main className="content-area">
        <header className="content-header">
          <form className="search-box" onSubmit={handleSearch}>
            <svg className="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="What do you want to play?"
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
          </form>
          {user && (
            <button className="header-profile" onClick={openProfile} title="Open SoundCloud profile">
              <img
                src={mediaUrl(user.avatar_url || fallbackArtwork)}
                onError={useFallbackArtwork}
                alt={user.username}
              />
            </button>
          )}
        </header>

        <div className="content-scroll">
          {/* ── Home Tab ── */}
          {activeTab === 'home' && (
            <>
              <section className="section">
                <div className="section-header">
                  <h2>Made for you</h2>
                  <button className="section-refresh" onClick={() => void loadRecommendations(likedTracks)} title="Refresh">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 3v6h-6" />
                    </svg>
                  </button>
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

              <section className="section">
                <h2>Your tracks</h2>
                {renderTrackList(likedTracks.slice(0, 15))}
              </section>
            </>
          )}

          {/* ── Likes Tab ── */}
          {activeTab === 'likes' && (
            <section className="section">
              <h2>Liked Songs</h2>
              {likedTracks.length > 0 ? (
                renderTrackList(likedTracks)
              ) : (
                <p className="empty-message">No liked tracks loaded yet.</p>
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
                      <span className="playlist-header-label">Playlist</span>
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
                <p className="empty-message">Playlist not found.</p>
              )}
            </section>
          )}
        </div>
      </main>

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
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
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

        {/* Right: Volume */}
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
    </div>
  )
}
