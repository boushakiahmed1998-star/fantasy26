import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import {
  useFantasyStore,
  Player,
  Coach,
  FORMATIONS,
  FIELD_POSITIONS,
  getFormationSlots,
  isBenchSlot,
} from '../store/fantasystore'
import { useAuthStore } from '../store/authStore'

// ── Constants ──────────────────────────────────────────────────────────────────

const POS_COLORS: Record<string, string> = {
  GK: '#f59e0b', DEF: '#3b82f6', MID: '#10b981', FWD: '#ef4444',
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

function flag(nat: string) { return FLAGS[nat] || '🏳️' }

// Prix par tranche
const PRICE_RANGES = [
  { label: 'Tous les prix', min: 0, max: 999 },
  { label: '≤ 5M', min: 0, max: 5 },
  { label: '5 – 7M', min: 5, max: 7 },
  { label: '7 – 9M', min: 7, max: 9 },
  { label: '9 – 11M', min: 9, max: 11 },
  { label: '≥ 11M', min: 11, max: 999 },
]

// ── FieldSlot ──────────────────────────────────────────────────────────────────

interface SlotProps {
  slotId: string
  position: string
  player: Player | null
  isActive: boolean
  isCaptn: boolean
  onClick: () => void
  onRemove: (e: React.MouseEvent) => void
  onSetCaptn: (e: React.MouseEvent) => void
  size?: number
}

function FieldSlot({ slotId, position, player, isActive, isCaptn, onClick, onRemove, onSetCaptn, size = 52 }: SlotProps) {
  const [hover, setHover] = useState(false)
  const color = POS_COLORS[position] || '#888'

  return (
    <div
      style={{ position: 'relative', width: size + 12, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        onClick={onClick}
        style={{
          width: size, height: size, borderRadius: '50%',
          border: player ? `2px solid ${color}` : `2px dashed ${isActive ? color : 'rgba(255,255,255,0.25)'}`,
          background: player
            ? `${color}30`
            : isActive ? `${color}20` : 'rgba(0,0,0,0.35)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer',
          transition: 'all 0.2s',
          transform: (hover || isActive) ? 'scale(1.1)' : 'scale(1)',
          boxShadow: isActive ? `0 0 14px ${color}88` : player ? `0 2px 10px rgba(0,0,0,0.5)` : 'none',
          userSelect: 'none',
        }}
      >
        {player ? (
          <span style={{ fontSize: size * 0.38, lineHeight: 1 }}>{flag(player.nationality)}</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
            <span style={{ fontSize: size * 0.18, color: isActive ? color : 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.04em' }}>
              {position}
            </span>
            <span style={{ fontSize: size * 0.26, color: isActive ? color : 'rgba(255,255,255,0.2)', lineHeight: 1 }}>+</span>
          </div>
        )}
        {isCaptn && (
          <span style={{
            position: 'absolute', top: -4, right: -2,
            background: '#c9a84c', color: '#0a1f0e',
            fontSize: 9, fontWeight: 800, borderRadius: '50%',
            width: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 6px rgba(201,168,76,0.7)',
          }}>C</span>
        )}
      </div>

      {player && (
        <div style={{ textAlign: 'center', marginTop: 3, width: size + 12, pointerEvents: 'none' }}>
          <div style={{
            fontSize: 9, color: 'rgba(255,255,255,0.92)', fontWeight: 600,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            textShadow: '0 1px 3px rgba(0,0,0,0.8)',
          }}>
            {player.name.split(' ').slice(-1)[0].substring(0, 9)}
          </div>
          <div style={{ fontSize: 9, color: '#c9a84c', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
            {player.price}M
          </div>
        </div>
      )}

      {hover && player && (
        <div style={{ position: 'absolute', top: -6, left: -2, display: 'flex', gap: 3, zIndex: 20 }}>
          <button onClick={onRemove} style={actionBtn('#ef4444')} title="Retirer">✕</button>
          <button onClick={onSetCaptn} style={actionBtn(isCaptn ? '#c9a84c' : 'rgba(201,168,76,0.5)')} title={isCaptn ? 'Retirer capitaine' : 'Capitaine'}>C</button>
        </div>
      )}
    </div>
  )
}

function actionBtn(bg: string): React.CSSProperties {
  return {
    width: 17, height: 17, borderRadius: '50%', background: bg,
    border: 'none', color: '#fff', fontSize: 9, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
  }
}

// ── FilterBar ──────────────────────────────────────────────────────────────────

interface FilterBarProps {
  filterPos: string
  setFilterPos: (p: string) => void
  filterNation: string
  setFilterNation: (n: string) => void
  filterPrice: number
  setFilterPrice: (i: number) => void
  search: string
  setSearch: (s: string) => void
  nations: string[]
  activePos: string | null
  showCoachPicker: boolean
}

function FilterBar({
  filterPos, setFilterPos, filterNation, setFilterNation,
  filterPrice, setFilterPrice, search, setSearch,
  nations, activePos, showCoachPicker,
}: FilterBarProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Search */}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={showCoachPicker ? '🔍 Rechercher un entraîneur...' : '🔍 Nom ou nation...'}
        style={{
          width: '100%', background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 7, padding: '8px 12px',
          color: '#f5f5f0', fontSize: 13, outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {!showCoachPicker && (
        <>
          {/* Position filter — masqué si slot actif (poste imposé) */}
          {!activePos && (
            <div style={{ display: 'flex', gap: 3 }}>
              {['ALL', 'GK', 'DEF', 'MID', 'FWD'].map(pos => (
                <button
                  key={pos}
                  onClick={() => setFilterPos(pos)}
                  style={{
                    flex: 1, borderRadius: 5, padding: '5px 2px',
                    background: filterPos === pos ? `${POS_COLORS[pos] ?? '#c9a84c'}20` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${filterPos === pos ? (POS_COLORS[pos] ?? '#c9a84c') + '55' : 'rgba(255,255,255,0.07)'}`,
                    color: filterPos === pos ? (POS_COLORS[pos] ?? '#c9a84c') : '#6a7a6c',
                    fontSize: 11, cursor: 'pointer', fontWeight: filterPos === pos ? 600 : 400,
                  }}
                >
                  {pos}
                </button>
              ))}
            </div>
          )}

          {/* Nation filter */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#6a7a6c', flexShrink: 0 }}>🌍</span>
            <select
              value={filterNation}
              onChange={e => setFilterNation(e.target.value)}
              style={{
                flex: 1, background: '#0d2914',
                border: filterNation !== 'ALL' ? '1px solid rgba(201,168,76,0.4)' : '1px solid rgba(255,255,255,0.1)',
                borderRadius: 6, padding: '5px 8px',
                color: filterNation !== 'ALL' ? '#c9a84c' : '#8a9a8c',
                fontSize: 12, outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="ALL">Toutes les nations</option>
              {nations.map(n => (
                <option key={n} value={n}>{flag(n)} {n}</option>
              ))}
            </select>
            {filterNation !== 'ALL' && (
              <button
                onClick={() => setFilterNation('ALL')}
                style={{
                  background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)',
                  borderRadius: 5, color: '#c9a84c', fontSize: 11,
                  padding: '4px 7px', cursor: 'pointer', flexShrink: 0,
                }}
              >✕</button>
            )}
          </div>

          {/* Price filter */}
          <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
            {PRICE_RANGES.map((range, i) => (
              <button
                key={i}
                onClick={() => setFilterPrice(i)}
                style={{
                  borderRadius: 5, padding: '4px 8px',
                  background: filterPrice === i ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${filterPrice === i ? 'rgba(201,168,76,0.45)' : 'rgba(255,255,255,0.07)'}`,
                  color: filterPrice === i ? '#c9a84c' : '#6a7a6c',
                  fontSize: 10, cursor: 'pointer',
                  fontWeight: filterPrice === i ? 600 : 400,
                }}
              >
                {range.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────────────────

export default function Fantasy() {
  const navigate = useNavigate()
  const { user, logout } = useAuthStore()
  const {
    formation, slots, coach, captainId, teamName, activeSlot,
    loading, saving, error, savedMsg,
    setFormation, setActiveSlot, addPlayer, removePlayer,
    setCoach, setCaptain, setTeamName, clearError,
    loadTeam, saveTeam, autoFill,
    getBudgetUsed, getNationalityCount, getPlayerCount,
  } = useFantasyStore()

  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [allCoaches, setAllCoaches] = useState<Coach[]>([])
  const [filterPos, setFilterPos] = useState('ALL')
  const [filterNation, setFilterNation] = useState('ALL')
  const [filterPrice, setFilterPrice] = useState(0)
  const [search, setSearch] = useState('')
  const [showCoachPicker, setShowCoachPicker] = useState(false)
  const [fetching, setFetching] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [autoFilling, setAutoFilling] = useState(false)
  // Feedback quand on clique sur un joueur sans slot actif
  const [quickFillMsg, setQuickFillMsg] = useState<string | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('fb_token')
    if (!token) return
    loadTeam()
    setFetchError(null)
    Promise.all([
      axios.get('/api/v1/players').then(r => setAllPlayers(r.data.players || [])),
      axios.get('/api/v1/coaches').then(r => setAllCoaches(r.data.coaches || [])),
    ]).catch(e => {
      const status = e.response?.status
      const detail = e.response?.data?.detail || e.message || 'Erreur inconnue'
      setFetchError(`Impossible de charger les effectifs (${status ?? 'réseau'}) : ${detail}`)
    }).finally(() => setFetching(false))
  }, [])

  // Quand un slot devient actif → forcer le filtre de position
  useEffect(() => {
    if (activeSlot && !showCoachPicker) {
      const def = getFormationSlots(formation).find(s => s.slotId === activeSlot)
      if (def) {
        setFilterPos(def.position)
        setFilterNation('ALL')
        setFilterPrice(0)
      }
    }
  }, [activeSlot])

  // Nations disponibles (calculé une seule fois depuis allPlayers)
  const availableNations = useMemo(() => {
    const set = new Set<string>()
    allPlayers.forEach(p => set.add(p.nationality))
    return Array.from(set).sort()
  }, [allPlayers])

  const budgetUsed = getBudgetUsed()
  const natCount = getNationalityCount()
  const playerCount = getPlayerCount()
  const formSlots = getFormationSlots(formation)
  const fieldSlots = formSlots.filter(s => !isBenchSlot(s.slotId))
  const benchSlots = formSlots.filter(s => isBenchSlot(s.slotId))
  const fieldPos = FIELD_POSITIONS[formation] || FIELD_POSITIONS['4-3-3']
  const slottedIds = new Set(Object.values(slots).filter(Boolean).map(p => p!.id))
  const activeSlotDef = activeSlot ? formSlots.find(s => s.slotId === activeSlot) : null
  const activePos = showCoachPicker ? null : (activeSlotDef?.position ?? null)

  // ── Vérification si un joueur peut être sélectionné ─────────────────────────
  const isPlayerUnavailable = (player: Player): boolean => {
    // Déjà dans l'équipe
    if (slottedIds.has(player.id)) return true
    // Si slot actif : vérifier position, nationalité, budget
    if (activeSlot) {
      if (activeSlotDef && player.position !== activeSlotDef.position) return true
      // Nationalité : on compte sans le joueur actuel dans ce slot
      const currentInSlot = slots[activeSlot]
      const countWithoutCurrent = (natCount[player.nationality] || 0) - (currentInSlot?.nationality === player.nationality ? 1 : 0)
      if (countWithoutCurrent >= 3) return true
      // Budget : soustraire l'ancien joueur du slot
      const oldPrice = currentInSlot?.price ?? 0
      if (budgetUsed - oldPrice + player.price > 100) return true
      return false
    }
    // Sans slot actif : vérifier s'il existe un poste vide compatible
    const hasEmptySlot = formSlots.some(s => s.position === player.position && !slots[s.slotId])
    if (!hasEmptySlot) return true
    // Nationalité
    if ((natCount[player.nationality] || 0) >= 3) return true
    // Budget (ajout dans un slot vide)
    if (budgetUsed + player.price > 100) return true
    return false
  }

  const isCoachUnavailable = (c: Coach): boolean => {
    // Déjà sélectionné comme coach → peut re-sélectionner
    if (coach?.id === c.id) return false
    // Conflit de nationalité avec les joueurs
    if ((natCount[c.nationality] || 0) > 0) return true
    // Budget
    const coachCostDelta = c.price - (coach?.price ?? 0)
    if (budgetUsed + coachCostDelta > 100) return true
    return false
  }

  // ── Filtrage ────────────────────────────────────────────────────────────────
  const filteredPlayers = useMemo(() => {
    if (showCoachPicker) return []
    const priceRange = PRICE_RANGES[filterPrice]
    return allPlayers.filter(p => {
      if (activePos && p.position !== activePos) return false
      if (!activePos && filterPos !== 'ALL' && p.position !== filterPos) return false
      if (filterNation !== 'ALL' && p.nationality !== filterNation) return false
      if (p.price < priceRange.min || p.price > priceRange.max) return false
      if (search) {
        const q = search.toLowerCase()
        if (!p.name.toLowerCase().includes(q) && !p.nationality.toLowerCase().includes(q)) return false
      }
      return true
    })
  }, [showCoachPicker, allPlayers, activePos, filterPos, filterNation, filterPrice, search])

  const filteredCoaches = useMemo(() => {
    if (!showCoachPicker) return []
    return allCoaches.filter(c =>
      !search || c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.nationality.toLowerCase().includes(search.toLowerCase())
    )
  }, [showCoachPicker, allCoaches, search])

  const listItems = showCoachPicker ? filteredCoaches : filteredPlayers
  const budgetPct = Math.min(100, (budgetUsed / 100) * 100)

  // Violations
  const violations: string[] = []
  if (budgetUsed > 100) violations.push(`Budget dépassé : ${budgetUsed.toFixed(1)} / 105M`)
  Object.entries(natCount).forEach(([nat, cnt]) => {
    if (cnt > 3) violations.push(`${nat} : ${cnt} joueurs (max 3)`)
  })
  if (coach && natCount[coach.nationality] > 0) {
    violations.push(`Coach ${coach.name} partage la nationalité de ses joueurs`)
  }

  const openCoachPicker = () => {
    setActiveSlot(null)
    setShowCoachPicker(s => !s)
    setSearch('')
  }

  const closePicker = () => {
    setActiveSlot(null)
    setShowCoachPicker(false)
    setSearch('')
  }

  const handleSlotClick = (slotId: string) => {
    setShowCoachPicker(false)
    setSearch('')
    setActiveSlot(activeSlot === slotId ? null : slotId)
  }

  // ── FEATURE 1 : Clic sur joueur → remplit poste vide automatiquement ────────
  const handlePickPlayer = (player: Player) => {
    // Si un slot est actif : comportement classique
    if (activeSlot) {
      addPlayer(activeSlot, player)
      closePicker()
      return
    }
    // Sinon : trouver le premier poste vide compatible
    const emptySlot = formSlots.find(s => s.position === player.position && !slots[s.slotId])
    if (emptySlot) {
      addPlayer(emptySlot.slotId, player)
      // Petit feedback visuel
      setQuickFillMsg(`${player.name} → ${emptySlot.slotId.replace('_', ' ')}`)
      setTimeout(() => setQuickFillMsg(null), 2000)
    }
  }

  const handlePickCoach = (c: Coach) => {
    setCoach(c)
    closePicker()
  }

  // Auto-fill amélioré : remplit tout + coach avec 105M
  const handleAutoFill = async () => {
    setAutoFilling(true)
    try {
      await autoFill(formation)
    } finally {
      setAutoFilling(false)
    }
  }

  const isAutoFilling = autoFilling || loading

  return (
    <div style={{ minHeight: '100vh', background: '#08190c', display: 'flex', flexDirection: 'column', fontFamily: "'DM Sans', sans-serif", color: '#f5f5f0' }}>

      {/* ── Header ── */}
      <header style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0.7rem 1.5rem',
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
              { to: '/fantasy', label: '⚽ Mon Équipe', active: true },
              { to: '/transfers', label: '🔄 Transferts' },
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

      {/* ── Body ── */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>

        {/* ══ LEFT: Field ══════════════════════════════════════════════════════ */}
        <div style={{
          flex: '0 0 58%', display: 'flex', flexDirection: 'column',
          padding: '0.9rem 1rem', borderRight: '1px solid rgba(255,255,255,0.05)',
          overflowY: 'auto',
        }}>
          {/* Controls row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <input
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              placeholder="Nom de l'équipe"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '6px 11px', color: '#f5f5f0', fontSize: 13, outline: 'none', width: 160 }}
            />
            <select
              value={formation}
              onChange={e => setFormation(e.target.value)}
              style={{ background: '#0d2914', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 6, padding: '6px 11px', color: '#c9a84c', fontSize: 13, outline: 'none', cursor: 'pointer' }}
            >
              {Object.keys(FORMATIONS).map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 7 }}>
              <button
                onClick={handleAutoFill}
                disabled={isAutoFilling}
                title="Remplit automatiquement les 15 postes + l'entraîneur en respectant le budget de 105M"
                style={{
                  ...btnGold,
                  opacity: isAutoFilling ? 0.5 : 1,
                  fontSize: 12, padding: '7px 13px',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}
              >
                {isAutoFilling ? '⟳' : '🤖'}
                {isAutoFilling ? 'Remplissage...' : 'Remplissage auto'}
              </button>
              <button onClick={saveTeam} disabled={saving} style={{ ...btnSave, opacity: saving ? 0.5 : 1, fontSize: 12, padding: '7px 13px' }}>
                {saving ? '⟳ ...' : '💾 Sauvegarder'}
              </button>
            </div>
          </div>

          {/* Hint auto-fill */}
          {playerCount === 0 && !isAutoFilling && (
            <div style={{
              background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.2)',
              borderRadius: 7, padding: '7px 12px', marginBottom: 8,
              fontSize: 12, color: '#8a9a8c', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>💡</span>
              <span>Cliquez sur <strong style={{ color: '#c9a84c' }}>Remplissage auto</strong> pour générer une équipe complète, ou cliquez directement sur un joueur dans la liste → il s'ajoutera automatiquement au premier poste vide correspondant.</span>
            </div>
          )}

          {/* Quick fill feedback */}
          {quickFillMsg && (
            <div style={{
              background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)',
              borderRadius: 7, padding: '6px 12px', marginBottom: 8,
              fontSize: 12, color: '#34d399', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              ✅ {quickFillMsg}
            </div>
          )}

          {/* Budget bar */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: '#6a7a6c', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Budget</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: budgetUsed > 105 ? '#ef4444' : '#c9a84c' }}>
                {budgetUsed.toFixed(1)}M <span style={{ color: '#6a7a6c' }}>/ 105M · {playerCount}/15</span>
              </span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.07)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{
                height: '100%', width: `${budgetPct}%`,
                background: budgetUsed > 105 ? '#ef4444' : budgetUsed > 85 ? '#f59e0b' : '#10b981',
                borderRadius: 2, transition: 'width 0.4s ease',
              }} />
            </div>
          </div>

          {/* Messages */}
          {savedMsg && <div style={msgBox('#10b981')}>{savedMsg}</div>}
          {error && (
            <div style={{ ...msgBox('#ef4444'), display: 'flex', justifyContent: 'space-between' }}>
              <span>{error}</span>
              <button onClick={clearError} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>✕</button>
            </div>
          )}
          {violations.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
              {violations.map((v, i) => (
                <span key={i} style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#f59e0b' }}>
                  ⚠ {v}
                </span>
              ))}
            </div>
          )}

          {/* Football Field */}
          <div style={{ position: 'relative', paddingBottom: '135%' }}>
            <div style={{
              position: 'absolute', inset: 0,
              background: 'linear-gradient(180deg, #1b5e27 0%, #1f6e2c 45%, #1f6e2c 55%, #1b5e27 100%)',
              borderRadius: 10,
              border: '2px solid rgba(255,255,255,0.08)',
              overflow: 'hidden',
            }}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${i * 10}%`, height: '5%',
                  background: i % 2 === 0 ? 'rgba(0,0,0,0.07)' : 'transparent',
                }} />
              ))}
              <div style={{ position: 'absolute', inset: '3% 4%', border: '1.5px solid rgba(255,255,255,0.38)', borderRadius: 2, pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: '50%', left: '4%', right: '4%', height: 1.5, background: 'rgba(255,255,255,0.35)', pointerEvents: 'none' }} />
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '22%', paddingBottom: '22%',
                border: '1.5px solid rgba(255,255,255,0.32)',
                borderRadius: '50%', pointerEvents: 'none',
              }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 5, height: 5, background: 'rgba(255,255,255,0.5)', borderRadius: '50%', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: '3%', left: '18%', right: '18%', height: '17%', border: '1.5px solid rgba(255,255,255,0.32)', borderTop: 'none', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '3%', left: '18%', right: '18%', height: '17%', border: '1.5px solid rgba(255,255,255,0.32)', borderBottom: 'none', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', top: '3%', left: '33%', right: '33%', height: '7%', border: '1.5px solid rgba(255,255,255,0.28)', borderTop: 'none', pointerEvents: 'none' }} />
              <div style={{ position: 'absolute', bottom: '3%', left: '33%', right: '33%', height: '7%', border: '1.5px solid rgba(255,255,255,0.28)', borderBottom: 'none', pointerEvents: 'none' }} />

              {fieldSlots.map(({ slotId, position }) => {
                const pos = fieldPos[slotId]
                if (!pos) return null
                const [x, y] = pos
                const player = slots[slotId] ?? null
                return (
                  <div key={slotId} style={{
                    position: 'absolute',
                    left: `${x}%`, top: `${y}%`,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 10,
                  }}>
                    <FieldSlot
                      slotId={slotId}
                      position={position}
                      player={player}
                      isActive={activeSlot === slotId}
                      isCaptn={captainId === player?.id}
                      onClick={() => handleSlotClick(slotId)}
                      onRemove={e => { e.stopPropagation(); removePlayer(slotId) }}
                      onSetCaptn={e => { e.stopPropagation(); player && setCaptain(player.id) }}
                    />
                  </div>
                )
              })}
            </div>
          </div>

          {/* Bench */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: '#6a7a6c', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7, paddingLeft: 4 }}>
              Banc de touche
            </div>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: 16,
              background: 'rgba(255,255,255,0.025)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 8, padding: '10px 8px',
            }}>
              {benchSlots.map(({ slotId, position }) => {
                const player = slots[slotId] ?? null
                return (
                  <div key={slotId} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    <FieldSlot
                      slotId={slotId}
                      position={position}
                      player={player}
                      isActive={activeSlot === slotId}
                      isCaptn={captainId === player?.id}
                      onClick={() => handleSlotClick(slotId)}
                      onRemove={e => { e.stopPropagation(); removePlayer(slotId) }}
                      onSetCaptn={e => { e.stopPropagation(); player && setCaptain(player.id) }}
                      size={44}
                    />
                    {!player && (
                      <span style={{ fontSize: 9, color: '#6a7a6c' }}>{position}</span>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* Coach */}
          <div style={{ marginTop: 10, marginBottom: 4 }}>
            <div style={{ fontSize: 10, color: '#6a7a6c', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 7, paddingLeft: 4 }}>
              Entraîneur
            </div>
            <div
              onClick={openCoachPicker}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: showCoachPicker ? 'rgba(139,92,246,0.1)' : 'rgba(255,255,255,0.025)',
                border: `1px solid ${showCoachPicker ? 'rgba(139,92,246,0.4)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 8, padding: '9px 14px', cursor: 'pointer', transition: 'all 0.2s',
              }}
            >
              {coach ? (
                <>
                  <span style={{ fontSize: 24 }}>{flag(coach.nationality)}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{coach.name}</div>
                    <div style={{ fontSize: 11, color: '#6a7a6c' }}>{coach.nationality} · {coach.price}M</div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); setCoach(null) }}
                    style={{ background: 'rgba(239,68,68,0.12)', border: 'none', color: '#f08080', borderRadius: 5, padding: '3px 9px', cursor: 'pointer', fontSize: 11 }}
                  >
                    Retirer
                  </button>
                </>
              ) : (
                <>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', border: '2px dashed rgba(139,92,246,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    🧑‍💼
                  </div>
                  <span style={{ fontSize: 13, color: showCoachPicker ? '#a78bfa' : '#6a7a6c' }}>
                    {showCoachPicker ? 'Choisir depuis la liste →' : 'Sélectionner un entraîneur'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ══ RIGHT: Player Picker ══════════════════════════════════════════════ */}
        <div style={{
          flex: '0 0 42%', display: 'flex', flexDirection: 'column',
          background: 'rgba(12,28,16,0.6)', overflow: 'hidden',
        }}>
          {/* Picker header */}
          <div style={{ padding: '0.9rem', borderBottom: '1px solid rgba(255,255,255,0.055)', flexShrink: 0 }}>
            {(activeSlot || showCoachPicker) ? (
              <div style={{
                background: showCoachPicker ? 'rgba(139,92,246,0.1)' : `${POS_COLORS[activePos ?? ''] || '#888'}18`,
                border: `1px solid ${showCoachPicker ? 'rgba(139,92,246,0.3)' : (POS_COLORS[activePos ?? ''] || '#888') + '44'}`,
                borderRadius: 6, padding: '6px 11px', marginBottom: 9,
                fontSize: 12, color: showCoachPicker ? '#a78bfa' : (POS_COLORS[activePos ?? ''] || '#c9a84c'),
                fontWeight: 500, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span>
                  {showCoachPicker
                    ? '🧑‍💼 Choisir un entraîneur'
                    : `→ Slot ${activeSlot} · Choisir un ${activePos}`}
                </span>
                <button onClick={closePicker} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
            ) : (
              <div style={{
                fontSize: 12, color: '#6a7a6c', marginBottom: 9,
                background: 'rgba(201,168,76,0.05)', border: '1px solid rgba(201,168,76,0.15)',
                borderRadius: 6, padding: '6px 10px', textAlign: 'center',
              }}>
                💡 Cliquez sur un joueur pour le placer automatiquement · ou cliquez d'abord sur un poste du terrain
              </div>
            )}

            {/* Filtres */}
            <FilterBar
              filterPos={filterPos}
              setFilterPos={setFilterPos}
              filterNation={filterNation}
              setFilterNation={setFilterNation}
              filterPrice={filterPrice}
              setFilterPrice={setFilterPrice}
              search={search}
              setSearch={setSearch}
              nations={availableNations}
              activePos={activePos}
              showCoachPicker={showCoachPicker}
            />

            {/* Résumé filtres actifs */}
            {!showCoachPicker && (filterNation !== 'ALL' || filterPrice !== 0 || search) && (
              <div style={{ marginTop: 6, display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#4a5a4c' }}>Filtres actifs :</span>
                {filterNation !== 'ALL' && (
                  <span style={activeFilterChip}>🌍 {filterNation}</span>
                )}
                {filterPrice !== 0 && (
                  <span style={activeFilterChip}>💰 {PRICE_RANGES[filterPrice].label}</span>
                )}
                {search && (
                  <span style={activeFilterChip}>🔍 "{search}"</span>
                )}
                <button
                  onClick={() => { setFilterNation('ALL'); setFilterPrice(0); setSearch('') }}
                  style={{ fontSize: 10, color: '#8a9a8c', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Tout effacer
                </button>
              </div>
            )}
          </div>

          {/* Compteur résultats */}
          {!showCoachPicker && !fetching && (
            <div style={{
              padding: '5px 14px',
              fontSize: 11, color: '#4a5a4c',
              borderBottom: '1px solid rgba(255,255,255,0.04)',
              background: 'rgba(0,0,0,0.15)',
              flexShrink: 0,
            }}>
              {listItems.length} joueur{listItems.length > 1 ? 's' : ''} · {allPlayers.length} au total
            </div>
          )}

          {/* List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {fetchError && (
              <div style={{
                margin: '12px', padding: '12px 14px',
                background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.3)',
                borderRadius: 8, fontSize: 13, color: '#f08080',
                display: 'flex', flexDirection: 'column', gap: 6,
              }}>
                <strong>⚠ Erreur de chargement</strong>
                <span>{fetchError}</span>
                <button
                  onClick={() => {
                    setFetchError(null)
                    setFetching(true)
                    Promise.all([
                      axios.get('/api/v1/players').then(r => setAllPlayers(r.data.players || [])),
                      axios.get('/api/v1/coaches').then(r => setAllCoaches(r.data.coaches || [])),
                    ]).catch(e => setFetchError(e.message)).finally(() => setFetching(false))
                  }}
                  style={{ background: 'rgba(224,82,82,0.15)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 6, color: '#f08080', padding: '5px 12px', cursor: 'pointer', fontSize: 12, alignSelf: 'flex-start' }}
                >
                  🔄 Réessayer
                </button>
              </div>
            )}

            {fetching ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6a7a6c', fontSize: 13 }}>
                ⟳ Chargement...
              </div>
            ) : listItems.length === 0 && !fetchError ? (
              <div style={{ textAlign: 'center', padding: '2.5rem', color: '#6a7a6c', fontSize: 13 }}>
                {(showCoachPicker ? allCoaches : allPlayers).length === 0
                  ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 32 }}>⚽</span>
                      <strong style={{ color: '#f59e0b' }}>Aucun joueur importé</strong>
                      <button
                        onClick={() => navigate('/admin')}
                        style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 6, color: '#c9a84c', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Aller dans l'Admin →
                      </button>
                    </div>
                  )
                  : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 32 }}>🔍</span>
                      <span>Aucun résultat pour ces filtres</span>
                      <button
                        onClick={() => { setFilterNation('ALL'); setFilterPrice(0); setSearch('') }}
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#8a9a8c', padding: '6px 14px', cursor: 'pointer', fontSize: 12 }}
                      >
                        Réinitialiser les filtres
                      </button>
                    </div>
                  )}
              </div>
            ) : (
              listItems.map(item => {
                const isC = showCoachPicker
                const p = item as Player
                const c = item as Coach
                const inTeam = !isC && slottedIds.has(p.id)
                const isCurrentCoach = isC && coach?.id === c.id

                // ── FEATURE 3 : calcul indisponibilité ────────────────────
                const unavailable = isC ? isCoachUnavailable(c) : isPlayerUnavailable(p)

                const posColor = !isC ? (POS_COLORS[p.position] || '#888') : '#8b5cf6'

                // Raison du blocage pour tooltip
                let unavailReason = ''
                if (!isC && unavailable) {
                  if (slottedIds.has(p.id)) unavailReason = 'Déjà dans l\'équipe'
                  else if ((natCount[p.nationality] || 0) >= 3) unavailReason = `Limite nationale atteinte (${p.nationality})`
                  else if (!formSlots.some(s => s.position === p.position && !slots[s.slotId])) unavailReason = 'Tous les postes sont remplis'
                  else unavailReason = 'Budget insuffisant'
                }
                if (isC && unavailable && !isCurrentCoach) {
                  if ((natCount[c.nationality] || 0) > 0) unavailReason = `Conflit de nationalité (${c.nationality})`
                  else unavailReason = 'Budget insuffisant'
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      if (unavailable && !isCurrentCoach) return
                      if (isC) handlePickCoach(c)
                      else handlePickPlayer(p)
                    }}
                    title={unavailReason || undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '7px 14px',
                      // ── FEATURE 3 : flou si indisponible ─────────────
                      cursor: unavailable && !isCurrentCoach ? 'not-allowed' : 'pointer',
                      filter: unavailable && !isCurrentCoach ? 'blur(1.5px)' : 'none',
                      opacity: unavailable && !isCurrentCoach ? 0.38 : 1,
                      background: inTeam || isCurrentCoach ? 'rgba(201,168,76,0.06)' : 'transparent',
                      borderLeft: `3px solid ${inTeam || isCurrentCoach ? '#c9a84c' : 'transparent'}`,
                      transition: 'all 0.12s',
                      pointerEvents: unavailable && !isCurrentCoach ? 'none' : 'auto',
                    }}
                    onMouseEnter={e => {
                      if (unavailable && !isCurrentCoach) return
                      ;(e.currentTarget as HTMLDivElement).style.background = `${posColor}14`
                    }}
                    onMouseLeave={e => {
                      ;(e.currentTarget as HTMLDivElement).style.background = inTeam || isCurrentCoach ? 'rgba(201,168,76,0.06)' : 'transparent'
                    }}
                  >
                    <span style={{ fontSize: 20, flexShrink: 0 }}>{flag(isC ? c.nationality : p.nationality)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#f5f5f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.name}
                        {inTeam && <span style={{ marginLeft: 6, fontSize: 10, color: '#c9a84c' }}>✓</span>}
                        {isCurrentCoach && <span style={{ marginLeft: 6, fontSize: 10, color: '#a78bfa' }}>✓ Coach actuel</span>}
                      </div>
                      <div style={{ fontSize: 11, color: '#6a7a6c', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isC ? c.nationality : p.nationality}
                      </div>
                    </div>
                    {!isC && (
                      <span style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                        background: posColor + '20', color: posColor, border: `1px solid ${posColor}40`,
                      }}>{p.position}</span>
                    )}
                    <span style={{ fontSize: 12, color: '#c9a84c', fontWeight: 500, flexShrink: 0, minWidth: 34, textAlign: 'right' }}>
                      {item.price}M
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Nationality counter */}
          {Object.keys(natCount).length > 0 && (
            <div style={{
              padding: '0.65rem 1rem', borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0,
            }}>
              {Object.entries(natCount).sort((a, b) => b[1] - a[1]).map(([nat, cnt]) => (
                <button
                  key={nat}
                  onClick={() => setFilterNation(filterNation === nat ? 'ALL' : nat)}
                  title={`Filtrer par ${nat}`}
                  style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: filterNation === nat
                      ? 'rgba(201,168,76,0.2)'
                      : cnt >= 3 ? 'rgba(245,158,11,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${filterNation === nat
                      ? 'rgba(201,168,76,0.5)'
                      : cnt >= 3 ? 'rgba(245,158,11,0.4)' : 'rgba(255,255,255,0.07)'}`,
                    color: filterNation === nat ? '#c9a84c' : cnt >= 3 ? '#f59e0b' : '#6a7a6c',
                    cursor: 'pointer',
                  }}
                >
                  {flag(nat)} {nat.length > 8 ? nat.substring(0, 7) + '.' : nat} {cnt}/3
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Shared micro-styles ────────────────────────────────────────────────────────

const hBtn: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(255,255,255,0.09)',
  borderRadius: 6, padding: '5px 13px',
  color: '#6a7a6c', fontSize: 12, cursor: 'pointer',
}

const btnGold: React.CSSProperties = {
  background: '#c9a84c', color: '#0a1f0e',
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: '0.07em', border: 'none',
  borderRadius: 7, cursor: 'pointer',
}

const btnSave: React.CSSProperties = {
  background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: '0.07em', border: 'none',
  borderRadius: 7, cursor: 'pointer',
}

function msgBox(color: string): React.CSSProperties {
  return {
    background: `${color}14`, border: `1px solid ${color}44`,
    borderRadius: 7, padding: '8px 13px',
    fontSize: 13, color,
    marginBottom: 8,
  }
}

const activeFilterChip: React.CSSProperties = {
  fontSize: 10, padding: '2px 7px', borderRadius: 4,
  background: 'rgba(201,168,76,0.12)',
  border: '1px solid rgba(201,168,76,0.3)',
  color: '#c9a84c',
}