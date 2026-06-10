import React, { useState, useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [pronoPoints, setPronoPoints] = useState<number | null>(null)
  const [fantasyPoints, setFantasyPoints] = useState<number | null>(null)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [pendingPronos, setPendingPronos] = useState<number | null>(null)

  useEffect(() => {
    // Charge les stats sommaires en parallèle
    Promise.allSettled([
      axios.get('/api/v1/pronos/my').then(r => {
        setPronoPoints(r.data.total_points ?? 0)
        const pending = (r.data.pronos || []).filter((p: any) => !p.locked).length
        setPendingPronos(pending)
      }),
      axios.get('/api/v1/fantasy/my-team').then(r => {
        setFantasyPoints(r.data.team?.points ?? 0)
      }),
      axios.get('/api/v1/ranking').then(r => {
        const me = (r.data.ranking || []).find((e: any) => e.user_id === user?.id)
        if (me) setMyRank(me.rank)
      }),
    ])
  }, [user?.id])

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
          {/* Équipe Fantasy */}
          <div className="dash-card" onClick={() => navigate('/fantasy')} style={{ cursor: 'pointer' }}>
            <div className="dash-card-icon">⚽</div>
            <div className="dash-card-label">Mon équipe</div>
            <div className="dash-card-value" style={{ fontSize: '1.1rem', fontFamily: 'DM Sans', color: '#c9a84c' }}>
              Gérer →
            </div>
          </div>

          {/* Points Fantasy */}
          <div className="dash-card" onClick={() => navigate('/fantasy')} style={{ cursor: 'pointer' }}>
            <div className="dash-card-icon">🏅</div>
            <div className="dash-card-label">Pts Fantasy</div>
            <div className="dash-card-value">
              {fantasyPoints === null ? '…' : fantasyPoints}
            </div>
          </div>

          {/* Classement */}
          <div className="dash-card" onClick={() => navigate('/ranking')} style={{ cursor: 'pointer' }}>
            <div className="dash-card-icon">📊</div>
            <div className="dash-card-label">Mon rang</div>
            <div className="dash-card-value">
              {myRank === null ? '—' : `#${myRank}`}
            </div>
          </div>

          {/* Pronostics */}
          <div className="dash-card" onClick={() => navigate('/pronos')} style={{ cursor: 'pointer' }}>
            <div className="dash-card-icon">🎯</div>
            <div className="dash-card-label">Pts Pronos</div>
            <div className="dash-card-value">
              {pronoPoints === null ? '…' : pronoPoints}
            </div>
          </div>
        </div>

        {/* Raccourcis rapides */}
        <div style={{ marginTop: '2.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.75rem' }}>
          <button
            onClick={() => navigate('/pronos')}
            style={{
              background: 'rgba(201,168,76,0.12)',
              border: '1px solid rgba(201,168,76,0.35)',
              borderRadius: 10, padding: '0.75rem 1.25rem',
              color: '#c9a84c', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 14, display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            🎯 Pronostiquer les matchs
            {pendingPronos !== null && pendingPronos > 0 && (
              <span style={{
                background: '#c9a84c', color: '#0a1f0e',
                borderRadius: '50%', width: 20, height: 20,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700,
              }}>{pendingPronos}</span>
            )}
          </button>

          <button
            onClick={() => navigate('/ranking')}
            style={{
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 10, padding: '0.75rem 1.25rem',
              color: '#10b981', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            📊 Voir le classement général
          </button>

          <button
            onClick={() => navigate('/fantasy')}
            style={{
              background: 'rgba(59,130,246,0.1)',
              border: '1px solid rgba(59,130,246,0.3)',
              borderRadius: 10, padding: '0.75rem 1.25rem',
              color: '#3b82f6', cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif", fontSize: 14,
              display: 'flex', alignItems: 'center', gap: 8,
            }}
          >
            ⚽ Composer mon équipe
          </button>
        </div>
      </div>
    </div>
  )
}