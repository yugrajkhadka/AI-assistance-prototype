import { createContext, useContext, useState, useEffect } from 'react'
import { auth as authApi } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('cineassist_token')
    if (token) {
      authApi.me()
        .then(data => setUser(data.user))
        .catch(() => localStorage.removeItem('cineassist_token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email, password) => {
    const data = await authApi.login({ email, password })
    localStorage.setItem('cineassist_token', data.token)
    setUser(data.user)
    return data
  }

  const register = async (name, email, password, role) => {
    const data = await authApi.register({ name, email, password, role })
    localStorage.setItem('cineassist_token', data.token)
    setUser(data.user)
    return data
  }

  const logout = () => {
    localStorage.removeItem('cineassist_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
