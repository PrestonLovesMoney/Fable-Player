import './styles/global.css'
import TitleBar from './components/TitleBar'
import LoginPage from './pages/LoginPage'
import MainLayout from './layouts/MainLayout'
import { useAuth } from './hooks/useAuth'

function App(): React.JSX.Element {
  const { isAuthenticated, user, isLoading, error, login, logout } = useAuth()

  return (
    <>
      <TitleBar />
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
