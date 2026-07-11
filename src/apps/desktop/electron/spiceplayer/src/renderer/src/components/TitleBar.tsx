import { useState, useEffect } from 'react'
import './TitleBar.css'

export default function TitleBar(): React.JSX.Element {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.spiceAPI.window.isMaximized().then(setIsMaximized)
    const unsubscribe = window.spiceAPI.window.onMaximizedChanged(setIsMaximized)
    return unsubscribe
  }, [])

  return (
    <div className="titlebar drag-region">
      <div className="titlebar-left">
        <span className="titlebar-mark">S</span>
        <span className="titlebar-title">SpicePlayer</span>
      </div>

      <div className="titlebar-right no-drag">
        <button
          className="window-control"
          onClick={() => window.spiceAPI.window.minimize()}
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
          onClick={() => window.spiceAPI.window.maximize()}
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
          onClick={() => window.spiceAPI.window.close()}
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
