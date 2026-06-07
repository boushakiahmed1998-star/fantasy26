import React, { useState, useRef, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ── Données du tournoi CdM 2026 ────────────────────────────────────────────────

const GROUPES: Record<string, string[]> = {
  'A': ['Mexique', 'Afrique du Sud', 'Corée du Sud', 'République tchèque'],
  'B': ['Canada', 'Qatar', 'Suisse', 'Bosnie-Herzégovine'],
  'C': ['Brésil', 'Maroc', 'Haïti', 'Écosse'],
  'D': ['États-Unis', 'Paraguay', 'Australie', 'Turquie'],
  'E': ['Allemagne', 'Curaçao', "Côte d'Ivoire", 'Équateur'],
  'F': ['Pays-Bas', 'Japon', 'Tunisie', 'Suède'],
  'G': ['Belgique', 'Égypte', 'Iran', 'Nouvelle-Zélande'],
  'H': ['Espagne', 'Cap-Vert', 'Arabie saoudite', 'Uruguay'],
  'I': ['France', 'Sénégal', 'Norvège', 'Irak'],
  'J': ['Argentine', 'Algérie', 'Autriche', 'Jordanie'],
  'K': ['Portugal', 'Ouzbékistan', 'Colombie', 'RD Congo'],
  'L': ['Angleterre', 'Croatie', 'Ghana', 'Panama'],
}

const TOUTES_EQUIPES = Object.entries(GROUPES).flatMap(([groupe, equipes]) =>
  equipes.map(eq => ({ equipe: eq, groupe }))
)

const FLAG_EMOJIS: Record<string, string> = {
  'Mexique': '🇲🇽', 'Afrique du Sud': '🇿🇦', 'Corée du Sud': '🇰🇷', 'République tchèque': '🇨🇿',
  'Canada': '🇨🇦', 'Qatar': '🇶🇦', 'Suisse': '🇨🇭', 'Bosnie-Herzégovine': '🇧🇦',
  'Brésil': '🇧🇷', 'Maroc': '🇲🇦', 'Haïti': '🇭🇹', 'Écosse': '🏴󠁧󠁢󠁳󠁣󠁴󠁿',
  'États-Unis': '🇺🇸', 'Paraguay': '🇵🇾', 'Australie': '🇦🇺', 'Turquie': '🇹🇷',
  'Allemagne': '🇩🇪', 'Curaçao': '🇨🇼', "Côte d'Ivoire": '🇨🇮', 'Équateur': '🇪🇨',
  'Pays-Bas': '🇳🇱', 'Japon': '🇯🇵', 'Tunisie': '🇹🇳', 'Suède': '🇸🇪',
  'Belgique': '🇧🇪', 'Égypte': '🇪🇬', 'Iran': '🇮🇷', 'Nouvelle-Zélande': '🇳🇿',
  'Espagne': '🇪🇸', 'Cap-Vert': '🇨🇻', 'Arabie saoudite': '🇸🇦', 'Uruguay': '🇺🇾',
  'France': '🇫🇷', 'Sénégal': '🇸🇳', 'Norvège': '🇳🇴', 'Irak': '🇮🇶',
  'Argentine': '🇦🇷', 'Algérie': '🇩🇿', 'Autriche': '🇦🇹', 'Jordanie': '🇯🇴',
  'Portugal': '🇵🇹', 'Ouzbékistan': '🇺🇿', 'Colombie': '🇨🇴', 'RD Congo': '🇨🇩',
  'Angleterre': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Croatie': '🇭🇷', 'Ghana': '🇬🇭', 'Panama': '🇵🇦',
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parsePrice(val: string | number): number {
  if (typeof val === 'number') return val
  const cleaned = String(val).replace(',', '.').replace(/[^0-9.]/g, '')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 5 : Math.min(12, Math.max(4, n))
}

function formatPrice(p: number): string {
  return Number.isInteger(p) ? `${p}` : p.toFixed(1)
}

type EffectifStatus = 'empty' | 'partial' | 'complete'

function getEffectifStatus(players: number, coaches: number): EffectifStatus {
  if (players === 0 && coaches === 0) return 'empty'
  if (players >= 26 && coaches >= 1) return 'complete'
  return 'partial'
}

const STATUS_COLORS: Record<EffectifStatus, { border: string; bg: string; text: string; dot: string }> = {
  empty:    { border: 'rgba(255,255,255,0.07)', bg: 'rgba(15,45,20,0.6)',    text: '#8a9a8c', dot: '#4a5a4c' },
  partial:  { border: 'rgba(245,158,11,0.45)', bg: 'rgba(245,158,11,0.07)', text: '#f59e0b', dot: '#f59e0b' },
  complete: { border: 'rgba(16,185,129,0.45)', bg: 'rgba(16,185,129,0.07)', text: '#10b981', dot: '#10b981' },
}

// ── Suggestion équipe suivante ─────────────────────────────────────────────────

/** Trouve la prochaine équipe à remplir à partir du groupe de la dernière nation importée */
function getSuggestedNextTeam(
  lastNation: string | null,
  teamStats: Record<string, { players: number; coaches: number }>
): string | null {
  // Trouve le groupe de la dernière nation
  let startGroup: string | null = null
  if (lastNation) {
    for (const [g, equipes] of Object.entries(GROUPES)) {
      if (equipes.includes(lastNation)) { startGroup = g; break }
    }
  }

  const groupOrder = Object.keys(GROUPES) // A, B, C...
  const startIdx = startGroup ? groupOrder.indexOf(startGroup) : 0

  // Cherche dans le groupe actuel d'abord, puis les suivants (en boucle)
  for (let offset = 0; offset < groupOrder.length; offset++) {
    const g = groupOrder[(startIdx + offset) % groupOrder.length]
    for (const eq of GROUPES[g]) {
      if (eq === lastNation) continue // sauter la nation déjà faite
      const st = teamStats[eq] || { players: 0, coaches: 0 }
      const status = getEffectifStatus(st.players, st.coaches)
      if (status !== 'complete') return eq
    }
  }
  return null
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface TeamStat { players: number; coaches: number }

interface PlayerEntry {
  name: string
  nationality: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD' | 'COACH'
  team: string
  price: number
  age?: number | null
  jersey_number?: number | null
  _selected?: boolean
  _type?: 'player' | 'coach'
}

interface ParseResult {
  type: string
  source_info: string
  _source?: string
  players: PlayerEntry[]
  coaches: PlayerEntry[]
  warnings: string[]
  total: number
}

interface ExistingPlayer {
  id: string
  name: string
  nationality: string
  position: string
  team: string
  price: number
  stats?: { age?: number; jersey_number?: number }
}

interface EditForm {
  name: string
  nationality: string
  position: string
  team: string
  price: string
  age: string
  jersey_number: string
}

type InputMode = 'text' | 'image' | 'manual'
type Tab = 'import' | 'players' | 'stats' | 'groupes'
type AIProvider = 'groq' | 'gemini'

const POSITION_COLORS: Record<string, string> = {
  GK: '#f59e0b', DEF: '#3b82f6', MID: '#10b981', FWD: '#ef4444', COACH: '#8b5cf6',
}
const POSITION_LABELS: Record<string, string> = {
  GK: 'Gardien', DEF: 'Défenseur', MID: 'Milieu', FWD: 'Attaquant', COACH: 'Entraîneur',
}

function Badge({ pos }: { pos: string }) {
  return (
    <span style={{
      background: POSITION_COLORS[pos] + '22',
      color: POSITION_COLORS[pos],
      border: `1px solid ${POSITION_COLORS[pos]}44`,
      borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600,
      letterSpacing: '0.04em', whiteSpace: 'nowrap',
    }}>
      {POSITION_LABELS[pos] || pos}
    </span>
  )
}

function StatusDot({ status }: { status: EffectifStatus }) {
  const c = STATUS_COLORS[status]
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8,
      borderRadius: '50%', background: c.dot, flexShrink: 0,
      boxShadow: status !== 'empty' ? `0 0 5px ${c.dot}88` : 'none',
    }} />
  )
}

// ── Composant toggle Groq / Gemini ─────────────────────────────────────────────

function AIProviderToggle({
  provider, onChange
}: { provider: AIProvider; onChange: (p: AIProvider) => void }) {
  return (
    <div style={S.providerToggle}>
      <span style={{ fontSize: 12, color: '#8a9a8c', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        Moteur IA :
      </span>
      <div style={S.providerButtons}>
        <button
          onClick={() => onChange('groq')}
          title="Groq — LLaMA 3.3 70B (rapide)"
          style={{
            ...S.providerBtn,
            ...(provider === 'groq' ? S.providerBtnGroqActive : S.providerBtnInactive),
          }}
        >
          ⚡ Groq
        </button>
        <button
          onClick={() => onChange('gemini')}
          title="Gemini 1.5 Flash (Google)"
          style={{
            ...S.providerBtn,
            ...(provider === 'gemini' ? S.providerBtnGeminiActive : S.providerBtnInactive),
          }}
        >
          ✨ Gemini
        </button>
      </div>
    </div>
  )
}

// ── Composant principal ────────────────────────────────────────────────────────

export default function Admin() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  if (user?.role !== 'admin') {
    return (
      <div style={S.centered}>
        <div style={S.errorBox}>
          <span style={{ fontSize: 40 }}>🔒</span>
          <p>Accès réservé aux administrateurs</p>
          <button onClick={() => navigate('/dashboard')} style={S.btnGold}>Retour</button>
        </div>
      </div>
    )
  }

  const [tab, setTab] = useState<Tab>('import')
  const [mode, setMode] = useState<InputMode>('text')

  // ── Provider IA (persisté dans localStorage) ─────────────────────────────
  const [aiProvider, setAIProvider] = useState<AIProvider>(() => {
    return (localStorage.getItem('fb_ai_provider') as AIProvider) || 'groq'
  })

  const handleProviderChange = (p: AIProvider) => {
    setAIProvider(p)
    localStorage.setItem('fb_ai_provider', p)
  }

  const [selectedNation, setSelectedNation] = useState<string>('')
  const [nationSearch, setNationSearch] = useState('')
  const [showNationPicker, setShowNationPicker] = useState(false)

  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null)
  const [entries, setEntries] = useState<PlayerEntry[]>([])
  const [players, setPlayers] = useState<ExistingPlayer[]>([])
  const [stats, setStats] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const [teamStats, setTeamStats] = useState<Record<string, TeamStat>>({})

  // ── Dernière nation importée (pour suggestion) ───────────────────────────
  const [lastRegisteredNation, setLastRegisteredNation] = useState<string | null>(() => {
    return localStorage.getItem('fb_last_nation')
  })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<EditForm>({
    name: '', nationality: '', position: 'FWD', team: '', price: '7', age: '', jersey_number: '',
  })
  const [saving, setSaving] = useState(false)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)

  const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  const [manualPlayer, setManualPlayer] = useState<PlayerEntry>({
    name: '', nationality: '', position: 'FWD', team: '', price: 7,
    age: null, jersey_number: null, _selected: true, _type: 'player',
  })

  const loadTeamStats = async () => {
    try {
      const { data } = await axios.get('/api/v1/admin/team-stats')
      setTeamStats(data.stats || {})
    } catch {
      try {
        const { data } = await axios.get('/api/v1/admin/players?limit=9999')
        const acc: Record<string, TeamStat> = {}
        for (const p of data.players || []) {
          const key = p.team || p.nationality
          if (!acc[key]) acc[key] = { players: 0, coaches: 0 }
          if (p.position === 'COACH') acc[key].coaches++
          else acc[key].players++
        }
        setTeamStats(acc)
      } catch {}
    }
  }

  useEffect(() => { loadTeamStats() }, [])

  const getTeamStat = (equipe: string): TeamStat => teamStats[equipe] || { players: 0, coaches: 0 }

  const filteredNations = TOUTES_EQUIPES.filter(({ equipe }) =>
    equipe.toLowerCase().includes(nationSearch.toLowerCase())
  )

  const handleSelectNation = (equipe: string) => {
    setSelectedNation(equipe)
    setNationSearch('')
    setShowNationPicker(false)
    setManualPlayer(prev => ({ ...prev, nationality: equipe, team: equipe }))
  }

  // ── Suggérer la prochaine équipe incomplète ───────────────────────────────
  const handleSuggestNextTeam = () => {
    const suggested = getSuggestedNextTeam(lastRegisteredNation, teamStats)
    if (suggested) {
      handleSelectNation(suggested)
      // Scroll vers la zone d'import si besoin
      setTimeout(() => textareaRef.current?.focus(), 100)
    }
  }

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file?.type.startsWith('image/')) {
      setImageFile(file); setImagePreview(URL.createObjectURL(file))
    }
  }, [])

  const handleParse = async () => {
    if (!selectedNation) { setError("Sélectionnez une nation d'abord."); return }
    setError(null); setResult(null); setConfirmSuccess(null); setLoading(true)
    try {
      const formData = new FormData()
      if (mode === 'text' && text.trim()) {
        formData.append('text', `Nation: ${selectedNation}\n\n${text.trim()}`)
      } else if (mode === 'image' && imageFile) {
        formData.append('image', imageFile)
        formData.append('text', `Nation cible: ${selectedNation}`)
      } else {
        setError('Fournissez du texte ou une image.'); setLoading(false); return
      }
      // Envoie le provider choisi
      formData.append('provider', aiProvider)

      const { data } = await axios.post<ParseResult>('/api/v1/admin/import-players', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const fixNation = (p: PlayerEntry) => ({ ...p, nationality: selectedNation, team: selectedNation, _selected: true })
      const all: PlayerEntry[] = [
        ...data.players.map(p => ({ ...fixNation(p), _type: 'player' as const })),
        ...data.coaches.map(c => ({ ...fixNation(c), _type: 'coach' as const })),
      ]
      setResult(data); setEntries(all)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (detail?.error === 'RULE_VIOLATION') setError(`⚠ ${detail.message}`)
      else setError(typeof detail === 'string' ? detail : "Erreur lors de l'analyse IA")
    } finally { setLoading(false) }
  }

  // ── Enter dans le textarea → envoyer directement ──────────────────────────
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (!loading && text.trim() && selectedNation) {
        handleParse()
      }
    }
  }

  const handleAddManual = () => {
    if (!manualPlayer.name.trim()) { setError('Le nom est requis.'); return }
    if (!selectedNation) { setError('Sélectionnez une nation.'); return }
    const entry: PlayerEntry = {
      ...manualPlayer,
      nationality: selectedNation,
      team: selectedNation,
      _selected: true,
      _type: manualPlayer.position === 'COACH' ? 'coach' : 'player',
    }
    setEntries(prev => [...prev, entry])
    setManualPlayer({ name: '', nationality: selectedNation, position: 'FWD', team: selectedNation, price: 7, age: null, jersey_number: null, _selected: true, _type: 'player' })
    setError(null)
  }

  const updateEntry = (idx: number, field: keyof PlayerEntry, value: any) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e))
  }

  const removeEntry = (idx: number) => setEntries(prev => prev.filter((_, i) => i !== idx))

  const toggleEntrySelected = (idx: number) =>
    updateEntry(idx, '_selected', !entries[idx]._selected)

  const selectAllEntries = (val: boolean) =>
    setEntries(prev => prev.map(e => ({ ...e, _selected: val })))

  const selectEntriesByType = (type: 'player' | 'coach', val: boolean) =>
    setEntries(prev => prev.map(e => e._type === type ? { ...e, _selected: val } : e))

  const handleConfirm = async () => {
    const selected = entries.filter(e => e._selected)
    if (!selected.length) { setError('Sélectionnez au moins une entrée.'); return }
    setConfirming(true); setError(null)
    try {
      const payload = {
        players: selected.filter(e => e._type === 'player').map(({ _selected, _type, ...rest }) => rest),
        coaches: selected.filter(e => e._type === 'coach').map(({ _selected, _type, ...rest }) => rest),
      }
      const { data } = await axios.post('/api/v1/admin/confirm-import', payload)
      setConfirmSuccess(
        `✅ ${data.inserted_players} joueur(s) et ${data.inserted_coaches} entraîneur(s) importés` +
        (data.skipped_players + data.skipped_coaches > 0 ? ` · ${data.skipped_players + data.skipped_coaches} déjà existant(s) conservé(s)` : '') +
        (data.errors.length ? ` · ⚠ ${data.errors.length} erreur(s)` : '')
      )
      // Mémorise la dernière nation importée pour la suggestion
      if (selectedNation) {
        setLastRegisteredNation(selectedNation)
        localStorage.setItem('fb_last_nation', selectedNation)
      }
      setResult(null); setEntries([]); setText(''); setImageFile(null); setImagePreview(null)
      loadTeamStats()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur lors de la confirmation')
    } finally { setConfirming(false) }
  }

  // ── Édition joueur/coach existant ────────────────────────────────────────────

  const startEdit = (p: ExistingPlayer) => {
    setEditingId(p.id)
    setEditForm({
      name: p.name, nationality: p.nationality, position: p.position,
      team: p.team, price: formatPrice(p.price),
      age: String(p.stats?.age || ''), jersey_number: String(p.stats?.jersey_number || ''),
    })
    setEditSuccess(null)
  }

  const cancelEdit = () => { setEditingId(null); setEditSuccess(null) }

  const saveEdit = async (id: string) => {
    setSaving(true)
    try {
      const priceVal = parsePrice(editForm.price)
      const isCoach = editForm.position === 'COACH'
      const endpoint = isCoach ? `/api/v1/admin/coaches/${id}` : `/api/v1/admin/players/${id}`
      const payload = isCoach
        ? { name: editForm.name, nationality: editForm.nationality, team: editForm.team, price: priceVal }
        : {
            name: editForm.name, nationality: editForm.nationality, position: editForm.position,
            team: editForm.team, price: priceVal,
            age: editForm.age ? parseInt(editForm.age) : null,
            jersey_number: editForm.jersey_number ? parseInt(editForm.jersey_number) : null,
          }
      await axios.put(endpoint, payload)
      setEditSuccess(`✅ ${editForm.name} mis à jour`)
      setEditingId(null)
      loadPlayers()
      loadTeamStats()
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur lors de la modification')
    } finally { setSaving(false) }
  }

  const loadPlayers = async (team?: string) => {
    try {
      const url = team ? `/api/v1/admin/players?team=${encodeURIComponent(team)}` : '/api/v1/admin/players'
      const { data } = await axios.get(url)
      setPlayers(data.players)
      setSelectedPlayerIds(new Set())
    } catch {}
  }

  const loadStats = async () => {
    try { const { data } = await axios.get('/api/v1/admin/stats'); setStats(data) } catch {}
  }

  const handleTabChange = (t: Tab) => {
    setTab(t)
    if (t === 'players') loadPlayers()
    if (t === 'stats') loadStats()
    if (t === 'groupes') loadTeamStats()
  }

  const deletePlayer = async (id: string) => {
    if (!confirm('Supprimer ce joueur ?')) return
    await axios.delete(`/api/v1/admin/players/${id}`)
    setSelectedPlayerIds(prev => { const n = new Set(prev); n.delete(id); return n })
    loadPlayers(); loadTeamStats()
  }

  const toggleSelectPlayer = (id: string) => {
    setSelectedPlayerIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const selectAllPlayers = (val: boolean) => {
    setSelectedPlayerIds(val ? new Set(players.map(p => p.id)) : new Set())
  }

  const selectByPosition = (pos: string) => {
    const ids = players.filter(p => p.position === pos).map(p => p.id)
    setSelectedPlayerIds(prev => {
      const n = new Set(prev)
      ids.forEach(id => n.add(id))
      return n
    })
  }

  const batchDelete = async () => {
    if (!selectedPlayerIds.size) return
    if (!confirm(`Supprimer les ${selectedPlayerIds.size} joueur(s) sélectionné(s) ?`)) return
    setBatchDeleting(true)
    try {
      await Promise.all([...selectedPlayerIds].map(id => axios.delete(`/api/v1/admin/players/${id}`)))
      setSelectedPlayerIds(new Set())
      loadPlayers(); loadTeamStats()
    } catch {
      setError('Erreur lors de la suppression groupée')
    } finally { setBatchDeleting(false) }
  }

  const selectedNationInfo = TOUTES_EQUIPES.find(e => e.equipe === selectedNation)
  const currentNationStat = selectedNation ? getTeamStat(selectedNation) : null
  const currentStatus = currentNationStat
    ? getEffectifStatus(currentNationStat.players, currentNationStat.coaches)
    : 'empty'

  const suggestedTeam = getSuggestedNextTeam(lastRegisteredNation, teamStats)
  const playersSel = entries.filter(e => e._selected)
  const playersSelCount = playersSel.filter(e => e._type === 'player').length
  const coachSelCount = playersSel.filter(e => e._type === 'coach').length
  const allChecked = entries.length > 0 && entries.every(e => e._selected)
  const someChecked = entries.some(e => e._selected) && !allChecked

  const allPlayersChecked = players.length > 0 && selectedPlayerIds.size === players.length
  const somePlayersChecked = selectedPlayerIds.size > 0 && !allPlayersChecked

  return (
    <div style={S.bg}>
      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={S.logo}>🏆 Fantasy Boulzazen</span>
          <span style={S.adminBadge}>ADMIN</span>
          <span style={S.tournamentBadge}>🌍 CdM 2026</span>
        </div>
        <div style={S.headerRight}>
          {/* Toggle IA toujours visible dans le header */}
          <AIProviderToggle provider={aiProvider} onChange={handleProviderChange} />
          <span style={S.userTag}>👤 {user.username}</span>
          <button onClick={() => navigate('/dashboard')} style={S.btnOutline}>Dashboard</button>
          <button onClick={() => { logout(); navigate('/login') }} style={S.btnOutline}>Déconnexion</button>
        </div>
      </div>

      <div style={S.container}>
        <div style={S.titleRow}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h1 style={S.title}>Panneau d'Administration</h1>
              <p style={S.subtitle}>Gestion des effectifs · 48 équipes · Coupe du Monde 2026</p>
            </div>
            {/* Bouton Suggérer équipe suivante */}
            {tab === 'import' && (
              <button
                onClick={handleSuggestNextTeam}
                disabled={!suggestedTeam}
                title={suggestedTeam ? `Prochaine équipe à remplir : ${suggestedTeam}` : 'Toutes les équipes sont complètes !'}
                style={{
                  ...S.btnSuggest,
                  ...(suggestedTeam ? {} : S.btnDisabled),
                }}
              >
                <span style={{ fontSize: 18 }}>{suggestedTeam ? (FLAG_EMOJIS[suggestedTeam] || '🏳️') : '✅'}</span>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>
                    {suggestedTeam ? 'Équipe suivante' : 'Toutes complètes'}
                  </span>
                  {suggestedTeam && (
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{suggestedTeam}</span>
                  )}
                </div>
                {suggestedTeam && <span style={{ fontSize: 16 }}>→</span>}
              </button>
            )}
          </div>
        </div>

        {/* ── Légende statut ── */}
        <div style={S.legendBar}>
          {(['empty', 'partial', 'complete'] as EffectifStatus[]).map(s => (
            <div key={s} style={S.legendItem}>
              <StatusDot status={s} />
              <span style={{ fontSize: 12, color: STATUS_COLORS[s].text }}>
                {s === 'empty' ? 'Non remplie' : s === 'partial' ? 'En cours (< 26 + coach)' : 'Complète (26 + coach)'}
              </span>
            </div>
          ))}
          {lastRegisteredNation && (
            <div style={S.legendItem}>
              <span style={{ fontSize: 14 }}>{FLAG_EMOJIS[lastRegisteredNation] || '🏳️'}</span>
              <span style={{ fontSize: 12, color: '#8a9a8c' }}>
                Dernier import : <strong style={{ color: '#c9a84c' }}>{lastRegisteredNation}</strong>
              </span>
            </div>
          )}
        </div>

        {/* ── Tabs ── */}
        <div style={S.tabs}>
          {([
            ['import', '🤖 Import IA'],
            ['players', '👥 Joueurs'],
            ['stats', '📊 Stats'],
            ['groupes', '🏆 Groupes'],
          ] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => handleTabChange(t)}
              style={{ ...S.tabBtn, ...(tab === t ? S.tabActive : {}) }}>
              {label}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════
            TAB : IMPORT IA
        ══════════════════════════════════════════════════ */}
        {tab === 'import' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* ── Sélecteur de nation ── */}
            <div style={S.nationCard}>
              <div style={S.nationCardHeader}>
                <span style={S.nationCardTitle}>🌍 Sélectionner la nation</span>
                {selectedNation && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <StatusDot status={currentStatus} />
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#f5f5f0' }}>
                      {FLAG_EMOJIS[selectedNation] || '🏳️'} {selectedNation}
                    </span>
                    {selectedNationInfo && <span style={S.groupeBadge}>Groupe {selectedNationInfo.groupe}</span>}
                    {currentNationStat && (
                      <span style={{
                        fontSize: 12,
                        color: STATUS_COLORS[currentStatus].text,
                        background: STATUS_COLORS[currentStatus].bg,
                        border: `1px solid ${STATUS_COLORS[currentStatus].border}`,
                        borderRadius: 6, padding: '2px 8px',
                      }}>
                        {currentNationStat.players}/26 joueurs · {currentNationStat.coaches ? '✓' : '✗'} coach
                      </span>
                    )}
                  </div>
                )}
              </div>

              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="🔍 Rechercher une nation..."
                  value={nationSearch}
                  onChange={e => { setNationSearch(e.target.value); setShowNationPicker(true) }}
                  onFocus={() => setShowNationPicker(true)}
                  style={S.nationSearch}
                />
                {showNationPicker && (
                  <div style={S.nationDropdown}>
                    {Object.entries(GROUPES).map(([groupe, equipes]) => {
                      const filtered = equipes.filter(eq =>
                        eq.toLowerCase().includes(nationSearch.toLowerCase())
                      )
                      if (!filtered.length) return null
                      return (
                        <div key={groupe}>
                          <div style={S.groupeHeader}>Groupe {groupe}</div>
                          {filtered.map(equipe => {
                            const st = getTeamStat(equipe)
                            const status = getEffectifStatus(st.players, st.coaches)
                            return (
                              <div key={equipe} onClick={() => handleSelectNation(equipe)} style={{
                                ...S.nationOption,
                                ...(equipe === selectedNation ? S.nationOptionActive : {}),
                              }}>
                                <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[equipe] || '🏳️'}</span>
                                <span style={{ flex: 1 }}>{equipe}</span>
                                <StatusDot status={status} />
                                {status !== 'empty' && (
                                  <span style={{ fontSize: 11, color: STATUS_COLORS[status].text, minWidth: 60, textAlign: 'right' }}>
                                    {st.players}/26
                                  </span>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                    {filteredNations.length === 0 && (
                      <div style={{ padding: '12px', color: '#8a9a8c', fontSize: 13 }}>Aucune nation trouvée</div>
                    )}
                    <button onClick={() => setShowNationPicker(false)} style={S.closeDropdown}>Fermer ✕</button>
                  </div>
                )}
              </div>

              {!showNationPicker && !selectedNation && (
                <div style={S.groupesGrid}>
                  {Object.entries(GROUPES).map(([groupe, equipes]) => (
                    <div key={groupe} style={S.groupeCard}>
                      <div style={S.groupeCardTitle}>Groupe {groupe}</div>
                      {equipes.map(eq => {
                        const st = getTeamStat(eq)
                        const status = getEffectifStatus(st.players, st.coaches)
                        const c = STATUS_COLORS[status]
                        return (
                          <button key={eq} onClick={() => handleSelectNation(eq)} style={{
                            ...S.equipeBtn,
                            borderLeft: `2px solid ${c.dot}`,
                            paddingLeft: 6,
                          }}>
                            <span>{FLAG_EMOJIS[eq] || '🏳️'} {eq}</span>
                            <StatusDot status={status} />
                          </button>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Zone import ── */}
            {selectedNation && (
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <div>
                    <h2 style={S.cardTitle}>
                      {FLAG_EMOJIS[selectedNation] || '🏳️'} Effectif — {selectedNation}
                    </h2>
                    <p style={S.cardSub}>Prix: 4–12 M€ · Shift+Entrée = nouvelle ligne · Entrée = envoyer</p>
                  </div>
                  {/* Source du dernier résultat */}
                  {result?._source && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 12, color: '#8a9a8c' }}>Via :</span>
                      {result._source.includes('groq') ? (
                        <span style={S.groqTag}>⚡ Groq</span>
                      ) : (
                        <span style={S.geminiTag}>✨ Gemini</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Mode toggle */}
                <div style={S.modeToggle}>
                  {(['text', 'image', 'manual'] as InputMode[]).map(m => (
                    <button key={m} onClick={() => { setMode(m); setResult(null); setError(null) }}
                      style={{ ...S.modeBtn, ...(mode === m ? S.modeBtnActive : {}) }}>
                      {m === 'text' ? '📝 Texte' : m === 'image' ? '🖼️ Image' : '✏️ Manuel'}
                    </button>
                  ))}
                </div>

                {/* ── Mode texte ── */}
                {mode === 'text' && (
                  <div>
                    <label style={S.label}>
                      Collez l'effectif complet
                      <span style={{ color: '#8a9a8c', fontWeight: 400, marginLeft: 8, fontSize: 11 }}>
                        (Entrée = analyser · Shift+Entrée = nouvelle ligne)
                      </span>
                    </label>
                    <textarea
                      ref={textareaRef}
                      value={text}
                      onChange={e => setText(e.target.value)}
                      onKeyDown={handleTextareaKeyDown}
                      placeholder={"Gardiens : Raul Rangel\nDéfenseurs : Jorge Sánchez\nMillieux : Edson Álvarez\nAttaquants : Roberto Alvarado\nEntraîneur : Javier Aguirre"}
                      style={S.textarea}
                      rows={9}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <button onClick={handleParse} disabled={loading || !text.trim()}
                        style={{ ...S.btnGold, ...(loading ? S.btnDisabled : {}) }}>
                        {loading
                          ? `⟳ Analyse ${aiProvider === 'groq' ? 'Groq' : 'Gemini'}...`
                          : `🚀 Analyser → ${selectedNation}`}
                      </button>
                      {/* Indicateur provider dans le bouton */}
                      <span style={{
                        fontSize: 11, color: aiProvider === 'groq' ? '#f05722' : '#4285f4',
                        background: aiProvider === 'groq' ? '#f0572215' : '#4285f415',
                        border: `1px solid ${aiProvider === 'groq' ? '#f0572230' : '#4285f430'}`,
                        borderRadius: 5, padding: '3px 8px',
                      }}>
                        {aiProvider === 'groq' ? '⚡ Groq actif' : '✨ Gemini actif'}
                      </span>
                    </div>
                  </div>
                )}

                {/* ── Mode image ── */}
                {mode === 'image' && (
                  <div>
                    <label style={S.label}>Image de la fiche d'effectif</label>
                    <div style={{ ...S.dropzone, ...(dragOver ? S.dropzoneActive : {}) }}
                      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={handleImageDrop}
                      onClick={() => fileRef.current?.click()}>
                      {imagePreview ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                          <img src={imagePreview} alt="preview" style={{ maxHeight: 200, maxWidth: '100%', borderRadius: 8 }} />
                          <button style={S.removeImg} onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }}>✕ Changer</button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 40 }}>📸</span>
                          <p style={{ color: '#f5f5f0', fontSize: 14 }}>Glissez une image ou cliquez</p>
                          <p style={{ color: '#8a9a8c', fontSize: 12 }}>JPG, PNG, WEBP — Gemini Vision</p>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) } }}
                      style={{ display: 'none' }} />
                    <button onClick={handleParse} disabled={loading || !imageFile}
                      style={{ ...S.btnGold, ...(loading ? S.btnDisabled : {}), marginTop: 12 }}>
                      {loading ? '⟳ Analyse Gemini Vision...' : `🤖 Analyser l'image → ${selectedNation}`}
                    </button>
                  </div>
                )}

                {/* ── Mode manuel ── */}
                {mode === 'manual' && (
                  <div style={S.manualForm}>
                    <div style={S.manualGrid}>
                      <div>
                        <label style={S.label}>Nom complet *</label>
                        <input value={manualPlayer.name}
                          onChange={e => setManualPlayer(p => ({ ...p, name: e.target.value }))}
                          placeholder="Ex: Kylian Mbappé" style={S.input} />
                      </div>
                      <div>
                        <label style={S.label}>Poste *</label>
                        <select value={manualPlayer.position}
                          onChange={e => {
                            const pos = e.target.value as any
                            setManualPlayer(p => ({ ...p, position: pos, _type: pos === 'COACH' ? 'coach' : 'player' }))
                          }}
                          style={S.select}>
                          <option value="GK">🧤 Gardien (GK)</option>
                          <option value="DEF">🛡️ Défenseur (DEF)</option>
                          <option value="MID">⚙️ Milieu (MID)</option>
                          <option value="FWD">⚡ Attaquant (FWD)</option>
                          <option value="COACH">🧑‍💼 Entraîneur</option>
                        </select>
                      </div>
                      <div>
                        <label style={S.label}>Prix M€ (ex: 4,5)</label>
                        <input type="text" inputMode="decimal"
                          value={manualPlayer.price}
                          onChange={e => setManualPlayer(p => ({ ...p, price: parsePrice(e.target.value) }))}
                          placeholder="7 ou 7,5" style={S.input} />
                      </div>
                      {manualPlayer.position !== 'COACH' && (
                        <>
                          <div>
                            <label style={S.label}>Âge</label>
                            <input type="number" value={manualPlayer.age || ''}
                              onChange={e => setManualPlayer(p => ({ ...p, age: parseInt(e.target.value) || null }))}
                              placeholder="Ex: 25" style={S.input} />
                          </div>
                          <div>
                            <label style={S.label}>N° maillot</label>
                            <input type="number" value={manualPlayer.jersey_number || ''}
                              onChange={e => setManualPlayer(p => ({ ...p, jersey_number: parseInt(e.target.value) || null }))}
                              placeholder="Ex: 10" style={S.input} />
                          </div>
                        </>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button onClick={handleAddManual} style={{ ...S.btnGold, marginTop: 0 }}>
                        {manualPlayer.position === 'COACH' ? '🧑‍💼' : '⚽'} Ajouter à {selectedNation}
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <div style={S.errorBanner}>
                    <span>{error}</span>
                    <button onClick={() => setError(null)} style={S.closeBtn}>✕</button>
                  </div>
                )}
                {confirmSuccess && <div style={S.successBanner}>{confirmSuccess}</div>}

                {/* ── Table des entrées ── */}
                {entries.length > 0 && (
                  <div style={S.results}>
                    <div style={S.resultsHeader}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f5f5f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        {FLAG_EMOJIS[selectedNation]} {selectedNation} — {entries.length} entrée(s)
                        {result && <span style={{ color: '#8a9a8c', fontWeight: 400, fontSize: 13 }}>· {result.source_info}</span>}
                      </h3>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        <button style={S.btnMini} onClick={() => selectAllEntries(true)}>✓ Tout</button>
                        <button style={S.btnMini} onClick={() => selectAllEntries(false)}>✗ Tout</button>
                        <button style={{ ...S.btnMini, color: '#8b5cf6', border: '1px solid #8b5cf633' }}
                          onClick={() => selectEntriesByType('coach', true)}>
                          🧑‍💼 Coaches
                        </button>
                        <button style={{ ...S.btnMini, color: '#3b82f6', border: '1px solid #3b82f633' }}
                          onClick={() => selectEntriesByType('player', true)}>
                          ⚽ Joueurs
                        </button>
                      </div>
                    </div>

                    {result?.warnings && result.warnings.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {result.warnings.map((w, i) => (
                          <span key={i} style={S.warningChip}>⚠ {w}</span>
                        ))}
                      </div>
                    )}

                    {/* Section entraîneur */}
                    {entries.some(e => e._type === 'coach') && (
                      <div style={S.coachSection}>
                        <div style={S.coachSectionTitle}>🧑‍💼 Entraîneur(s)</div>
                        {entries.map((entry, idx) => entry._type !== 'coach' ? null : (
                          <div key={idx} style={{ ...S.coachRow, opacity: entry._selected ? 1 : 0.5 }}>
                            <input type="checkbox" checked={!!entry._selected}
                              onChange={() => toggleEntrySelected(idx)}
                              style={{ accentColor: '#8b5cf6', width: 15, height: 15 }} />
                            <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[entry.nationality] || '🏳️'}</span>
                            <input value={entry.name}
                              onChange={e => updateEntry(idx, 'name', e.target.value)}
                              style={{ ...S.inlineInput, flex: 1, minWidth: 120 }} />
                            <span style={{ fontSize: 11, color: '#8b5cf6' }}>Entraîneur</span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <span style={{ fontSize: 12, color: '#8a9a8c' }}>Prix:</span>
                              <input type="text" inputMode="decimal"
                                value={entry.price}
                                onChange={e => updateEntry(idx, 'price', parsePrice(e.target.value))}
                                style={{ ...S.inlineInput, width: 55, color: '#c9a84c' }} />
                              <span style={{ fontSize: 11, color: '#8a9a8c' }}>M</span>
                            </div>
                            <button onClick={() => removeEntry(idx)} style={S.btnDelete}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Table joueurs */}
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <th style={{ ...S.th, width: 36 }}>
                              <input type="checkbox"
                                checked={allChecked}
                                ref={el => { if (el) el.indeterminate = someChecked }}
                                onChange={e => selectAllEntries(e.target.checked)}
                                style={{ accentColor: '#c9a84c', width: 15, height: 15 }} />
                            </th>
                            {['N°', 'Nom', 'Poste', 'Prix M€', 'Âge', ''].map((h, i) => (
                              <th key={i} style={S.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry, idx) => entry._type !== 'player' ? null : (
                            <tr key={idx} style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              opacity: entry._selected ? 1 : 0.4,
                              background: entry._selected ? 'rgba(201,168,76,0.04)' : 'transparent',
                            }}>
                              <td style={{ ...S.td, width: 36 }}>
                                <input type="checkbox" checked={!!entry._selected}
                                  onChange={() => toggleEntrySelected(idx)}
                                  style={{ accentColor: '#c9a84c', width: 15, height: 15 }} />
                              </td>
                              <td style={{ ...S.td, width: 50 }}>
                                <input type="number" value={entry.jersey_number || ''}
                                  onChange={e => updateEntry(idx, 'jersey_number', parseInt(e.target.value) || null)}
                                  style={{ ...S.inlineInput, width: 45 }} placeholder="—" />
                              </td>
                              <td style={{ ...S.td, minWidth: 140 }}>
                                <input value={entry.name}
                                  onChange={e => updateEntry(idx, 'name', e.target.value)}
                                  style={{ ...S.inlineInput, width: '100%', minWidth: 120 }} />
                              </td>
                              <td style={S.td}>
                                <select value={entry.position}
                                  onChange={e => updateEntry(idx, 'position', e.target.value)}
                                  style={S.inlineSelect}>
                                  {['GK', 'DEF', 'MID', 'FWD'].map(p => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={S.td}>
                                <input type="text" inputMode="decimal"
                                  value={entry.price}
                                  onChange={e => updateEntry(idx, 'price', parsePrice(e.target.value))}
                                  style={{ ...S.inlineInput, width: 55, color: '#c9a84c' }} />
                              </td>
                              <td style={S.td}>
                                <input type="number" value={entry.age || ''}
                                  onChange={e => updateEntry(idx, 'age', parseInt(e.target.value) || null)}
                                  style={{ ...S.inlineInput, width: 50 }} placeholder="—" />
                              </td>
                              <td style={S.td}>
                                <button onClick={() => removeEntry(idx)} style={S.btnDelete}>✕</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, flexWrap: 'wrap', gap: 10 }}>
                      <span style={{ fontSize: 13, color: '#8a9a8c' }}>
                        {playersSelCount} joueur(s) + {coachSelCount} coach sélectionné(s)
                      </span>
                      <button onClick={handleConfirm}
                        disabled={confirming || !playersSel.length}
                        style={{ ...S.btnConfirm, ...(confirming ? S.btnDisabled : {}) }}>
                        {confirming ? '⟳ Importation...' : `✅ Confirmer l'import`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB : JOUEURS
        ══════════════════════════════════════════════════ */}
        {tab === 'players' && (
          <div style={S.card}>
            <div style={S.cardHeader}>
              <h2 style={S.cardTitle}>Joueurs & Entraîneurs ({players.length})</h2>
              <button onClick={() => loadPlayers()} style={S.btnMini}>🔄 Actualiser</button>
            </div>

            {editSuccess && <div style={{ ...S.successBanner, marginBottom: 12 }}>{editSuccess}</div>}
            {error && (
              <div style={{ ...S.errorBanner, marginBottom: 12 }}>
                <span>{error}</span>
                <button onClick={() => setError(null)} style={S.closeBtn}>✕</button>
              </div>
            )}

            {/* Filtre par équipe */}
            <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {Object.entries(GROUPES).map(([g, equipes]) =>
                equipes.map(eq => {
                  const st = getTeamStat(eq)
                  const status = getEffectifStatus(st.players, st.coaches)
                  const c = STATUS_COLORS[status]
                  return (
                    <button key={`${g}-${eq}`} onClick={() => loadPlayers(eq)} style={{
                      background: c.bg,
                      border: `1px solid ${c.border}`,
                      borderRadius: 6, padding: '3px 8px',
                      color: c.text, fontSize: 11, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}>
                      <StatusDot status={status} />
                      {FLAG_EMOJIS[eq] || '🏳️'} {eq}
                    </button>
                  )
                })
              )}
              <button onClick={() => loadPlayers()} style={{ ...S.btnMini, color: '#c9a84c', border: '1px solid rgba(201,168,76,0.3)' }}>
                Toutes
              </button>
            </div>

            {/* Barre multi-sélection */}
            {players.length > 0 && (
              <div style={S.multiSelectBar}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox"
                    checked={allPlayersChecked}
                    ref={el => { if (el) el.indeterminate = somePlayersChecked }}
                    onChange={e => selectAllPlayers(e.target.checked)}
                    style={{ accentColor: '#c9a84c', width: 15, height: 15 }} />
                  <span style={{ fontSize: 13, color: '#8a9a8c' }}>
                    {selectedPlayerIds.size > 0
                      ? `${selectedPlayerIds.size} sélectionné(s)`
                      : `Sélectionner tout (${players.length})`}
                  </span>
                </label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {['GK', 'DEF', 'MID', 'FWD', 'COACH'].map(pos => (
                    <button key={pos} onClick={() => selectByPosition(pos)} style={{
                      background: POSITION_COLORS[pos] + '15',
                      border: `1px solid ${POSITION_COLORS[pos]}33`,
                      borderRadius: 5, padding: '3px 8px',
                      color: POSITION_COLORS[pos], fontSize: 11, cursor: 'pointer',
                    }}>
                      {pos}
                    </button>
                  ))}
                </div>
                {selectedPlayerIds.size > 0 && (
                  <button onClick={batchDelete} disabled={batchDeleting}
                    style={{ ...S.btnDeleteBatch, ...(batchDeleting ? S.btnDisabled : {}) }}>
                    {batchDeleting ? '⟳ Suppression...' : `🗑 Supprimer (${selectedPlayerIds.size})`}
                  </button>
                )}
              </div>
            )}

            {players.length === 0 ? (
              <div style={S.empty}>
                <span style={{ fontSize: 48 }}>⚽</span>
                <p>Aucun joueur. Utilisez l'onglet Import IA.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ ...S.th, width: 36 }}></th>
                      {['Nation', 'Nom', 'Poste', 'Prix', 'Âge', 'Actions'].map((h, i) => (
                        <th key={i} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => (
                      <React.Fragment key={p.id}>
                        {editingId !== p.id && (
                          <tr style={{
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                            background: selectedPlayerIds.has(p.id) ? 'rgba(201,168,76,0.06)' : 'transparent',
                          }}>
                            <td style={{ ...S.td, width: 36 }}>
                              <input type="checkbox"
                                checked={selectedPlayerIds.has(p.id)}
                                onChange={() => toggleSelectPlayer(p.id)}
                                style={{ accentColor: '#c9a84c', width: 15, height: 15 }} />
                            </td>
                            <td style={S.td}>
                              <span style={{ fontSize: 18 }}>{FLAG_EMOJIS[p.nationality] || '🏳️'}</span>
                              <span style={{ fontSize: 12, color: '#8a9a8c', marginLeft: 6 }}>{p.nationality}</span>
                            </td>
                            <td style={{ ...S.td, fontWeight: 500 }}>{p.name}</td>
                            <td style={S.td}><Badge pos={p.position} /></td>
                            <td style={{ ...S.td, color: '#c9a84c' }}>{formatPrice(p.price)}M</td>
                            <td style={{ ...S.td, color: '#8a9a8c' }}>{p.stats?.age || '—'}</td>
                            <td style={S.td}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button onClick={() => startEdit(p)} style={S.btnEdit} title="Modifier">✏️</button>
                                <button onClick={() => deletePlayer(p.id)} style={S.btnDelete} title="Supprimer">✕</button>
                              </div>
                            </td>
                          </tr>
                        )}
                        {editingId === p.id && (
                          <tr style={{ background: 'rgba(201,168,76,0.06)', borderBottom: '2px solid rgba(201,168,76,0.25)' }}>
                            <td colSpan={7} style={{ padding: '12px 10px' }}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={S.labelSm}>Nom</label>
                                  <input value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                    style={{ ...S.inlineInput, minWidth: 150 }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={S.labelSm}>Nationalité</label>
                                  <input value={editForm.nationality}
                                    onChange={e => setEditForm(f => ({ ...f, nationality: e.target.value }))}
                                    style={{ ...S.inlineInput, width: 110 }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={S.labelSm}>Poste</label>
                                  <select value={editForm.position}
                                    onChange={e => setEditForm(f => ({ ...f, position: e.target.value }))}
                                    style={S.inlineSelect}>
                                    {['GK', 'DEF', 'MID', 'FWD', 'COACH'].map(pos => (
                                      <option key={pos} value={pos}>{POSITION_LABELS[pos] || pos}</option>
                                    ))}
                                  </select>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={S.labelSm}>Équipe</label>
                                  <input value={editForm.team}
                                    onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))}
                                    style={{ ...S.inlineInput, width: 110 }} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                  <label style={S.labelSm}>Prix M€</label>
                                  <input type="text" inputMode="decimal"
                                    value={editForm.price}
                                    onChange={e => setEditForm(f => ({ ...f, price: e.target.value }))}
                                    style={{ ...S.inlineInput, width: 70, color: '#c9a84c' }} placeholder="7,5" />
                                </div>
                                {editForm.position !== 'COACH' && (
                                  <>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <label style={S.labelSm}>Âge</label>
                                      <input type="number" value={editForm.age}
                                        onChange={e => setEditForm(f => ({ ...f, age: e.target.value }))}
                                        style={{ ...S.inlineInput, width: 55 }} />
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                      <label style={S.labelSm}>N° maillot</label>
                                      <input type="number" value={editForm.jersey_number}
                                        onChange={e => setEditForm(f => ({ ...f, jersey_number: e.target.value }))}
                                        style={{ ...S.inlineInput, width: 55 }} />
                                    </div>
                                  </>
                                )}
                                <div style={{ display: 'flex', gap: 6, paddingBottom: 2 }}>
                                  <button onClick={() => saveEdit(p.id)} disabled={saving}
                                    style={{ ...S.btnConfirm, fontSize: 12, padding: '6px 14px' }}>
                                    {saving ? '⟳' : '✅ Sauvegarder'}
                                  </button>
                                  <button onClick={cancelEdit} style={{ ...S.btnMini, padding: '6px 14px' }}>Annuler</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB : STATS
        ══════════════════════════════════════════════════ */}
        {tab === 'stats' && (
          <div>
            {!stats ? (
              <div style={S.empty}><span style={{ fontSize: 40 }}>📊</span><p>Chargement...</p></div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                {[
                  { icon: '👤', label: 'Utilisateurs', value: stats.total_users },
                  { icon: '⚽', label: 'Joueurs', value: stats.total_players },
                  { icon: '🧑‍💼', label: 'Entraîneurs', value: stats.total_coaches },
                  { icon: '🏳️', label: 'Nations', value: stats.teams_count },
                ].map(({ icon, label, value }) => (
                  <div key={label} style={S.statCard}>
                    <span style={{ fontSize: 32 }}>{icon}</span>
                    <div style={S.statValue}>{value ?? '—'}</div>
                    <div style={S.statLabel}>{label}</div>
                  </div>
                ))}
                {stats.positions && Object.entries(stats.positions).map(([pos, cnt]) => (
                  <div key={pos} style={{ ...S.statCard, borderColor: POSITION_COLORS[pos] + '44' }}>
                    <Badge pos={pos} />
                    <div style={{ ...S.statValue, color: POSITION_COLORS[pos] }}>{cnt as number}</div>
                    <div style={S.statLabel}>{POSITION_LABELS[pos]}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════
            TAB : GROUPES
        ══════════════════════════════════════════════════ */}
        {tab === 'groupes' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h2 style={{ ...S.cardTitle, marginBottom: 4 }}>🏆 Coupe du Monde 2026 — Groupes</h2>
                <p style={S.cardSub}>48 équipes · 12 groupes de 4 · Effectif complet = 26 joueurs + 1 entraîneur</p>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {(['empty', 'partial', 'complete'] as EffectifStatus[]).map(s => {
                  const count = Object.keys(GROUPES).flatMap(g => GROUPES[g]).filter(eq => {
                    const st = getTeamStat(eq)
                    return getEffectifStatus(st.players, st.coaches) === s
                  }).length
                  return (
                    <div key={s} style={{
                      ...S.statCard,
                      padding: '10px 16px',
                      borderColor: STATUS_COLORS[s].border,
                      background: STATUS_COLORS[s].bg,
                      minWidth: 90,
                    }}>
                      <StatusDot status={s} />
                      <div style={{ fontSize: '1.5rem', fontFamily: "'Bebas Neue',sans-serif", color: STATUS_COLORS[s].text }}>{count}</div>
                      <div style={{ fontSize: 10, color: STATUS_COLORS[s].text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {s === 'empty' ? 'Vides' : s === 'partial' ? 'En cours' : 'Complètes'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
              {Object.entries(GROUPES).map(([groupe, equipes]) => (
                <div key={groupe} style={S.groupeDetailCard}>
                  <div style={S.groupeDetailHeader}>Groupe {groupe}</div>
                  {equipes.map((eq, i) => {
                    const st = getTeamStat(eq)
                    const status = getEffectifStatus(st.players, st.coaches)
                    const c = STATUS_COLORS[status]
                    return (
                      <div key={eq} style={{
                        ...S.groupeRow,
                        background: c.bg,
                        borderLeft: `3px solid ${c.dot}`,
                      }}>
                        <span style={{ color: '#8a9a8c', fontSize: 12, width: 20 }}>{i + 1}.</span>
                        <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[eq] || '🏳️'}</span>
                        <span style={{ fontSize: 13, flex: 1 }}>{eq}</span>
                        <span style={{ fontSize: 11, color: c.text, minWidth: 60, textAlign: 'center' }}>
                          {status === 'empty' ? '—' : `${st.players}/26 ${st.coaches ? '+ 🧑‍💼' : ''}`}
                        </span>
                        <StatusDot status={status} />
                        <button onClick={() => { setTab('import'); handleSelectNation(eq) }}
                          style={{ ...S.btnMini, fontSize: 10, padding: '3px 7px' }}>
                          Import
                        </button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
  bg: { minHeight: '100vh', background: '#0a1f0e', color: '#f5f5f0', fontFamily: "'DM Sans', sans-serif" },
  centered: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1f0e' },
  errorBox: { background: 'rgba(15,45,20,0.9)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 16, padding: '2rem', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'center' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(15,45,20,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 100, flexWrap: 'wrap', gap: 8 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', color: '#c9a84c', letterSpacing: '0.05em' },
  adminBadge: { background: '#c9a84c22', color: '#c9a84c', border: '1px solid #c9a84c44', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' },
  tournamentBadge: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#8a9a8c' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  userTag: { fontSize: 13, color: '#8a9a8c' },
  btnOutline: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 14px', color: '#8a9a8c', fontSize: 12, cursor: 'pointer' },

  // ── Provider toggle ─────────────────────────────────────────────────────────
  providerToggle: { display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(0,0,0,0.25)', borderRadius: 8, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.08)' },
  providerButtons: { display: 'flex', gap: 3 },
  providerBtn: { border: 'none', borderRadius: 6, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s', letterSpacing: '0.03em' },
  providerBtnGroqActive: { background: '#f05722', color: '#fff', boxShadow: '0 0 12px #f0572255' },
  providerBtnGeminiActive: { background: '#4285f4', color: '#fff', boxShadow: '0 0 12px #4285f455' },
  providerBtnInactive: { background: 'rgba(255,255,255,0.06)', color: '#8a9a8c' },

  // ── Suggest button ───────────────────────────────────────────────────────────
  btnSuggest: {
    display: 'flex', alignItems: 'center', gap: 10,
    background: 'linear-gradient(135deg, rgba(201,168,76,0.15), rgba(201,168,76,0.08))',
    border: '1px solid rgba(201,168,76,0.4)',
    borderRadius: 10, padding: '10px 16px', cursor: 'pointer', color: '#c9a84c',
    transition: 'all 0.2s',
  },

  container: { maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' },
  titleRow: { marginBottom: '1rem' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: '#f5f5f0', letterSpacing: '0.04em', marginBottom: 4 },
  subtitle: { color: '#8a9a8c', fontSize: 14 },
  legendBar: { display: 'flex', gap: 20, marginBottom: 16, padding: '8px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, flexWrap: 'wrap', alignItems: 'center' },
  legendItem: { display: 'flex', alignItems: 'center', gap: 7 },
  tabs: { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)' },
  tabBtn: { background: 'transparent', border: 'none', color: '#8a9a8c', padding: '10px 20px', fontSize: 14, cursor: 'pointer', borderBottom: '2px solid transparent', transition: 'all 0.2s', borderRadius: '6px 6px 0 0' },
  tabActive: { color: '#c9a84c', borderBottom: '2px solid #c9a84c', background: 'rgba(201,168,76,0.05)' },
  card: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: '1.5rem' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: 12 },
  cardTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', color: '#f5f5f0', letterSpacing: '0.04em', marginBottom: 4 },
  cardSub: { color: '#8a9a8c', fontSize: 13 },
  nationCard: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(201,168,76,0.2)', borderRadius: 12, padding: '1.5rem' },
  nationCardHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  nationCardTitle: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.1rem', color: '#c9a84c', letterSpacing: '0.04em' },
  groupeBadge: { background: 'rgba(201,168,76,0.15)', color: '#c9a84c', borderRadius: 4, padding: '2px 8px', fontSize: 12, marginLeft: 4 },
  nationSearch: { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f5f5f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  nationDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f2d14', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, maxHeight: 320, overflowY: 'auto', zIndex: 200, marginTop: 4 },
  groupeHeader: { padding: '6px 14px', fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(201,168,76,0.05)' },
  nationOption: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 14, transition: 'background 0.15s' },
  nationOptionActive: { background: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  closeDropdown: { width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#8a9a8c', padding: '10px', cursor: 'pointer', fontSize: 12 },
  groupesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 12 },
  groupeCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px', display: 'flex', flexDirection: 'column', gap: 4 },
  groupeCardTitle: { fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 },
  equipeBtn: { background: 'transparent', border: 'none', borderLeft: '2px solid transparent', color: '#f5f5f0', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: '3px 6px', borderRadius: '0 4px 4px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, transition: 'background 0.15s' },
  modeToggle: { display: 'flex', gap: 8, marginBottom: '1.25rem' },
  modeBtn: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 16px', color: '#8a9a8c', fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' },
  modeBtnActive: { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.4)', color: '#c9a84c' },
  label: { display: 'block', fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  labelSm: { fontSize: 10, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em' },
  textarea: { width: '100%', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '12px 14px', color: '#f5f5f0', fontSize: 14, resize: 'vertical', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 12 },
  input: { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#f5f5f0', fontSize: 14, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' },
  select: { width: '100%', background: '#0f2d14', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '10px 12px', color: '#f5f5f0', fontSize: 14, outline: 'none', cursor: 'pointer' },
  inlineInput: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 8px', color: '#f5f5f0', fontSize: 13, outline: 'none', fontFamily: 'inherit' },
  inlineSelect: { background: '#0f2d14', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 6px', color: '#f5f5f0', fontSize: 12, outline: 'none', cursor: 'pointer' },
  manualForm: { background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '1rem', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 12 },
  manualGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 },
  dropzone: { border: '2px dashed rgba(201,168,76,0.3)', borderRadius: 10, padding: '2rem', textAlign: 'center', cursor: 'pointer', transition: 'all 0.2s', minHeight: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', marginBottom: 12 },
  dropzoneActive: { border: '2px dashed #c9a84c', background: 'rgba(201,168,76,0.06)' },
  removeImg: { background: 'rgba(224,82,82,0.15)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 6, color: '#f08080', fontSize: 12, padding: '4px 12px', cursor: 'pointer' },
  btnGold: { background: '#c9a84c', color: '#0a1f0e', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: '0.1em', border: 'none', borderRadius: 8, padding: '12px 24px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 8 },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  btnConfirm: { background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontFamily: "'Bebas Neue', sans-serif", fontSize: '1rem', letterSpacing: '0.08em', border: 'none', borderRadius: 8, padding: '11px 24px', cursor: 'pointer' },
  btnMini: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#8a9a8c', fontSize: 11, padding: '5px 10px', cursor: 'pointer' },
  btnDelete: { background: 'rgba(224,82,82,0.1)', border: '1px solid rgba(224,82,82,0.2)', borderRadius: 5, color: '#f08080', fontSize: 12, padding: '3px 9px', cursor: 'pointer' },
  btnDeleteBatch: { background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.35)', borderRadius: 6, color: '#f08080', fontSize: 12, padding: '5px 12px', cursor: 'pointer', fontWeight: 600 },
  btnEdit: { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.25)', borderRadius: 5, fontSize: 13, padding: '3px 8px', cursor: 'pointer' },
  groqTag: { background: '#f0572222', color: '#f05722', border: '1px solid #f0572244', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 },
  geminiTag: { background: '#4285f422', color: '#4285f4', border: '1px solid #4285f444', borderRadius: 6, padding: '4px 10px', fontSize: 12, fontWeight: 600 },
  results: { marginTop: '1.25rem', background: 'rgba(0,0,0,0.2)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, padding: '1rem' },
  resultsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  warningChip: { background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#f59e0b' },
  th: { padding: '8px 10px', textAlign: 'left', fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 },
  td: { padding: '8px 10px', fontSize: 14, color: '#f5f5f0' },
  errorBanner: { background: 'rgba(224,82,82,0.12)', border: '1px solid rgba(224,82,82,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#f08080', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  successBanner: { background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#34d399', marginTop: 12 },
  closeBtn: { background: 'none', border: 'none', color: '#f08080', cursor: 'pointer', fontSize: 14 },
  coachSection: { background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 8, padding: '10px', marginBottom: 12 },
  coachSectionTitle: { fontSize: 11, color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginBottom: 8 },
  coachRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', borderRadius: 6, flexWrap: 'wrap' },
  multiSelectBar: { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, marginBottom: 12, flexWrap: 'wrap' },
  statCard: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 12, padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  statValue: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', color: '#c9a84c', letterSpacing: '0.04em', lineHeight: 1 },
  statLabel: { fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.08em' },
  empty: { textAlign: 'center', padding: '3rem', color: '#8a9a8c', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  groupeDetailCard: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' },
  groupeDetailHeader: { background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.2)', padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#c9a84c', letterSpacing: '0.06em' },
  groupeRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' },
}