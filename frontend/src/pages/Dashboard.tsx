import React from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="dashboard-bg">
      <div className="dashboard-header">
        <div className="dash-logo">🏆 Fantasy Boulzazen</div>
        <div className="dash-user">
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/admin')} className="btn-logout">⚙ Admin</button>
          )}
          <span>👤 {user?.username}</span>
          <button onClick={() => { logout(); navigate('/login') }} className="btn-logout">Déconnexion</button>
        </div>
      </div>

      <div className="dashboard-content">
        <h1>Bienvenue, {user?.username} ! 🎉</h1>
        <p className="dash-sub">Coupe du Monde 2026 — Construis ton équipe et affronte tes amis</p>

        <div className="dash-cards">
          <div className="dash-card" onClick={() => navigate('/fantasy')} style={{ cursor: 'pointer' }}>
            <div className="dash-card-icon">⚽</div>
            <div className="dash-card-label">Mon équipe</div>
            <div className="dash-card-value" style={{ fontSize: '1.1rem', fontFamily: 'DM Sans', color: '#c9a84c' }}>Construire →</div>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🏅</div>
            <div className="dash-card-label">Mes points</div>
            <div className="dash-card-value">0</div>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">📊</div>
            <div className="dash-card-label">Classement</div>
            <div className="dash-card-value">—</div>
          </div>
          <div className="dash-card">
            <div className="dash-card-icon">🎯</div>
            <div className="dash-card-label">Pronostics</div>
            <div className="dash-card-value">0</div>
          </div>
        </div>
      </div>
    </div>
  )
}