import './LoginPage.css'

interface LoginPageProps {
  onLogin: () => void
  isLoading: boolean
  error: string | null
}

export default function LoginPage({
  onLogin,
  isLoading,
  error
}: LoginPageProps): React.JSX.Element {
  return (
    <div className="login-container animate-fade-in">
      <div className="login-card animate-scale-in">
        <div className="login-header">
          <svg className="login-logo" width="48" height="48" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"
              fill="#FFFFFF"
            />
          </svg>
          <h1>SpicePlayer</h1>
          <p className="login-subtitle">minimalist unified music player</p>
        </div>

        <div className="login-body">
          <button
            className={`login-btn ${isLoading ? 'btn-loading' : ''}`}
            onClick={onLogin}
            disabled={isLoading}
            id="login-sc-btn"
          >
            {isLoading ? <span className="spinner"></span> : 'Connect SoundCloud'}
          </button>

          {error && <div className="login-error">{error}</div>}
        </div>
      </div>
    </div>
  )
}
