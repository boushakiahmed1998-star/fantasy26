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

// ── Intercepteur : injecte le token si absent ─────────────────────────────────
axios.interceptors.request.use((config) => {
  const t = localStorage.getItem('fb_token')
  if (t && !config.headers['Authorization']) {
    config.headers['Authorization'] = `Bearer ${t}`
  }
  return config
})

// ── Intercepteur : refresh automatique du token expiré ───────────────────────
//
//  Pattern "queue + retry" :
//  1. Une requête reçoit un 401 → on tente /auth/refresh
//  2. Toutes les requêtes qui arrivent pendant le refresh sont mises en file
//  3. Si le refresh réussit → on rejoue toutes les requêtes en file avec le
//     nouveau token
//  4. Si le refresh échoue (session Supabase expirée) → déconnexion propre
//     et redirection vers /login
//
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: any) => void
}> = []

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) {
      reject(error)
    } else {
      resolve(token as string)
    }
  })
  failedQueue = []
}

const forceLogout = () => {
  localStorage.removeItem('fb_token')
  localStorage.removeItem('fb_user')
  delete axios.defaults.headers.common['Authorization']
  useAuthStore.setState({ user: null, token: null })

  const isAuthRoute =
    window.location.pathname === '/login' ||
    window.location.pathname === '/register'

  if (!isAuthRoute) {
    setTimeout(() => {
      window.location.href = '/login'
    }, 100)
  }
}

axios.interceptors.response.use(
  // Réponses OK → on laisse passer
  (response) => response,

  async (error) => {
    const originalRequest = error.config

    // On ne tente le refresh que si :
    // - c'est un 401
    // - on n'a pas déjà retried cette requête
    // - ce n'est pas l'endpoint refresh lui-même (évite la boucle infinie)
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !originalRequest.url?.includes('/auth/refresh')
    ) {
      // Si un refresh est déjà en cours, on met en file d'attente
      if (isRefreshing) {
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        })
          .then((newToken) => {
            originalRequest.headers['Authorization'] = `Bearer ${newToken}`
            return axios(originalRequest)
          })
          .catch((err) => Promise.reject(err))
      }

      // Premier 401 → on lance le refresh
      originalRequest._retry = true
      isRefreshing = true

      try {
        console.log('[auth] Token expiré, tentative de refresh...')
        const { data } = await axios.post('/api/v1/auth/refresh')
        const newToken: string = data.access_token

        // Mettre à jour partout
        localStorage.setItem('fb_token', newToken)
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`
        useAuthStore.setState((s) => ({ ...s, token: newToken }))

        console.log('[auth] Token refreshé avec succès ✓')

        // Débloquer toutes les requêtes en attente
        processQueue(null, newToken)

        // Rejouer la requête originale avec le nouveau token
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`
        return axios(originalRequest)
      } catch (refreshError: any) {
        // Le refresh a échoué → session vraiment expirée
        console.warn('[auth] Refresh échoué, déconnexion forcée')
        processQueue(refreshError, null)
        forceLogout()
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(error)
  }
)