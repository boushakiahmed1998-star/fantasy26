import { create } from 'zustand'
import axios from 'axios'

interface User {
  id: string
  email: string
  username: string
  role: 'user' | 'admin'
}

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  error: string | null
  register: (email: string, password: string, username?: string) => Promise<void>
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  clearError: () => void
}

// ── Initialisation immédiate du header au chargement ──────────────────────────
const storedToken = localStorage.getItem('fb_token')
if (storedToken) {
  axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem('fb_user') || 'null'),
  token: storedToken,
  loading: false,
  error: null,

  register: async (email, password, username) => {
    set({ loading: true, error: null })
    try {
      const { data } = await axios.post('/api/v1/auth/register', { email, password, username })
      localStorage.setItem('fb_token', data.access_token)
      localStorage.setItem('fb_user', JSON.stringify(data.user))
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
      set({ user: data.user, token: data.access_token, loading: false })
    } catch (e: any) {
      set({ error: e.response?.data?.detail || "Erreur lors de l'inscription", loading: false })
      throw e
    }
  },

  login: async (email, password) => {
    set({ loading: true, error: null })
    try {
      const { data } = await axios.post('/api/v1/auth/login', { email, password })
      localStorage.setItem('fb_token', data.access_token)
      localStorage.setItem('fb_user', JSON.stringify(data.user))
      axios.defaults.headers.common['Authorization'] = `Bearer ${data.access_token}`
      set({ user: data.user, token: data.access_token, loading: false })
    } catch (e: any) {
      set({ error: e.response?.data?.detail || 'Email ou mot de passe incorrect', loading: false })
      throw e
    }
  },

  logout: () => {
    localStorage.removeItem('fb_token')
    localStorage.removeItem('fb_user')
    delete axios.defaults.headers.common['Authorization']
    set({ user: null, token: null })
  },

  clearError: () => set({ error: null }),
}))

// ── Intercepteur de secours (si defaults pas encore propagés) ─────────────────
axios.interceptors.request.use((config) => {
  const t = localStorage.getItem('fb_token')
  if (t && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${t}`
  }
  return config
})