import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'
import { Player, Coach, getFormationSlots } from '../store/fantasystore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamData {
  id: string
  name: string
  formation: string
  slots: Record<string, string | null>
  captain_id: string | null
  players_data: Record<string, Player>
  coach: Coach | null
  budget_used: number
  locked: boolean
  points: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  GK: '#f59e0b', DEF: '#3b82f6', MID: '#10b981', FWD: '#ef4444',
}

const POS_LABELS: Record<string, string> = {
  GK: 'Gardien', DEF: 'Défenseur', MID: 'Milieu', FWD: 'Attaquant',
}

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

// ── Helper : vérification règles ───────────────────────────────────────────────

function checkNationalityRule(
  slots: Record<string, string | null>,
  playersData: Record<string, Player>,
  slotToChange: string,
  newPlayer: Player
): string | null {
  const counts: Record<string, number> = {}
  Object.entries(slots).forEach(([sid, pid]) => {
    if (!pid || sid === slotToChange) return
    const p = playersData[pid]
    if (p) counts[p.nationality] = (counts[p.nationality] || 0) + 1
  })
  const newCount = (counts[newPlayer.nationality] || 0) + 1
  if (newCount > 3) return `Limite atteinte : déjà ${counts[newPlayer.nationality] || 0} joueur(s) de ${newPlayer.nationality} (max 3)`
  return null
}

function checkBudget(
  currentBudgetUsed: number,
  outPlayer: Player | null,
  inPlayer: Player,
  coachPrice: number
): string | null {
  const out = outPlayer?.price ?? 0
  const newBudget = currentBudgetUsed - out + inPlayer.price
  if (newBudget > 100) {
    return `Budget dépassé : ${newBudget.toFixed(1)}M / 100M (vous avez ${(100 - currentBudgetUsed + out).toFixed(1)}M disponibles)`
  }
  return null
}

// ── PlayerRow (dans l'équipe) ──────────────────────────────────────────────────

interface PlayerRowProps {
  slotId: string
  player: Player | null
  position: string
  isSelected: boolean
  onSelect: () => void
  isCaptn: boolean
}

function PlayerRow({ slotId, player, position, isSelected, onSelect, isCaptn }: PlayerRowProps) {
  const isBench = slotId.startsWith('BENCH_')
  const color = POS_COLORS[position] || '#888'

  return (
    <div
      onClick={player ? onSelect : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '9px 14px',
        background: isSelected
          ? `${color}18`
          : isBench ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${isSelected ? color + '55' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 8,
        cursor: player ? 'pointer' : 'default',
        transition: 'all 0.15s',
        opacity: !player ? 0.5 : 1,
      }}
    >
      {/* Position badge */}
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4,
        background: `${color}20`, color, border: `1px solid ${color}40`,
        minWidth: 36, textAlign: 'center', flexShrink: 0,
      }}>
        {position}
      </span>

      {/* Flag + Name */}
      {player ? (
        <>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{flag(player.nationality)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
              {player.name}
              {isCaptn && (
                <span style={{
                  background: '#c9a84c', color: '#0a1f0e',
                  fontSize: 9, fontWeight: 800, borderRadius: '50%',
                  width: 14, height: 14, display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                }}>C</span>
              )}
              {isBench && <span style={{ fontSize: 10, color: '#4a5a4c' }}>· Banc</span>}
            </div>
            <div style={{ fontSize: 11, color: '#6a7a6c' }}>{player.nationality}</div>
          </div>
          <span style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500, flexShrink: 0 }}>{player.price}M</span>
        </>
      ) : (
        <span style={{ flex: 1, fontSize: 13, color: '#4a5a4c' }}>
          Poste vide — {POS_LABELS[position] || position}
        </span>
      )}

      {/* Selection indicator */}
      {player && (
        <div style={{
          width: 18, height: 18, borderRadius: '50%',
          border: `2px solid ${isSelected ? color : 'rgba(255,255,255,0.15)'}`,
          background: isSelected ? color : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'all 0.15s', flexShrink: 0,
        }}>
          {isSelected && <span style={{ fontSize: 10, color: '#0a1f0e', fontWeight: 700 }}>✓</span>}
        </div>
      )}
    </div>
  )
}

// ── CandidateRow (joueurs candidats au transfert) ──────────────────────────────

interface CandidateRowProps {
  player: Player
  onSelect: () => void
  budgetError: string | null
  natError: string | null
  alreadyInTeam: boolean
}

function CandidateRow({ player, onSelect, budgetError, natError, alreadyInTeam }: CandidateRowProps) {
  const hasError = !!(budgetError || natError || alreadyInTeam)
  const color = POS_COLORS[player.position] || '#888'

  return (
    <div
      onClick={hasError ? undefined : onSelect}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 14px',
        background: hasError ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.03)',
        borderLeft: `3px solid ${hasError ? 'rgba(255,255,255,0.05)' : color}`,
        cursor: hasError ? 'not-allowed' : 'pointer',
        opacity: hasError ? 0.45 : 1,
        transition: 'all 0.12s',
      }}
    >
      <span style={{ fontSize: 20, flexShrink: 0 }}>{flag(player.nationality)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {player.name}
          {alreadyInTeam && <span style={{ marginLeft: 6, fontSize: 10, color: '#c9a84c' }}>✓ Équipe</span>}
        </div>
        <div style={{ fontSize: 11, color: '#6a7a6c' }}>
          {player.nationality}
          {budgetError && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· Budget insuffisant</span>}
          {natError && <span style={{ color: '#f59e0b', marginLeft: 6 }}>· Limite nationale</span>}
        </div>
      </div>
      <span style={{
        fontSize: 11, padding: '2px 6px', borderRadius: 4,
        background: `${color}20`, color, border: `1px solid ${color}40`, flexShrink: 0,
      }}>{player.position}</span>
      <span style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500, flexShrink: 0, minWidth: 34, textAlign: 'right' }}>
        {player.price}M
      </span>
    </div>
  )
}

// ── Main Transfers ─────────────────────────────────────────────────────────────

export default function Transfers() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()

  // ── État ─────────────────────────────────────────────────────────────────────
  const [team, setTeam] = useState<TeamData | null>(null)
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [slots, setSlots] = useState<Record<string, string | null>>({})
  const [playersData, setPlayersData] = useState<Record<string, Player>>({})
  const [coachData, setCoachData] = useState<Coach | null>(null)
  const [budgetUsed, setBudgetUsed] = useState(0)
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterPos, setFilterPos] = useState<string>('ALL')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const [pendingTransfers, setPendingTransfers] = useState<Array<{
    slotId: string
    outPlayer: Player | null
    inPlayer: Player
  }>>([])
  const [confirmed, setConfirmed] = useState(false)

  // ── Chargement ────────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [teamRes, playersRes] = await Promise.all([
        axios.get('/api/v1/fantasy/my-team'),
        axios.get('/api/v1/players'),
      ])

      const t = teamRes.data.team
      if (!t) {
        setError("Aucune équipe trouvée. Composez d'abord votre équipe.")
        setLoading(false)
        return
      }

      setTeam(t)
      const meta = t.players || {}
      const rawSlots: Record<string, string | null> = meta.slots || {}
      setSlots(rawSlots)
      setPlayersData(t.players_data || {})
      setCoachData(t.coach || null)
      setBudgetUsed(t.budget_used || 0)

      const allP: Player[] = playersRes.data.players || []
      setAllPlayers(allP)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // ── Computed ──────────────────────────────────────────────────────────────────
  const formSlots = team ? getFormationSlots(team.formation || '4-3-3') : []
  const selectedSlotDef = formSlots.find(s => s.slotId === selectedSlot)
  const selectedPlayer = selectedSlot && slots[selectedSlot] ? playersData[slots[selectedSlot]!] : null
  const slottedIds = new Set(Object.values(slots).filter(Boolean) as string[])

  // Candidats au transfert
  const candidates = allPlayers.filter(p => {
    if (selectedSlotDef && p.position !== selectedSlotDef.position) return false
    if (filterPos !== 'ALL' && p.position !== filterPos) return false
    if (search) {
      const q = search.toLowerCase()
      if (!p.name.toLowerCase().includes(q) && !p.nationality.toLowerCase().includes(q)) return false
    }
    return true
  })

  // ── Transfert ─────────────────────────────────────────────────────────────────
  const handleTransfer = (newPlayer: Player) => {
    if (!selectedSlot) return
    const outPlayer = selectedPlayer || null

    // Enregistrer le transfert dans la liste pending
    const existing = pendingTransfers.findIndex(t => t.slotId === selectedSlot)
    const transfer = { slotId: selectedSlot, outPlayer, inPlayer: newPlayer }
    if (existing >= 0) {
      const updated = [...pendingTransfers]
      updated[existing] = transfer
      setPendingTransfers(updated)
    } else {
      setPendingTransfers(prev => [...prev, transfer])
    }

    // Mettre à jour les slots localement
    const newSlots = { ...slots, [selectedSlot]: newPlayer.id }
    setSlots(newSlots)

    // Mettre à jour playersData
    setPlayersData(prev => ({ ...prev, [newPlayer.id]: newPlayer }))

    // Recalculer budget
    const newBudget = Object.entries(newSlots).reduce((sum, [, pid]) => {
      if (!pid) return sum
      const p = pid === newPlayer.id ? newPlayer : playersData[pid]
      return sum + (p?.price || 0)
    }, coachData?.price || 0)
    setBudgetUsed(newBudget)

    setSelectedSlot(null)
    setSearch('')
    setError(null)
  }

  const cancelTransfer = (slotId: string) => {
    const transfer = pendingTransfers.find(t => t.slotId === slotId)
    if (!transfer) return

    // Revenir à l'ancien joueur
    const newSlots = { ...slots, [slotId]: transfer.outPlayer?.id || null }
    setSlots(newSlots)

    // Recalculer budget
    const newBudget = Object.entries(newSlots).reduce((sum, [, pid]) => {
      if (!pid) return sum
      const p = playersData[pid]
      return sum + (p?.price || 0)
    }, coachData?.price || 0)
    setBudgetUsed(newBudget)

    setPendingTransfers(prev => prev.filter(t => t.slotId !== slotId))
  }

  const saveTransfers = async () => {
    if (!team || pendingTransfers.length === 0) return
    setSaving(true)
    setError(null)

    try {
      const payload = {
        name: team.name,
        formation: team.formation || '4-3-3',
        slots: slots,
        coach_id: coachData?.id || null,
        captain_id: team?.players?.captain_id || null,
      }

      await axios.post('/api/v1/fantasy/save', payload)
      setSuccessMsg(`✅ ${pendingTransfers.length} transfert(s) enregistré(s) !`)
      setPendingTransfers([])
      setConfirmed(true)
      setTimeout(() => { setSuccessMsg(null); setConfirmed(false) }, 4000)
      await loadData()
    } catch (e: any) {
      const detail = e.response?.data?.detail
      setError((typeof detail === 'object' ? detail?.message : detail) || 'Erreur de sauvegarde')
    } finally {
      setSaving(false)
    }
  }

  const budgetLeft = (100 - budgetUsed).toFixed(1)
  const budgetOk = budgetUsed <= 100

  // ── Locked check ──────────────────────────────────────────────────────────────
  if (team?.locked) {
    return (
      <div style={pageStyle}>
        <PageHeader user={user} navigate={navigate} logout={logout} />
        <div style={{ maxWidth: 600, margin: '4rem auto', padding: '0 1.5rem', textAlign: 'center' }}>
          <div style={lockedCard}>
            <span style={{ fontSize: 48 }}>🔒</span>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.8rem', letterSpacing: '0.04em', margin: '0.5rem 0' }}>
              Équipe verrouillée
            </h2>
            <p style={{ color: '#8a9a8c', fontSize: 14, marginBottom: '1.5rem' }}>
              Les transferts ne sont plus disponibles une fois les matchs commencés.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/fantasy')} style={btnGold}>
                👀 Voir mon équipe
              </button>
              <button onClick={() => navigate('/pronos')} style={btnOutline}>
                🎯 Mes pronostics
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={pageStyle}>
      <PageHeader user={user} navigate={navigate} logout={logout} />

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Title ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', letterSpacing: '0.04em', marginBottom: 4 }}>
              🔄 Transferts
            </h1>
            <p style={{ color: '#8a9a8c', fontSize: 14 }}>
              Remplacez vos joueurs avant le verrouillage de l'équipe
            </p>
          </div>

          {/* Budget bar */}
          <div style={{
            background: 'rgba(15,45,20,0.7)',
            border: `1px solid ${budgetOk ? 'rgba(255,255,255,0.08)' : 'rgba(239,68,68,0.4)'}`,
            borderRadius: 10, padding: '10px 16px', minWidth: 200,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Budget</span>
              <span style={{ fontSize: 12, color: budgetOk ? '#c9a84c' : '#ef4444', fontWeight: 600 }}>
                {budgetUsed.toFixed(1)}M / 100M
              </span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, (budgetUsed / 100) * 100)}%`,
                background: budgetOk ? (budgetUsed > 85 ? '#f59e0b' : '#10b981') : '#ef4444',
                borderRadius: 3, transition: 'width 0.4s ease',
              }} />
            </div>
            <div style={{ fontSize: 11, color: '#4a5a4c', marginTop: 4 }}>
              {budgetOk ? `${budgetLeft}M disponible` : `Dépassement de ${(budgetUsed - 100).toFixed(1)}M`}
            </div>
          </div>
        </div>

        {/* Messages */}
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
        {successMsg && (
          <div style={{
            background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
            borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#34d399',
            marginBottom: 16,
          }}>
            {successMsg}
          </div>
        )}

        {/* Transferts en attente */}
        {pendingTransfers.length > 0 && (
          <div style={{
            background: 'rgba(201,168,76,0.08)',
            border: '1px solid rgba(201,168,76,0.3)',
            borderRadius: 12, padding: '1rem 1.25rem',
            marginBottom: 16,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', color: '#c9a84c', letterSpacing: '0.04em' }}>
                🔄 {pendingTransfers.length} transfert(s) en attente
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => { setPendingTransfers([]); loadData() }}
                  style={{ ...btnOutlineSmall, color: '#f08080', borderColor: 'rgba(239,68,68,0.3)' }}
                >
                  ✕ Annuler tout
                </button>
                <button
                  onClick={saveTransfers}
                  disabled={saving || !budgetOk}
                  style={{ ...btnConfirm, opacity: (saving || !budgetOk) ? 0.5 : 1 }}
                >
                  {saving ? '⟳ Sauvegarde...' : '✅ Confirmer les transferts'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {pendingTransfers.map(t => (
                <div key={t.slotId} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  background: 'rgba(255,255,255,0.03)', borderRadius: 8,
                  padding: '8px 12px', flexWrap: 'wrap',
                }}>
                  {/* OUT */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
                    {t.outPlayer ? (
                      <>
                        <span style={{ fontSize: 16 }}>{flag(t.outPlayer.nationality)}</span>
                        <span style={{ fontSize: 13, color: '#f08080' }}>{t.outPlayer.name}</span>
                        <span style={{ fontSize: 11, color: '#8a9a8c' }}>{t.outPlayer.price}M</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 13, color: '#8a9a8c' }}>Poste vide</span>
                    )}
                  </div>

                  <span style={{ color: '#c9a84c', fontSize: 16, flexShrink: 0 }}>→</span>

                  {/* IN */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 120 }}>
                    <span style={{ fontSize: 16 }}>{flag(t.inPlayer.nationality)}</span>
                    <span style={{ fontSize: 13, color: '#10b981' }}>{t.inPlayer.name}</span>
                    <span style={{ fontSize: 11, color: '#8a9a8c' }}>{t.inPlayer.price}M</span>
                  </div>

                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <span style={{ fontSize: 11, color: t.inPlayer.price > (t.outPlayer?.price || 0) ? '#ef4444' : '#10b981' }}>
                      {t.inPlayer.price > (t.outPlayer?.price || 0) ? '+' : ''}{(t.inPlayer.price - (t.outPlayer?.price || 0)).toFixed(1)}M
                    </span>
                    <button onClick={() => cancelTransfer(t.slotId)} style={{
                      background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
                      borderRadius: 5, color: '#f08080', fontSize: 11, padding: '2px 8px', cursor: 'pointer',
                    }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>⟳ Chargement...</div>
        ) : !team ? (
          <div style={{ textAlign: 'center', padding: '4rem', color: '#8a9a8c' }}>
            <span style={{ fontSize: 48 }}>⚽</span>
            <p style={{ marginTop: 12 }}>Aucune équipe. <button onClick={() => navigate('/fantasy')} style={{ color: '#c9a84c', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>Composez-en une →</button></p>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>

            {/* ── Colonne équipe ── */}
            <div style={{ flex: '0 0 min(100%, 420px)', minWidth: 300 }}>
              <div style={{
                background: 'rgba(15,45,20,0.6)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: 14, overflow: 'hidden',
              }}>
                {/* Header équipe */}
                <div style={{
                  padding: '12px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  <div>
                    <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', letterSpacing: '0.04em' }}>
                      {team.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#8a9a8c' }}>
                      Formation {team.formation} · {selectedSlot ? 'Choisissez un remplaçant →' : 'Cliquez sur un joueur à transférer'}
                    </div>
                  </div>
                  {selectedSlot && (
                    <button onClick={() => setSelectedSlot(null)} style={{ background: 'none', border: 'none', color: '#8a9a8c', cursor: 'pointer', fontSize: 14 }}>✕</button>
                  )}
                </div>

                {/* Liste des joueurs par ligne */}
                <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {/* Titulaires */}
                  <div style={{ fontSize: 10, color: '#4a5a4c', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 4px 2px', marginTop: 4 }}>
                    Titulaires
                  </div>
                  {formSlots.filter(s => !s.slotId.startsWith('BENCH_')).map(({ slotId, position }) => {
                    const pid = slots[slotId]
                    const player = pid ? playersData[pid] : null
                    const isPending = pendingTransfers.some(t => t.slotId === slotId)
                    return (
                      <div key={slotId} style={{ position: 'relative' }}>
                        <PlayerRow
                          slotId={slotId}
                          player={player}
                          position={position}
                          isSelected={selectedSlot === slotId}
                          onSelect={() => {
                            setSelectedSlot(selectedSlot === slotId ? null : slotId)
                            setFilterPos(position)
                            setSearch('')
                          }}
                          isCaptn={(team?.players as any)?.captain_id === player?.id}
                        />
                        {isPending && (
                          <span style={{
                            position: 'absolute', top: 4, right: 4,
                            fontSize: 9, background: 'rgba(201,168,76,0.2)',
                            color: '#c9a84c', borderRadius: 4, padding: '1px 5px',
                            border: '1px solid rgba(201,168,76,0.3)',
                          }}>
                            Modifié
                          </span>
                        )}
                      </div>
                    )
                  })}

                  {/* Banc */}
                  <div style={{ fontSize: 10, color: '#4a5a4c', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '8px 4px 2px' }}>
                    Banc de touche
                  </div>
                  {formSlots.filter(s => s.slotId.startsWith('BENCH_')).map(({ slotId, position }) => {
                    const pid = slots[slotId]
                    const player = pid ? playersData[pid] : null
                    const isPending = pendingTransfers.some(t => t.slotId === slotId)
                    return (
                      <div key={slotId} style={{ position: 'relative' }}>
                        <PlayerRow
                          slotId={slotId}
                          player={player}
                          position={position}
                          isSelected={selectedSlot === slotId}
                          onSelect={() => {
                            setSelectedSlot(selectedSlot === slotId ? null : slotId)
                            setFilterPos(position)
                            setSearch('')
                          }}
                          isCaptn={false}
                        />
                        {isPending && (
                          <span style={{
                            position: 'absolute', top: 4, right: 4,
                            fontSize: 9, background: 'rgba(201,168,76,0.2)',
                            color: '#c9a84c', borderRadius: 4, padding: '1px 5px',
                            border: '1px solid rgba(201,168,76,0.3)',
                          }}>
                            Modifié
                          </span>
                        )}
                      </div>
                    )
                  })}

                  {/* Coach */}
                  {coachData && (
                    <>
                      <div style={{ fontSize: 10, color: '#4a5a4c', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '8px 4px 2px' }}>
                        Entraîneur
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '9px 14px', background: 'rgba(139,92,246,0.06)',
                        border: '1px solid rgba(139,92,246,0.15)', borderRadius: 8,
                      }}>
                        <span style={{ fontSize: 18 }}>{flag(coachData.nationality)}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 500 }}>{coachData.name}</div>
                          <div style={{ fontSize: 11, color: '#6a7a6c' }}>{coachData.nationality}</div>
                        </div>
                        <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>
                          Coach
                        </span>
                        <span style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500 }}>{coachData.price}M</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* ── Colonne candidats ── */}
            <div style={{ flex: '1 1 320px', minWidth: 300 }}>
              <div style={{
                background: 'rgba(12,28,16,0.7)',
                border: `1px solid ${selectedSlot ? `${POS_COLORS[selectedSlotDef?.position || ''] || 'rgba(201,168,76,0.3)'}55` : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 14, overflow: 'hidden',
                position: 'sticky', top: 80,
              }}>
                {/* Header picker */}
                <div style={{
                  padding: '12px 14px',
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                }}>
                  {selectedSlot ? (
                    <div style={{
                      background: `${POS_COLORS[selectedSlotDef?.position || ''] || '#c9a84c'}18`,
                      border: `1px solid ${POS_COLORS[selectedSlotDef?.position || ''] || '#c9a84c'}44`,
                      borderRadius: 6, padding: '6px 10px', marginBottom: 10,
                      fontSize: 12, color: POS_COLORS[selectedSlotDef?.position || ''] || '#c9a84c',
                      fontWeight: 500,
                    }}>
                      → Remplacer {selectedPlayer?.name || `poste ${selectedSlotDef?.position}`}
                      {selectedPlayer && <span style={{ color: '#8a9a8c', marginLeft: 6 }}>({selectedPlayer.price}M)</span>}
                    </div>
                  ) : (
                    <div style={{ fontSize: 12, color: '#6a7a6c', marginBottom: 10, textAlign: 'center' }}>
                      ← Sélectionnez un joueur à transférer
                    </div>
                  )}

                  <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="🔍 Nom ou nation..."
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 7, padding: '8px 12px',
                      color: '#f5f5f0', fontSize: 13, outline: 'none',
                      boxSizing: 'border-box', marginBottom: 8,
                    }}
                  />

                  {/* Filtre position */}
                  {!selectedSlot && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      {['ALL', 'GK', 'DEF', 'MID', 'FWD'].map(pos => (
                        <button key={pos} onClick={() => setFilterPos(pos)} style={{
                          flex: 1, borderRadius: 5, padding: '5px 2px',
                          background: filterPos === pos ? `${POS_COLORS[pos] ?? '#c9a84c'}20` : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${filterPos === pos ? (POS_COLORS[pos] ?? '#c9a84c') + '55' : 'rgba(255,255,255,0.07)'}`,
                          color: filterPos === pos ? (POS_COLORS[pos] ?? '#c9a84c') : '#6a7a6c',
                          fontSize: 11, cursor: 'pointer',
                        }}>
                          {pos}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Liste des candidats */}
                <div style={{ maxHeight: 520, overflowY: 'auto' }}>
                  {candidates.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6a7a6c', fontSize: 13 }}>
                      {selectedSlot ? 'Aucun joueur disponible pour ce poste' : 'Aucun résultat'}
                    </div>
                  ) : (
                    candidates.map(p => {
                      const budErr = selectedSlot
                        ? checkBudget(budgetUsed, selectedPlayer, p, coachData?.price || 0)
                        : null
                      const natErr = selectedSlot
                        ? checkNationalityRule(slots, playersData, selectedSlot, p)
                        : null
                      const inTeam = slottedIds.has(p.id) && slots[selectedSlot || ''] !== p.id
                      return (
                        <CandidateRow
                          key={p.id}
                          player={p}
                          onSelect={() => handleTransfer(p)}
                          budgetError={budErr}
                          natError={natErr}
                          alreadyInTeam={inTeam}
                        />
                      )
                    })
                  )}
                </div>

                {/* Nb résultats */}
                <div style={{ padding: '8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 11, color: '#4a5a4c' }}>
                  {candidates.length} joueur(s) affiché(s)
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}

// ── PageHeader ─────────────────────────────────────────────────────────────────

function PageHeader({ user, navigate, logout }: { user: any; navigate: any; logout: any }) {
  return (
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
            { to: '/transfers', label: '🔄 Transferts', active: true },
            { to: '/pronos', label: '🎯 Pronos' },
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
          <button onClick={() => navigate('/admin')} style={hBtn}>⚙ Admin</button>
        )}
        <span style={{ fontSize: 13, color: '#6a7a6c' }}>👤 {user?.username}</span>
        <button onClick={() => { logout(); navigate('/login') }} style={hBtn}>Déco</button>
      </div>
    </header>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: '#0a1f0e',
  color: '#f5f5f0',
  fontFamily: "'DM Sans', sans-serif",
}

const hBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 13px',
  color: '#6a7a6c', fontSize: 12, cursor: 'pointer',
}

const btnGold: React.CSSProperties = {
  background: '#c9a84c', color: '#0a1f0e',
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '1rem', letterSpacing: '0.08em',
  border: 'none', borderRadius: 8,
  padding: '10px 20px', cursor: 'pointer',
}

const btnOutline: React.CSSProperties = {
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 8, padding: '10px 20px',
  color: '#8a9a8c', fontSize: 13, cursor: 'pointer',
}

const btnOutlineSmall: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 6, padding: '6px 12px',
  color: '#8a9a8c', fontSize: 12, cursor: 'pointer',
}

const btnConfirm: React.CSSProperties = {
  background: 'linear-gradient(135deg, #10b981, #059669)',
  color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: '0.95rem', letterSpacing: '0.08em',
  border: 'none', borderRadius: 8,
  padding: '8px 20px', cursor: 'pointer',
}

const lockedCard: React.CSSProperties = {
  background: 'rgba(15,45,20,0.7)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 16, padding: '3rem 2rem',
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
  textAlign: 'center',
}