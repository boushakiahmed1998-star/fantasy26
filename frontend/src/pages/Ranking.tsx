import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface RankEntry {
  rank: number
  user_id: string
  username: string
  team_name: string
  fantasy_points: number
  prono_points: number
  total_points: number
}

type RankView = 'combined' | 'fantasy' | 'pronos'

// ── Constants ──────────────────────────────────────────────────────────────────

/** Intervalle de rafraîchissement en ms (30 s hors match live, 10 s sinon) */
const POLL_IDLE_MS = 30_000
const POLL_LIVE_MS = 10_000

// ── Helpers ────────────────────────────────────────────────────────────────────

function medal(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

function rankColor(rank: number) {
  if (rank === 1) return '#c9a84c'
  if (rank === 2) return '#9ca3af'
  if (rank === 3) return '#b45309'
  return 'transparent'
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Ranking() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const [entries, setEntries] = useState<RankEntry[]>([])
  const [view, setView] = useState<RankView>('combined')
  const [loading, setLoading] = useState(true)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [liveMatch, setLiveMatch] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRanking = useCallback(async () => {
    try {
      const [rankRes, matchRes] = await Promise.all([
        axios.get('/api/v1/ranking'),
        axios.get('/api/v1/matches/live').catch(() => ({ data: { live: false } })),
      ])
      setEntries(rankRes.data.ranking || [])
      setLiveMatch(!!(matchRes.data?.live))
      setLastUpdated(new Date())
      setError(null)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Impossible de charger le classement')
    } finally {
      setLoading(false)
    }
  }, [])

  // Polling avec intervalle adaptatif
  useEffect(() => {
    fetchRanking()
    const ms = liveMatch ? POLL_LIVE_MS : POLL_IDLE_MS
    intervalRef.current = setInterval(fetchRanking, ms)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [liveMatch, fetchRanking])

  // Sort selon la vue sélectionnée
  const sorted = [...entries].sort((a, b) => {
    if (view === 'fantasy') return b.fantasy_points - a.fantasy_points
    if (view === 'pronos') return b.prono_points - a.prono_points
    return b.total_points - a.total_points
  }).map((e, i) => ({ ...e, rank: i + 1 }))

  const myEntry = sorted.find(e => e.user_id === user?.id)

  const viewPts = (e: RankEntry) => {
    if (view === 'fantasy') return e.fantasy_points
    if (view === 'pronos') return e.prono_points
    return e.total_points
  }

  const maxPts = sorted.length > 0 ? viewPts(sorted[0]) : 0

  return (
    <div style={{ minHeight: '100vh', background: '#0a1f0e', color: '#f5f5f0', fontFamily: "'DM Sans', sans-serif" }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.75rem 1.5rem',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(10,30,14,0.97)',
        backdropFilter: 'blur(10px)',
        position: 'sticky', top: 0, zIndex: 100,
        flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.25rem', color: '#c9a84c', letterSpacing: '0.04em' }}>
            🏆 Fantasy Boulzazen
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { to: '/dashboard', label: 'Dashboard' },
              { to: '/fantasy', label: '⚽ Équipe' },
              { to: '/pronos', label: '🎯 Pronostics' },
              { to: '/ranking', label: '📊 Classement', active: true },
            ].map(({ to, label, active }) => (
              <button key={to} onClick={() => navigate(to)} style={{
                background: (active as boolean) ? 'rgba(201,168,76,0.12)' : 'transparent',
                border: (active as boolean) ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 12px',
                color: (active as boolean) ? '#c9a84c' : '#6a7a6c', fontSize: 13, cursor: 'pointer',
              }}>{label}</button>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/admin')} style={hBtnStyle}>⚙ Admin</button>
          )}
          <span style={{ fontSize: 13, color: '#6a7a6c' }}>👤 {user?.username}</span>
          <button onClick={() => { logout(); navigate('/login') }} style={hBtnStyle}>Déco</button>
        </div>
      </header>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: '0.04em', marginBottom: 4 }}>
              📊 Classement général
            </h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: '#8a9a8c', fontSize: 14 }}>
                {sorted.length} participant{sorted.length > 1 ? 's' : ''}
              </span>
              {liveMatch && (
                <span style={{
                  background: 'rgba(239,68,68,0.12)',
                  border: '1px solid rgba(239,68,68,0.4)',
                  borderRadius: 6, padding: '2px 8px',
                  fontSize: 11, color: '#ef4444',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: '50%',
                    background: '#ef4444', display: 'inline-block',
                    animation: 'pulse 1.5s infinite',
                  }} />
                  LIVE
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {lastUpdated && (
              <span style={{ fontSize: 11, color: '#4a5a4c' }}>
                ↻ {lastUpdated.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <button
              onClick={fetchRanking}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '5px 12px',
                color: '#8a9a8c', fontSize: 12, cursor: 'pointer',
              }}
            >
              🔄 Actualiser
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f08080',
            marginBottom: 16,
          }}>
            ⚠ {error}
          </div>
        )}

        {/* My rank highlight */}
        {myEntry && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.05))',
            border: '1px solid rgba(201,168,76,0.35)',
            borderRadius: 10, padding: '0.85rem 1.25rem',
            marginBottom: 16,
            display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: '#c9a84c', lineHeight: 1 }}>
                #{myEntry.rank}
              </span>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Ma position · {myEntry.username}</div>
                <div style={{ fontSize: 12, color: '#8a9a8c' }}>{myEntry.team_name}</div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', color: '#10b981', lineHeight: 1 }}>
                  {myEntry.fantasy_points}
                </div>
                <div style={{ fontSize: 10, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Fantasy</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', color: '#3b82f6', lineHeight: 1 }}>
                  {myEntry.prono_points}
                </div>
                <div style={{ fontSize: 10, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Pronos</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.5rem', color: '#c9a84c', lineHeight: 1 }}>
                  {myEntry.total_points}
                </div>
                <div style={{ fontSize: 10, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</div>
              </div>
            </div>
          </div>
        )}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 6, marginBottom: '1.25rem' }}>
          {([
            ['combined', '🏆 Général'],
            ['fantasy', '⚽ Fantasy'],
            ['pronos', '🎯 Pronostics'],
          ] as [RankView, string][]).map(([v, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1,
              background: view === v ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
              border: `1px solid ${view === v ? 'rgba(201,168,76,0.4)' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 8, padding: '9px',
              color: view === v ? '#c9a84c' : '#6a7a6c',
              fontSize: 13, cursor: 'pointer', fontWeight: view === v ? 600 : 400,
              transition: 'all 0.2s',
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>⟳ Chargement...</div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>
            <span style={{ fontSize: 48 }}>📊</span>
            <p style={{ marginTop: 12 }}>Aucun participant pour l'instant.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {sorted.map((e) => {
              const isMe = e.user_id === user?.id
              const pts = viewPts(e)
              const barPct = maxPts > 0 ? Math.round((pts / maxPts) * 100) : 0
              const m = medal(e.rank)

              return (
                <div key={e.user_id} style={{
                  background: isMe
                    ? 'rgba(201,168,76,0.08)'
                    : 'rgba(15,45,20,0.55)',
                  border: `1px solid ${isMe ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.05)'}`,
                  borderRadius: 10, padding: '0.85rem 1rem',
                  transition: 'border-color 0.2s',
                  position: 'relative', overflow: 'hidden',
                }}>
                  {/* Progress bar background */}
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0,
                    width: `${barPct}%`,
                    background: `${rankColor(e.rank) === 'transparent'
                      ? 'rgba(16,185,129,0.05)'
                      : rankColor(e.rank) + '10'}`,
                    pointerEvents: 'none', transition: 'width 0.6s ease',
                  }} />

                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* Rank */}
                    <div style={{ width: 36, textAlign: 'center', flexShrink: 0 }}>
                      {m ? (
                        <span style={{ fontSize: 22 }}>{m}</span>
                      ) : (
                        <span style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: 18, color: '#4a5a4c',
                        }}>{e.rank}</span>
                      )}
                    </div>

                    {/* User info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 14, fontWeight: isMe ? 700 : 500,
                        color: isMe ? '#c9a84c' : '#f5f5f0',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {e.username}
                        {isMe && <span style={{ marginLeft: 6, fontSize: 11, color: '#c9a84c', fontWeight: 400 }}>← moi</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6a7a6c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {e.team_name}
                      </div>
                    </div>

                    {/* Points breakdown */}
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexShrink: 0 }}>
                      {view === 'combined' && (
                        <>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>{e.fantasy_points}</div>
                            <div style={{ fontSize: 9, color: '#4a5a4c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>F</div>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 12, color: '#3b82f6', fontWeight: 600 }}>{e.prono_points}</div>
                            <div style={{ fontSize: 9, color: '#4a5a4c', textTransform: 'uppercase', letterSpacing: '0.04em' }}>P</div>
                          </div>
                          <div style={{ width: 1, height: 28, background: 'rgba(255,255,255,0.08)' }} />
                        </>
                      )}
                      <div style={{ textAlign: 'right', minWidth: 52 }}>
                        <span style={{
                          fontFamily: "'Bebas Neue', sans-serif",
                          fontSize: e.rank <= 3 ? 24 : 20,
                          color: e.rank === 1 ? '#c9a84c' : e.rank <= 3 ? '#f5f5f0' : '#8a9a8c',
                          letterSpacing: '0.02em',
                        }}>
                          {pts}
                        </span>
                        <span style={{ fontSize: 11, color: '#4a5a4c', marginLeft: 2 }}>pts</span>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Auto-refresh note */}
        <p style={{ textAlign: 'center', fontSize: 12, color: '#4a5a4c', marginTop: 20 }}>
          Classement rafraîchi toutes les {liveMatch ? '10' : '30'} secondes
          {liveMatch ? ' · Match en direct !' : ''}
        </p>
      </div>

      {/* Keyframe for live pulse */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}

const hBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 13px',
  color: '#6a7a6c', fontSize: 12, cursor: 'pointer',
}