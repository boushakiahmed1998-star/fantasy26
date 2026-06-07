import React from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'

// Protège les routes réservées aux admins
// Redirige vers /login si non connecté, vers /dashboard si connecté mais pas admin
export default function AdminRoute({ children }: { children: React.ReactNode }) {
  const { token, user } = useAuthStore()

  if (!token) return <Navigate to="/login" replace />
  if (user?.role !== 'admin') return <Navigate to="/dashboard" replace />

  return <>{children}</>
}