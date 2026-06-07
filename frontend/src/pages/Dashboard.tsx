import React from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="dashboard-bg">
      <div className="dashboard-header">
        <div className="dash-logo">🏆 Fantasy Boulzazen</div>
        <div className="dash-user">
          <span>👤 {user?.username}</span>
          <button onClick={handleLogout} className="btn-logout">Déconnexion</button>
        </div>
      </div>
      <div className="dashboard-content">
        <h1>Bienvenue, {user?.username} ! 🎉</h1>
        <p className="dash-sub">Phase 2 en cours de construction — Admin panel & import joueurs</p>
        <div className="dash-cards">
          <div className="dash-card">
            <div className="dash-card-icon">⚽</div>
            <div className="dash-card-label">Mon équipe</div>
            <div className="dash-card-value">—</div>
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