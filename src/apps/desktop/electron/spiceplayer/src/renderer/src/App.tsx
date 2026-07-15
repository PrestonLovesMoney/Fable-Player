import { useState, useEffect } from 'react'
import './styles/global.css'
import TitleBar from './components/TitleBar'
import LoginPage from './pages/LoginPage'
import MainLayout from './layouts/MainLayout'
import { useAuth } from './hooks/useAuth'

const ACCENT_PRESETS: Record<string, { color: string; darkColor: string }> = {
  Bronze: { color: '#8B7355', darkColor: '#DEC4A6' },
  Violet: { color: '#7C5CFC', darkColor: '#A78BFA' },
  Rose: { color: '#E84393', darkColor: '#F472B6' },
  Ocean: { color: '#0984E3', darkColor: '#60A5FA' },
  Emerald: { color: '#00B894', darkColor: '#34D399' },
  Sunset: { color: '#E17055', darkColor: '#FB923C' }
}

function applyStoredAccent(isDark: boolean): void {
  let accent = localStorage.getItem('fable-accent') || '#8B7355'
  try {
    const raw = localStorage.getItem('fable-customization')
    if (raw) {
      const saved = JSON.parse(raw) as { accentPreset?: string; customAccent?: string }
      if (saved.customAccent) accent = saved.customAccent
      if (saved.accentPreset && saved.accentPreset !== 'Custom' && ACCENT_PRESETS[saved.accentPreset]) {
        accent = isDark
          ? ACCENT_PRESETS[saved.accentPreset].darkColor
          : ACCENT_PRESETS[saved.accentPreset].color
      }
    }
  } catch {
    // ignore bad saved settings
  }

  for (const el of [document.documentElement, document.body]) {
    el.style.setProperty('--color-accent', accent)
    el.style.setProperty('--color-accent-hover', accent + 'dd')
    el.style.setProperty('--color-accent-active', accent + 'bb')
    el.style.setProperty('--color-accent-glow', accent + '26')
  }
}

function App(): React.JSX.Element {
  const { isAuthenticated, user, isLoading, error, login, logout } = useAuth()

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'dark' || saved === 'light') return saved
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark-theme')
      document.body.classList.add('dark-theme')
    } else {
      document.documentElement.classList.remove('dark-theme')
      document.body.classList.remove('dark-theme')
    }
    localStorage.setItem('theme', theme)
    applyStoredAccent(theme === 'dark')
  }, [theme])

  const toggleTheme = (): void => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'))
  }

  return (
    <>
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />
      {isLoading ? (
        <div className="app-loader">
          <span className="spinner-large"></span>
        </div>
      ) : isAuthenticated ? (
        <MainLayout user={user} onLogout={logout} />
      ) : (
        <LoginPage onLogin={login} isLoading={isLoading} error={error} />
      )}
    </>
  )
}

export default App
