import React, { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────────────────────────────

interface FantasyTeam {
  points: number
  name: string
  budget_used: number
  locked: boolean
}

interface Match {
  id: string
  team_home: string
  team_away: string
  start_time: string
  group?: string
  stage?: string
  status: 'pending' | 'live' | 'finished'
  score_home?: number | null
  score_away?: number | null
}

interface RankEntry {
  rank: number
  user_id: string
  username: string
  team_name: string
  fantasy_points: number
  prono_points: number
  total_points: number
}

interface PronoResult {
  total_points: number
  pronos: Array<{ locked: boolean; match?: { status: string } }>
}

// ── Flag map ───────────────────────────────────────────────────────────────────

const FLAGS: Record<string, string> = {
  'France': '🇫🇷', 'Espagne': '🇪🇸', 'Allemagne': '🇩🇪', 'Brésil': '🇧🇷',
  'Argentine': '🇦🇷', 'Angleterre': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Portugal': '🇵🇹', 'Pays-Bas': '🇳🇱',
  'Belgique': '🇧🇪', 'Maroc': '🇲🇦', 'Sénégal': '🇸🇳', 'Norvège': '🇳🇴',
  'Algérie': '🇩🇿', 'Croatie': '🇭🇷', 'Uruguay': '🇺🇾', 'Colombie': '🇨🇴',
  'Mexique': '🇲🇽', 'États-Unis': '🇺🇸', 'Canada': '🇨🇦', 'Japon': '🇯🇵',
  'Corée du Sud': '🇰🇷', 'Australie': '🇦🇺', "Côte d'Ivoire": '🇨🇮',
  'Ghana': '🇬🇭', 'Afrique du Sud': '🇿🇦', 'Tunisie': '🇹🇳', 'Égypte': '🇪🇬',
  'Suisse': '🇨🇭', 'Suède': '🇸🇪', 'Turquie': '🇹🇷', 'Iran': '🇮🇷',
  'Arabie saoudite': '🇸🇦', 'Qatar': '🇶🇦', 'Irak': '🇮🇶', 'Équateur': '🇪🇨',
  'Paraguay': '🇵🇾', 'Panama': '🇵🇦', 'Haïti': '🇭🇹', 'Bosnie-Herzégovine': '🇧🇦',
  'Autriche': '🇦🇹', 'Écosse': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Tchéquie': '🇨🇿', 'Ouzbékistan': '🇺🇿',
  'Jordanie': '🇯🇴', 'Nouvelle-Zélande': '🇳🇿', 'Cap-Vert': '🇨🇻',
  'Curaçao': '🇨🇼', 'RD Congo': '🇨🇩',
}
const flag = (n: string) => FLAGS[n] || '🏳️'

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diff = d.getTime() - now.getTime()
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)

  if (diff < 0) return 'Passé'
  if (days === 0 && hours === 0) return `Dans ${mins}min`
  if (days === 0) return `Dans ${hours}h${mins > 0 ? mins + 'min' : ''}`
  if (days === 1) return `Demain ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function medalEmoji(rank: number) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return null
}

// ── NextMatchWidget ────────────────────────────────────────────────────────────

function NextMatchWidget({ match }: { match: Match }) {
  const isLive = match.status === 'live'
  const isFinished = match.status === 'finished'
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate('/pronos')}
      style={{
        background: isLive
          ? 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(239,68,68,0.06))'
          : 'rgba(15,45,20,0.7)',
        border: `1px solid ${isLive ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)'}`,
        borderRadius: 14, padding: '1.25rem',
        cursor: 'pointer', transition: 'all 0.2s',
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Live badge */}
      {isLive && (
        <div style={{
          position: 'absolute', top: 10, right: 12,
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'rgba(239,68,68,0.2)',
          border: '1px solid rgba(239,68,68,0.5)',
          borderRadius: 6, padding: '2px 8px',
          fontSize: 10, color: '#ef4444', fontWeight: 700,
          letterSpacing: '0.08em',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: '#ef4444', display: 'inline-block',
            animation: 'pulse 1.5s infinite',
          }} />
          LIVE
        </div>
      )}

      <div style={{ fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
        {isLive ? 'En cours' : isFinished ? 'Terminé' : 'Prochain match'} · {match.group ? `Groupe ${match.group}` : match.stage || ''}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Équipe domicile */}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: 28 }}>{flag(match.team_home)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f5f5f0', marginTop: 4 }}>{match.team_home}</div>
        </div>

        {/* Score ou horaire */}
        <div style={{ textAlign: 'center', flexShrink: 0, minWidth: 80 }}>
          {(isLive || isFinished) && match.score_home !== null && match.score_away !== null ? (
            <div style={{
              fontFamily: "'Bebas Neue', sans-serif",
              fontSize: 32, color: '#c9a84c', letterSpacing: '0.04em', lineHeight: 1,
            }}>
              {match.score_home} – {match.score_away}
            </div>
          ) : (
            <>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 13, color: '#c9a84c', letterSpacing: '0.06em',
              }}>
                VS
              </div>
              <div style={{ fontSize: 11, color: '#8a9a8c', marginTop: 4 }}>
                {fmtDate(match.start_time)}
              </div>
            </>
          )}
        </div>

        {/* Équipe extérieur */}
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 28 }}>{flag(match.team_away)}</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#f5f5f0', marginTop: 4 }}>{match.team_away}</div>
        </div>
      </div>

      <div style={{ marginTop: 10, textAlign: 'center', fontSize: 12, color: '#4a5a4c' }}>
        Pronostiquer →
      </div>
    </div>
  )
}

// ── RankingWidget ──────────────────────────────────────────────────────────────

function RankingWidget({ entries, myId, loading }: { entries: RankEntry[]; myId: string; loading: boolean }) {
  const navigate = useNavigate()
  const top5 = entries.slice(0, 5)
  const myEntry = entries.find(e => e.user_id === myId)
  const myInTop5 = top5.some(e => e.user_id === myId)

  return (
    <div style={{
      background: 'rgba(15,45,20,0.7)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 14, padding: '1.25rem',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', color: '#f5f5f0', letterSpacing: '0.04em' }}>
          📊 Classement
        </span>
        <button onClick={() => navigate('/ranking')} style={{
          background: 'transparent', border: 'none',
          color: '#c9a84c', fontSize: 12, cursor: 'pointer',
        }}>
          Voir tout →
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '1.5rem', color: '#8a9a8c', fontSize: 13 }}>⟳ Chargement...</div>
      ) : entries.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '1rem', color: '#8a9a8c', fontSize: 13 }}>Aucun participant</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {top5.map(e => {
            const isMe = e.user_id === myId
            const m = medalEmoji(e.rank)
            return (
              <div key={e.user_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', borderRadius: 8,
                background: isMe ? 'rgba(201,168,76,0.1)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${isMe ? 'rgba(201,168,76,0.3)' : 'transparent'}`,
                transition: 'all 0.15s',
              }}>
                <span style={{ width: 24, textAlign: 'center', fontSize: m ? 16 : 12, color: '#4a5a4c', fontFamily: "'Bebas Neue', sans-serif" }}>
                  {m || `#${e.rank}`}
                </span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: isMe ? 600 : 400, color: isMe ? '#c9a84c' : '#f5f5f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.username}
                  {isMe && <span style={{ fontSize: 10, color: '#c9a84c', marginLeft: 5 }}>← moi</span>}
                </span>
                <span style={{ fontSize: 13, fontFamily: "'Bebas Neue', sans-serif", color: e.rank === 1 ? '#c9a84c' : '#f5f5f0', letterSpacing: '0.02em' }}>
                  {e.total_points}
                </span>
                <span style={{ fontSize: 10, color: '#4a5a4c' }}>pts</span>
              </div>
            )
          })}

          {/* Ma position si hors top 5 */}
          {myEntry && !myInTop5 && (
            <>
              <div style={{ textAlign: 'center', fontSize: 11, color: '#4a5a4c', padding: '2px 0' }}>···</div>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '6px 10px', borderRadius: 8,
                background: 'rgba(201,168,76,0.1)',
                border: '1px solid rgba(201,168,76,0.3)',
              }}>
                <span style={{ width: 24, textAlign: 'center', fontSize: 12, color: '#c9a84c', fontFamily: "'Bebas Neue', sans-serif" }}>#{myEntry.rank}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#c9a84c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {myEntry.username} ← moi
                </span>
                <span style={{ fontSize: 13, fontFamily: "'Bebas Neue', sans-serif", color: '#f5f5f0' }}>{myEntry.total_points}</span>
                <span style={{ fontSize: 10, color: '#4a5a4c' }}>pts</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── StatCard ───────────────────────────────────────────────────────────────────

interface StatCardProps {
  icon: string
  label: string
  value: string | number
  sub?: string
  color?: string
  onClick?: () => void
  pulse?: boolean
}

function StatCard({ icon, label, value, sub, color = '#c9a84c', onClick, pulse }: StatCardProps) {
  const [hover, setHover] = useState(false)
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: hover && onClick ? 'rgba(15,45,20,0.9)' : 'rgba(15,45,20,0.7)',
        border: `1px solid ${hover && onClick ? 'rgba(201,168,76,0.3)' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14, padding: '1.25rem',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.2s',
        transform: hover && onClick ? 'translateY(-2px)' : 'none',
        display: 'flex', flexDirection: 'column', gap: 6,
        position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Accent glow */}
      {pulse && (
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 80, height: 80, borderRadius: '50%',
          background: `${color}15`,
          pointerEvents: 'none',
        }} />
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        {onClick && <span style={{ fontSize: 12, color: '#4a5a4c' }}>→</span>}
      </div>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color, lineHeight: 1, letterSpacing: '0.02em' }}>
        {value === null || value === undefined ? '—' : value}
      </div>
      <div style={{ fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#4a5a4c' }}>{sub}</div>}
    </div>
  )
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  // ── État ─────────────────────────────────────────────────────────────────────
  const [fantasyTeam, setFantasyTeam] = useState<FantasyTeam | null>(null)
  const [pronoData, setPronoData] = useState<PronoResult | null>(null)
  const [rankEntries, setRankEntries] = useState<RankEntry[]>([])
  const [nextMatch, setNextMatch] = useState<Match | null>(null)
  const [liveMatch, setLiveMatch] = useState<Match | null>(null)
  const [myRank, setMyRank] = useState<number | null>(null)
  const [loadingRank, setLoadingRank] = useState(true)
  const [loadingAll, setLoadingAll] = useState(true)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const [teamRes, pronoRes, rankRes, matchRes] = await Promise.allSettled([
        axios.get('/api/v1/fantasy/my-team'),
        axios.get('/api/v1/pronos/my'),
        axios.get('/api/v1/ranking'),
        axios.get('/api/v1/matches?status=pending'),
      ])

      if (teamRes.status === 'fulfilled') {
        setFantasyTeam(teamRes.value.data.team || null)
      }

      if (pronoRes.status === 'fulfilled') {
        setPronoData(pronoRes.value.data)
      }

      if (rankRes.status === 'fulfilled') {
        const entries: RankEntry[] = rankRes.value.data.ranking || []
        setRankEntries(entries)
        setLoadingRank(false)
        const me = entries.find(e => e.user_id === user?.id)
        if (me) setMyRank(me.rank)
      }

      if (matchRes.status === 'fulfilled') {
        const matches: Match[] = matchRes.value.data.matches || []
        if (matches.length > 0) setNextMatch(matches[0])
      }

      // Check for live match
      const liveRes = await axios.get('/api/v1/matches?status=live').catch(() => null)
      if (liveRes?.data?.matches?.length > 0) {
        setLiveMatch(liveRes.data.matches[0])
      } else {
        setLiveMatch(null)
      }

      setLastRefresh(new Date())
    } catch (e) {
      console.error('[Dashboard] load error:', e)
    } finally {
      setLoadingAll(false)
    }
  }, [user?.id])

  useEffect(() => {
    load()
    const interval = setInterval(load, 60_000)
    return () => clearInterval(interval)
  }, [load])

  // ── Computed ──────────────────────────────────────────────────────────────────
  const fantasyPoints = fantasyTeam?.points ?? 0
  const pronoPoints = pronoData?.total_points ?? 0
  const totalPoints = fantasyPoints + pronoPoints
  const pendingPronos = pronoData?.pronos?.filter(p => !p.locked).length ?? 0
  const budgetLeft = fantasyTeam ? (100 - (fantasyTeam.budget_used || 0)).toFixed(1) : '—'
  const displayMatch = liveMatch || nextMatch

  // ── Greeting ──────────────────────────────────────────────────────────────────
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Bonjour' : hour < 18 ? 'Bonjour' : 'Bonsoir'

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a1f0e',
      color: '#f5f5f0',
      fontFamily: "'DM Sans', sans-serif",
    }}>

      {/* ── Header ── */}
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
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', color: '#c9a84c', letterSpacing: '0.04em' }}>
            🏆 Fantasy Boulzazen
          </span>
          {/* Desktop nav */}
          <nav style={{ display: 'flex', gap: 4 }} className="desktop-nav">
            {[
              { to: '/dashboard', label: 'Dashboard', active: true },
              { to: '/fantasy', label: '⚽ Équipe' },
              { to: '/pronos', label: '🎯 Pronos' },
              { to: '/ranking', label: '📊 Classement' },
            ].map(({ to, label, active }) => (
              <button key={to} onClick={() => navigate(to)} style={{
                background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
                border: active ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 12px',
                color: active ? '#c9a84c' : '#6a7a6c',
                fontSize: 13, cursor: 'pointer', transition: 'all 0.2s',
              }}>{label}</button>
            ))}
          </nav>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {liveMatch && (
            <span style={{
              background: 'rgba(239,68,68,0.12)',
              border: '1px solid rgba(239,68,68,0.4)',
              borderRadius: 6, padding: '3px 9px',
              fontSize: 11, color: '#ef4444',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: '#ef4444', display: 'inline-block',
                animation: 'pulse 1.5s infinite',
              }} />
              LIVE
            </span>
          )}
          {user?.role === 'admin' && (
            <button onClick={() => navigate('/admin')} style={hBtn}>⚙ Admin</button>
          )}
          <span style={{ fontSize: 13, color: '#6a7a6c' }}>👤 {user?.username}</span>
          <button onClick={() => { logout(); navigate('/login') }} style={hBtn}>Déconnexion</button>
        </div>
      </header>

      {/* ── Body ── */}
      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Hero greeting ── */}
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: 'clamp(1.8rem, 4vw, 2.8rem)',
            letterSpacing: '0.04em',
            color: '#f5f5f0', marginBottom: 6, lineHeight: 1.1,
          }}>
            {greeting}, {user?.username} ! 🎉
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <p style={{ color: '#8a9a8c', fontSize: 14 }}>
              Coupe du Monde 2026 — {fantasyTeam?.name || 'Construis ton équipe'}
            </p>
            {lastRefresh && (
              <span style={{ fontSize: 11, color: '#4a5a4c' }}>
                · Mis à jour {lastRefresh.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {pendingPronos > 0 && (
              <span
                onClick={() => navigate('/pronos')}
                style={{
                  background: 'rgba(201,168,76,0.15)',
                  border: '1px solid rgba(201,168,76,0.4)',
                  borderRadius: 6, padding: '3px 10px',
                  fontSize: 12, color: '#c9a84c', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  animation: 'fadeIn 0.3s ease',
                }}
              >
                <span style={{
                  background: '#c9a84c', color: '#0a1f0e',
                  borderRadius: '50%', width: 16, height: 16,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700,
                }}>{pendingPronos}</span>
                prono{pendingPronos > 1 ? 's' : ''} en attente
              </span>
            )}
          </div>
        </div>

        {/* ── Grille principale ── */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: 16,
          marginBottom: 16,
        }}>

          {/* Colonne stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Stats KPIs */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 10,
            }}>
              <StatCard
                icon="🏅"
                label="Points Fantasy"
                value={loadingAll ? '…' : fantasyPoints}
                sub={fantasyTeam?.name}
                color="#10b981"
                onClick={() => navigate('/fantasy')}
                pulse
              />
              <StatCard
                icon="🎯"
                label="Points Pronos"
                value={loadingAll ? '…' : pronoPoints}
                sub={`${(pronoData?.pronos?.filter(p => p.locked).length) ?? 0} résultats`}
                color="#3b82f6"
                onClick={() => navigate('/pronos')}
                pulse
              />
              <StatCard
                icon="🏆"
                label="Total"
                value={loadingAll ? '…' : totalPoints}
                color="#c9a84c"
                pulse
              />
              <StatCard
                icon="📊"
                label="Mon rang"
                value={loadingAll ? '…' : myRank ? `#${myRank}` : '—'}
                sub={`sur ${rankEntries.length} joueurs`}
                onClick={() => navigate('/ranking')}
              />
            </div>

            {/* Budget restant */}
            <div style={{
              background: 'rgba(15,45,20,0.7)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14, padding: '1rem 1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  Budget Fantasy
                </span>
                <span style={{ fontSize: 13, color: '#c9a84c', fontWeight: 500 }}>
                  {budgetLeft}M restant
                </span>
              </div>
              <div style={{ height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${fantasyTeam ? Math.min(100, (fantasyTeam.budget_used / 100) * 100) : 0}%`,
                  background: fantasyTeam && fantasyTeam.budget_used > 85 ? '#f59e0b' : '#10b981',
                  borderRadius: 3, transition: 'width 0.6s ease',
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span style={{ fontSize: 11, color: '#4a5a4c' }}>
                  {fantasyTeam?.budget_used?.toFixed(1) ?? 0}M utilisé
                </span>
                <span style={{ fontSize: 11, color: '#4a5a4c' }}>100M max</span>
              </div>
            </div>

            {/* Raccourcis */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button onClick={() => navigate('/fantasy')} style={quickBtn('#3b82f6')}>
                ⚽ Composer mon équipe
              </button>
              <button onClick={() => navigate('/pronos')} style={quickBtn('#c9a84c')}>
                🎯 Pronostiquer
              </button>
              <button onClick={() => navigate('/ranking')} style={quickBtn('#10b981')}>
                📊 Classement
              </button>
              {user?.role === 'admin' && (
                <button onClick={() => navigate('/admin')} style={quickBtn('#8b5cf6')}>
                  ⚙ Admin
                </button>
              )}
            </div>
          </div>

          {/* Colonne droite : prochain match + classement */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Prochain match / Match en cours */}
            {displayMatch ? (
              <NextMatchWidget match={displayMatch} />
            ) : (
              <div style={{
                background: 'rgba(15,45,20,0.5)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 14, padding: '1.5rem',
                textAlign: 'center', color: '#4a5a4c',
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📅</div>
                <div style={{ fontSize: 13 }}>Aucun match programmé</div>
              </div>
            )}

            {/* Widget classement */}
            <RankingWidget
              entries={rankEntries}
              myId={user?.id || ''}
              loading={loadingRank}
            />
          </div>
        </div>

        {/* ── Activité récente (derniers pronos) ── */}
        {pronoData?.pronos && pronoData.pronos.filter(p => p.locked).length > 0 && (
          <div style={{
            background: 'rgba(15,45,20,0.6)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 14, padding: '1.25rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', color: '#f5f5f0', letterSpacing: '0.04em' }}>
                📋 Activité récente
              </span>
              <button onClick={() => navigate('/pronos')} style={{ background: 'transparent', border: 'none', color: '#c9a84c', fontSize: 12, cursor: 'pointer' }}>
                Voir tout →
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <div style={{
                background: 'rgba(16,185,129,0.08)',
                border: '1px solid rgba(16,185,129,0.2)',
                borderRadius: 8, padding: '8px 14px',
                fontSize: 13,
              }}>
                <span style={{ color: '#10b981', fontWeight: 600 }}>{pronoData.pronos.filter((p: any) => p.points >= 5).length}</span>
                <span style={{ color: '#8a9a8c', marginLeft: 5 }}>scores exacts (+5pts)</span>
              </div>
              <div style={{
                background: 'rgba(59,130,246,0.08)',
                border: '1px solid rgba(59,130,246,0.2)',
                borderRadius: 8, padding: '8px 14px',
                fontSize: 13,
              }}>
                <span style={{ color: '#3b82f6', fontWeight: 600 }}>{pronoData.pronos.filter((p: any) => p.points === 2).length}</span>
                <span style={{ color: '#8a9a8c', marginLeft: 5 }}>bonnes issues (+2pts)</span>
              </div>
              <div style={{
                background: 'rgba(239,68,68,0.06)',
                border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 8, padding: '8px 14px',
                fontSize: 13,
              }}>
                <span style={{ color: '#ef4444', fontWeight: 600 }}>{pronoData.pronos.filter((p: any) => p.points === 0 && p.locked).length}</span>
                <span style={{ color: '#8a9a8c', marginLeft: 5 }}>mauvais pronostics</span>
              </div>
            </div>
          </div>
        )}
      </main>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: none; }
        }
        @media (max-width: 640px) {
          .desktop-nav { display: none !important; }
        }
      `}</style>
    </div>
  )
}

// ── Micro styles ───────────────────────────────────────────────────────────────

const hBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 13px',
  color: '#6a7a6c', fontSize: 12, cursor: 'pointer',
}

function quickBtn(accent: string): React.CSSProperties {
  return {
    background: `${accent}10`,
    border: `1px solid ${accent}30`,
    borderRadius: 9, padding: '8px 14px',
    color: accent, cursor: 'pointer',
    fontFamily: "'DM Sans', sans-serif",
    fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
    transition: 'all 0.2s',
  }
}