import { useState, useEffect } from 'react'
import './TitleBar.css'

interface TitleBarProps {
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}

export default function TitleBar({ theme, onToggleTheme }: TitleBarProps): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.fableAPI.window.isMaximized().then(setIsMaximized)
    const unsubscribe = window.fableAPI.window.onMaximizedChanged(setIsMaximized)
    return unsubscribe
  }, [])

  return (
    <div className="titlebar drag-region">
      <div className="titlebar-left">
        <div className="titlebar-logo">
          <svg width="20" height="20" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fgrad-tb" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-accent, #3D004E)"/>
                <stop offset="55%" stopColor="var(--color-accent-hover, #F83A75)"/>
                <stop offset="100%" stopColor="var(--color-accent-active, #FD6860)"/>
              </linearGradient>
            </defs>
            <g fill="url(#fgrad-tb)">
              <rect x="176" y="140" width="72" height="240" rx="16"/>
              <rect x="176" y="140" width="160" height="64" rx="16"/>
              <rect x="176" y="228" width="120" height="64" rx="16"/>
            </g>
          </svg>
        </div>
        <span className="titlebar-title">Fable Player</span>
      </div>

      <div className="titlebar-right no-drag">
        <button
          className="window-control theme-toggle"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle Theme"
          id="btn-theme-toggle"
        >
          {theme === 'dark' ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5" />
              <line x1="12" y1="1" x2="12" y2="3" />
              <line x1="12" y1="21" x2="12" y2="23" />
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
              <line x1="1" y1="12" x2="3" y2="12" />
              <line x1="21" y1="12" x2="23" y2="12" />
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          )}
        </button>

        <button
          className="window-control"
          onClick={() => window.fableAPI.window.minimize()}
          title="Minimize"
          aria-label="Minimize"
          id="btn-minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 6h8" />
          </svg>
        </button>

        <button
          className="window-control"
          onClick={() => window.fableAPI.window.maximize()}
          title={isMaximized ? 'Restore' : 'Maximize'}
          aria-label="Maximize"
          id="btn-maximize"
        >
          {isMaximized ? (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="2" y="1" width="8" height="8" rx="1" />
              <path d="M1 3v8h8" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 12 12">
              <rect x="1.5" y="1.5" width="9" height="9" rx="1" />
            </svg>
          )}
        </button>

        <button
          className="window-control window-close"
          onClick={() => window.fableAPI.window.close()}
          title="Close"
          aria-label="Close"
          id="btn-close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="m2 2 8 8m0-8-8 8" />
          </svg>
        </button>
      </div>
    </div>
  )
}
