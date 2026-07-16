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
          <svg className="login-logo" width="64" height="64" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="fgrad-login" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-accent, #3D004E)"/>
                <stop offset="55%" stopColor="var(--color-accent-hover, #F83A75)"/>
                <stop offset="100%" stopColor="var(--color-accent-active, #FD6860)"/>
              </linearGradient>
            </defs>
            <g fill="url(#fgrad-login)">
              <rect x="176" y="140" width="72" height="240" rx="16"/>
              <rect x="176" y="140" width="160" height="64" rx="16"/>
              <rect x="176" y="228" width="120" height="64" rx="16"/>
            </g>
          </svg>
          <h1>Fable Player</h1>
          <p className="login-subtitle">your music story begins here</p>
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
