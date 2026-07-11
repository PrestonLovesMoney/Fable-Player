import { useState, useEffect, useCallback } from 'react'

interface UserProfile {
  id: number
  username: string
  avatar_url: string
  permalink_url: string
  full_name: string
}

interface AuthState {
  isAuthenticated: boolean
  user: UserProfile | null
  isLoading: boolean
  error: string | null
}

interface UseAuthReturn extends AuthState {
  login: () => Promise<void>
  logout: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    isLoading: true,
    error: null
  })

  // Check initial auth status
  useEffect(() => {
    const checkStatus = async (): Promise<void> => {
      try {
        const status = await window.spiceAPI.auth.getStatus()
        setState({
          isAuthenticated: status.isAuthenticated,
          user: status.user,
          isLoading: false,
          error: null
        })
      } catch {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: 'Failed to check auth status'
        }))
      }
    }

    checkStatus()
  }, [])

  // Listen for auth state changes from main process
  useEffect(() => {
    const unsubscribe = window.spiceAPI.auth.onAuthStateChanged((status) => {
      setState({
        isAuthenticated: status.isAuthenticated,
        user: status.user as UserProfile | null,
        isLoading: false,
        error: null
      })
    })

    return unsubscribe
  }, [])

  const login = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }))
    try {
      const result = await window.spiceAPI.auth.login()
      if (!result.success) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: result.error || 'Login failed'
        }))
      }
      // Auth state will be updated via the onAuthStateChanged listener
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Login failed'
      }))
    }
  }, [])

  const logout = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true }))
    try {
      await window.spiceAPI.auth.logout()
      setState({
        isAuthenticated: false,
        user: null,
        isLoading: false,
        error: null
      })
    } catch {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: 'Logout failed'
      }))
    }
  }, [])

  return { ...state, login, logout }
}
