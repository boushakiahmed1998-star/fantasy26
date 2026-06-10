import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Match {
  id: string
  team_home: string
  team_away: string
  start_time: string
  group?: string
  stage?: string
  status?: string
  score_home?: number | null
  score_away?: number | null
  my_prono?: { prediction: { score_home: number; score_away: number }; locked: boolean } | null
}

interface MyProno {
  id: string
  match_id: string
  prediction: { score_home: number; score_away: number }
  points: number
  locked: boolean
  match: Match
}

// ── Helpers ────────────────────────────────────────────────────────────────────

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

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function outcomeLabel(h: number, a: number) {
  if (h > a) return 'V Dom.'
  if (h < a) return 'V Ext.'
  return 'Nul'
}

function pronoColor(pts: number) {
  if (pts >= 5) return '#c9a84c'  // exact
  if (pts >= 2) return '#10b981'  // bonne issue
  return '#ef4444'                // mauvais
}

// ── ScoreInput ────────────────────────────────────────────────────────────────

function ScoreInput({
  value, onChange, disabled,
}: { value: number; onChange: (v: number) => void; disabled: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <button
        disabled={disabled || value === 0}
        onClick={() => onChange(Math.max(0, value - 1))}
        style={miniBtn(disabled || value === 0)}
      >−</button>
      <span style={{
        width: 36, textAlign: 'center', fontSize: 22,
        fontFamily: "'Bebas Neue', sans-serif",
        color: disabled ? '#8a9a8c' : '#f5f5f0',
        lineHeight: 1,
      }}>
        {value}
      </span>
      <button
        disabled={disabled || value >= 20}
        onClick={() => onChange(Math.min(20, value + 1))}
        style={miniBtn(disabled || value >= 20)}
      >+</button>
    </div>
  )
}

function miniBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 28, borderRadius: '50%',
    background: disabled ? 'rgba(255,255,255,0.04)' : 'rgba(201,168,76,0.15)',
    border: `1px solid ${disabled ? 'rgba(255,255,255,0.06)' : 'rgba(201,168,76,0.35)'}`,
    color: disabled ? '#4a5a4c' : '#c9a84c',
    fontSize: 16, cursor: disabled ? 'not-allowed' : 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, transition: 'all 0.15s',
    flexShrink: 0,
  }
}

// ── MatchCard ─────────────────────────────────────────────────────────────────

function MatchCard({ match, onSubmit }: { match: Match; onSubmit: () => void }) {
  const existingPred = match.my_prono?.prediction
  const [home, setHome] = useState(existingPred?.score_home ?? 1)
  const [away, setAway] = useState(existingPred?.score_away ?? 1)
  const [submitting, setSubmitting] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const locked = !!match.my_prono?.locked

  const handleSubmit = async () => {
    setSubmitting(true)
    setMsg(null)
    try {
      await axios.post('/api/v1/pronos', {
        match_id: match.id,
        score_home: home,
        score_away: away,
      })
      setMsg('✅ Pronostic enregistré !')
      setTimeout(() => { setMsg(null); onSubmit() }, 1500)
    } catch (e: any) {
      setMsg(`⚠ ${e.response?.data?.detail || 'Erreur'}`)
    } finally { setSubmitting(false) }
  }

  return (
    <div style={{
      background: 'rgba(15,45,20,0.65)',
      border: existingPred
        ? '1px solid rgba(201,168,76,0.35)'
        : '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12, padding: '1.1rem 1.25rem',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 11, color: '#8a9a8c', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {match.group ? `Groupe ${match.group}` : match.stage || ''} · {fmtDate(match.start_time)}
        </span>
        {existingPred && (
          <span style={{
            fontSize: 11, background: 'rgba(201,168,76,0.1)',
            color: '#c9a84c', borderRadius: 5, padding: '2px 8px',
            border: '1px solid rgba(201,168,76,0.3)',
          }}>
            {locked ? '🔒 Verrouillé' : '✏️ Modifiable'}
          </span>
        )}
      </div>

      {/* Teams + Score input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Home */}
        <div style={{ flex: 1, textAlign: 'right' }}>
          <div style={{ fontSize: 18 }}>{flag(match.team_home)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f0', marginTop: 2 }}>
            {match.team_home}
          </div>
        </div>

        {/* Score inputs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <ScoreInput value={home} onChange={setHome} disabled={locked || submitting} />
          <span style={{ fontSize: 18, color: '#8a9a8c', fontWeight: 700 }}>–</span>
          <ScoreInput value={away} onChange={setAway} disabled={locked || submitting} />
        </div>

        {/* Away */}
        <div style={{ flex: 1, textAlign: 'left' }}>
          <div style={{ fontSize: 18 }}>{flag(match.team_away)}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#f5f5f0', marginTop: 2 }}>
            {match.team_away}
          </div>
        </div>
      </div>

      {/* Outcome hint */}
      <div style={{ textAlign: 'center', fontSize: 12, color: '#8a9a8c' }}>
        {outcomeLabel(home, away)}
      </div>

      {/* Feedback */}
      {msg && (
        <div style={{
          textAlign: 'center', fontSize: 13,
          color: msg.startsWith('✅') ? '#10b981' : '#f08080',
        }}>
          {msg}
        </div>
      )}

      {/* Submit */}
      {!locked && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            background: submitting ? 'rgba(201,168,76,0.2)' : '#c9a84c',
            color: submitting ? '#c9a84c' : '#0a1f0e',
            border: 'none', borderRadius: 8,
            padding: '9px 20px',
            fontFamily: "'Bebas Neue', sans-serif",
            fontSize: '0.95rem', letterSpacing: '0.08em',
            cursor: submitting ? 'not-allowed' : 'pointer',
            width: '100%', transition: 'all 0.2s',
          }}
        >
          {submitting ? '⟳ ...' : existingPred ? '✏️ Modifier le pronostic' : '✅ Valider'}
        </button>
      )}
    </div>
  )
}

// ── ResultCard ────────────────────────────────────────────────────────────────

function ResultCard({ prono }: { prono: MyProno }) {
  const { match, prediction, points, locked } = prono
  const realH = match.score_home ?? null
  const realA = match.score_away ?? null

  return (
    <div style={{
      background: 'rgba(15,45,20,0.65)',
      border: `1px solid ${points >= 5 ? 'rgba(201,168,76,0.4)' : points >= 2 ? 'rgba(16,185,129,0.3)' : 'rgba(255,255,255,0.07)'}`,
      borderRadius: 12, padding: '1rem 1.25rem',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: '#8a9a8c' }}>
          {match.group ? `Groupe ${match.group}` : ''} · {fmtDate(match.start_time || '')}
        </span>
        {locked && (
          <span style={{
            fontSize: 14, fontWeight: 700,
            color: pronoColor(points),
            fontFamily: "'Bebas Neue', sans-serif",
            letterSpacing: '0.04em',
          }}>
            {points >= 5 ? '🏆' : points >= 2 ? '✓' : '✗'} {points} pt{points > 1 ? 's' : ''}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        <div style={{ textAlign: 'right', flex: 1 }}>
          <span style={{ fontSize: 20 }}>{flag(match.team_home)}</span>
          <div style={{ fontSize: 12, color: '#f5f5f0' }}>{match.team_home}</div>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 13, color: '#8a9a8c', marginBottom: 2 }}>Mon prono</div>
          <div style={{
            fontFamily: "'Bebas Neue', sans-serif", fontSize: 22,
            color: '#c9a84c', letterSpacing: '0.04em',
          }}>
            {prediction.score_home} – {prediction.score_away}
          </div>
          {realH !== null && realA !== null && (
            <>
              <div style={{ fontSize: 11, color: '#8a9a8c', marginTop: 2 }}>Résultat</div>
              <div style={{
                fontFamily: "'Bebas Neue', sans-serif", fontSize: 18,
                color: '#f5f5f0',
              }}>
                {realH} – {realA}
              </div>
            </>
          )}
        </div>

        <div style={{ textAlign: 'left', flex: 1 }}>
          <span style={{ fontSize: 20 }}>{flag(match.team_away)}</span>
          <div style={{ fontSize: 12, color: '#f5f5f0' }}>{match.team_away}</div>
        </div>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Pronos() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  const [tab, setTab] = useState<'upcoming' | 'results'>('upcoming')
  const [upcoming, setUpcoming] = useState<Match[]>([])
  const [myPronos, setMyPronos] = useState<MyProno[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [totalPronoPoints, setTotalPronoPoints] = useState(0)

  const loadUpcoming = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/v1/pronos/upcoming')
      setUpcoming(data.matches || [])
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur de chargement')
    }
  }, [])

  const loadResults = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/v1/pronos/my')
      const done = (data.pronos || []).filter((p: MyProno) => p.locked)
      setMyPronos(done)
      setTotalPronoPoints(data.total_points || 0)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur de chargement')
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    Promise.all([loadUpcoming(), loadResults()]).finally(() => setLoading(false))
  }, [])

  const pendingCount = upcoming.filter(m => !m.my_prono).length
  const resultCount = myPronos.length

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
              { to: '/pronos', label: '🎯 Pronostics', active: true },
              { to: '/ranking', label: '📊 Classement' },
            ].map(({ to, label, active }) => (
              <button key={to} onClick={() => navigate(to)} style={{
                background: active ? 'rgba(201,168,76,0.12)' : 'transparent',
                border: active ? '1px solid rgba(201,168,76,0.3)' : '1px solid transparent',
                borderRadius: 6, padding: '5px 12px',
                color: active ? '#c9a84c' : '#6a7a6c', fontSize: 13, cursor: 'pointer',
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

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Title + points */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: '0.04em', marginBottom: 4 }}>
              🎯 Pronostics
            </h1>
            <p style={{ color: '#8a9a8c', fontSize: 14 }}>
              Score exact → +5 pts · Bonne issue → +2 pts · Barème Coupe du Monde 2026
            </p>
          </div>
          {totalPronoPoints > 0 && (
            <div style={{
              background: 'rgba(201,168,76,0.1)',
              border: '1px solid rgba(201,168,76,0.3)',
              borderRadius: 10, padding: '0.75rem 1.25rem',
              textAlign: 'center',
            }}>
              <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: '#c9a84c', lineHeight: 1 }}>
                {totalPronoPoints}
              </div>
              <div style={{ fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Pts pronos
              </div>
            </div>
          )}
        </div>

        {error && (
          <div style={{
            background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f08080',
            marginBottom: 16, display: 'flex', justifyContent: 'space-between',
          }}>
            <span>⚠ {error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#f08080', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, marginBottom: '1.25rem', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <button
            onClick={() => setTab('upcoming')}
            style={{
              background: tab === 'upcoming' ? 'rgba(201,168,76,0.08)' : 'transparent',
              border: 'none', borderBottom: tab === 'upcoming' ? '2px solid #c9a84c' : '2px solid transparent',
              color: tab === 'upcoming' ? '#c9a84c' : '#8a9a8c',
              padding: '10px 20px', fontSize: 14, cursor: 'pointer',
            }}
          >
            📅 À venir
            {pendingCount > 0 && (
              <span style={{
                marginLeft: 7, background: '#c9a84c', color: '#0a1f0e',
                borderRadius: '50%', width: 18, height: 18,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700,
              }}>{pendingCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('results')}
            style={{
              background: tab === 'results' ? 'rgba(201,168,76,0.08)' : 'transparent',
              border: 'none', borderBottom: tab === 'results' ? '2px solid #c9a84c' : '2px solid transparent',
              color: tab === 'results' ? '#c9a84c' : '#8a9a8c',
              padding: '10px 20px', fontSize: 14, cursor: 'pointer',
            }}
          >
            📋 Mes résultats ({resultCount})
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>⟳ Chargement...</div>
        ) : tab === 'upcoming' ? (
          upcoming.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>
              <span style={{ fontSize: 48 }}>📅</span>
              <p style={{ marginTop: 12 }}>Aucun match à venir pour l'instant.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Les matchs apparaîtront ici dès qu'ils seront programmés.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {upcoming.map(m => (
                <MatchCard key={m.id} match={m} onSubmit={loadUpcoming} />
              ))}
            </div>
          )
        ) : (
          myPronos.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>
              <span style={{ fontSize: 48 }}>📋</span>
              <p style={{ marginTop: 12 }}>Aucun résultat disponible.</p>
              <p style={{ fontSize: 13, marginTop: 6 }}>Les scores apparaîtront une fois les matchs terminés.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myPronos.map(p => <ResultCard key={p.id} prono={p} />)}
            </div>
          )
        )}
      </div>
    </div>
  )
}

const hBtnStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 13px',
  color: '#6a7a6c', fontSize: 12, cursor: 'pointer',
}