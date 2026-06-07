import React, { useState, useRef, useCallback } from 'react'
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

// ── Types ──────────────────────────────────────────────────────────────────────

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
  _editing?: boolean
}

interface ParseResult {
  type: string
  source_info: string
  players: PlayerEntry[]
  coaches: PlayerEntry[]
  warnings: string[]
  total: number
}

type InputMode = 'text' | 'image' | 'manual'
type Tab = 'import' | 'players' | 'stats' | 'groupes'

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
  const [players, setPlayers] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const [manualPlayer, setManualPlayer] = useState<PlayerEntry>({
    name: '', nationality: '', position: 'FWD', team: '', price: 7,
    age: null, jersey_number: null, _selected: true, _type: 'player',
  })

  const filteredNations = TOUTES_EQUIPES.filter(({ equipe }) =>
    equipe.toLowerCase().includes(nationSearch.toLowerCase())
  )

  const handleSelectNation = (equipe: string) => {
    setSelectedNation(equipe)
    setNationSearch('')
    setShowNationPicker(false)
    setManualPlayer(prev => ({ ...prev, nationality: equipe, team: equipe }))
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
      const { data } = await axios.post<ParseResult>('/api/v1/admin/import-players', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const fixNation = (p: PlayerEntry) => ({
        ...p,
        nationality: selectedNation,
        team: selectedNation,
        _selected: true,
      })
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

  const handleConfirm = async () => {
    const selected = entries.filter(e => e._selected)
    if (!selected.length) { setError('Sélectionnez au moins une entrée.'); return }
    setConfirming(true); setError(null)
    try {
      const payload = {
        players: selected.filter(e => e._type === 'player').map(({ _selected, _type, _editing, ...rest }) => rest),
        coaches: selected.filter(e => e._type === 'coach').map(({ _selected, _type, _editing, ...rest }) => rest),
      }
      const { data } = await axios.post('/api/v1/admin/confirm-import', payload)
      setConfirmSuccess(`✅ ${data.inserted_players} joueur(s) et ${data.inserted_coaches} entraîneur(s) importés pour ${selectedNation}` + (data.errors.length ? ` | ⚠ ${data.errors.length} erreur(s)` : ''))
      setResult(null); setEntries([]); setText(''); setImageFile(null); setImagePreview(null)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur lors de la confirmation')
    } finally { setConfirming(false) }
  }

  const loadPlayers = async () => {
    try { const { data } = await axios.get('/api/v1/admin/players'); setPlayers(data.players) } catch {}
  }

  const loadStats = async () => {
    try { const { data } = await axios.get('/api/v1/admin/stats'); setStats(data) } catch {}
  }

  const handleTabChange = (t: Tab) => {
    setTab(t)
    if (t === 'players') loadPlayers()
    if (t === 'stats') loadStats()
  }

  const deletePlayer = async (id: string) => {
    if (!confirm('Supprimer ce joueur ?')) return
    await axios.delete(`/api/v1/admin/players/${id}`)
    loadPlayers()
  }

  const selectedNationInfo = TOUTES_EQUIPES.find(e => e.equipe === selectedNation)

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
          <span style={S.userTag}>👤 {user.username}</span>
          <button onClick={() => navigate('/dashboard')} style={S.btnOutline}>Dashboard</button>
          <button onClick={() => { logout(); navigate('/login') }} style={S.btnOutline}>Déconnexion</button>
        </div>
      </div>

      <div style={S.container}>
        <div style={S.titleRow}>
          <h1 style={S.title}>Panneau d'Administration</h1>
          <p style={S.subtitle}>Gestion des effectifs · 48 équipes · Coupe du Monde 2026</p>
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
                  <span style={S.nationSelected}>
                    {FLAG_EMOJIS[selectedNation] || '🏳️'} {selectedNation}
                    {selectedNationInfo && <span style={S.groupeBadge}>Groupe {selectedNationInfo.groupe}</span>}
                  </span>
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
                          {filtered.map(equipe => (
                            <div key={equipe} onClick={() => handleSelectNation(equipe)} style={{
                              ...S.nationOption,
                              ...(equipe === selectedNation ? S.nationOptionActive : {}),
                            }}>
                              <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[equipe] || '🏳️'}</span>
                              <span>{equipe}</span>
                            </div>
                          ))}
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

              {/* Grille des groupes rapide */}
              {!showNationPicker && !selectedNation && (
                <div style={S.groupesGrid}>
                  {Object.entries(GROUPES).map(([groupe, equipes]) => (
                    <div key={groupe} style={S.groupeCard}>
                      <div style={S.groupeCardTitle}>Groupe {groupe}</div>
                      {equipes.map(eq => (
                        <button key={eq} onClick={() => handleSelectNation(eq)} style={S.equipeBtn}>
                          {FLAG_EMOJIS[eq] || '🏳️'} {eq}
                        </button>
                      ))}
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
                    <p style={S.cardSub}>Groq (texte) · Gemini Vision (image) · Manuel</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={S.groqTag}>Groq</span>
                    <span style={S.geminiTag}>Gemini</span>
                  </div>
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
                    <label style={S.label}>Collez l'effectif complet (liste des joueurs)</label>
                    <textarea value={text} onChange={e => setText(e.target.value)}
                      placeholder={"Exemple :\nGardiens : Raul Rangel (Chivas), Carlos Acevedo\nDéfenseurs : Jorge Sánchez (PAOK)...\nMilieux : Edson Álvarez (Fenerbahçe)...\nAttaquants : Roberto Alvarado...\nEntraîneur : Javier Aguirre"}
                      style={S.textarea} rows={10} />
                    <button onClick={handleParse}
                      disabled={loading || !text.trim()}
                      style={{ ...S.btnGold, ...(loading ? S.btnDisabled : {}) }}>
                      {loading ? '⟳ Analyse...' : `🚀 Analyser avec Groq → ${selectedNation}`}
                    </button>
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
                          <button style={S.removeImg} onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }}>
                            ✕ Changer
                          </button>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 40 }}>📸</span>
                          <p style={{ color: '#f5f5f0', fontSize: 14 }}>Glissez une image ou cliquez</p>
                          <p style={{ color: '#8a9a8c', fontSize: 12 }}>JPG, PNG, WEBP</p>
                        </div>
                      )}
                    </div>
                    <input ref={fileRef} type="file" accept="image/*"
                      onChange={e => { const f = e.target.files?.[0]; if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)) } }}
                      style={{ display: 'none' }} />
                    <button onClick={handleParse}
                      disabled={loading || !imageFile}
                      style={{ ...S.btnGold, ...(loading ? S.btnDisabled : {}), marginTop: 12 }}>
                      {loading ? '⟳ Analyse Gemini...' : `🤖 Analyser l'image → ${selectedNation}`}
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
                          onChange={e => setManualPlayer(p => ({ ...p, position: e.target.value as any, _type: e.target.value === 'COACH' ? 'coach' : 'player' }))}
                          style={S.select}>
                          <option value="GK">Gardien (GK)</option>
                          <option value="DEF">Défenseur (DEF)</option>
                          <option value="MID">Milieu (MID)</option>
                          <option value="FWD">Attaquant (FWD)</option>
                          <option value="COACH">Entraîneur</option>
                        </select>
                      </div>
                      <div>
                        <label style={S.label}>Prix (M€)</label>
                        <input type="number" value={manualPlayer.price} min={1} max={30}
                          onChange={e => setManualPlayer(p => ({ ...p, price: parseInt(e.target.value) || 7 }))}
                          style={S.input} />
                      </div>
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
                    </div>
                    <button onClick={handleAddManual} style={{ ...S.btnGold, marginTop: 0 }}>
                      ➕ Ajouter à {selectedNation}
                    </button>
                  </div>
                )}

                {/* Erreur / succès */}
                {error && (
                  <div style={S.errorBanner}>
                    <span>{error}</span>
                    <button onClick={() => setError(null)} style={S.closeBtn}>✕</button>
                  </div>
                )}
                {confirmSuccess && <div style={S.successBanner}>{confirmSuccess}</div>}

                {/* ── Table des entrées parsées / manuelles ── */}
                {entries.length > 0 && (
                  <div style={S.results}>
                    <div style={S.resultsHeader}>
                      <h3 style={{ fontSize: 15, fontWeight: 600, color: '#f5f5f0' }}>
                        {FLAG_EMOJIS[selectedNation]} {selectedNation} — {entries.length} joueur(s)
                        {result && <span style={{ color: '#8a9a8c', fontWeight: 400, fontSize: 13 }}> · {result.source_info}</span>}
                      </h3>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button style={S.btnMini} onClick={() => setEntries(e => e.map(x => ({ ...x, _selected: true })))}>Tout ✓</button>
                        <button style={S.btnMini} onClick={() => setEntries(e => e.map(x => ({ ...x, _selected: false })))}>Tout ✗</button>
                      </div>
                    </div>

                    {/* Avertissements IA */}
                    {result?.warnings && result.warnings.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                        {result.warnings.map((w, i) => (
                          <span key={i} style={S.warningChip}>⚠ {w}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            {['Sél.', 'N°', 'Nom', 'Poste', 'Nationalité', 'Équipe', 'Prix (M€)', 'Âge', 'Sup.'].map((h, i) => (
                              <th key={i} style={S.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {entries.map((entry, idx) => (
                            <tr key={idx} style={{
                              borderBottom: '1px solid rgba(255,255,255,0.04)',
                              opacity: entry._selected ? 1 : 0.4,
                              background: entry._selected ? 'rgba(201,168,76,0.04)' : 'transparent',
                            }}>
                              <td style={{ ...S.td, width: 36 }}>
                                <input type="checkbox" checked={!!entry._selected}
                                  onChange={() => updateEntry(idx, '_selected', !entry._selected)}
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
                                  {['GK', 'DEF', 'MID', 'FWD', 'COACH'].map(p => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                </select>
                              </td>
                              <td style={S.td}>
                                <span style={{ fontSize: 13, color: '#c9a84c' }}>
                                  {FLAG_EMOJIS[entry.nationality] || '🏳️'} {entry.nationality}
                                </span>
                              </td>
                              <td style={S.td}>
                                <input value={entry.team}
                                  onChange={e => updateEntry(idx, 'team', e.target.value)}
                                  style={{ ...S.inlineInput, width: 100 }} />
                              </td>
                              <td style={S.td}>
                                <input type="number" value={entry.price} min={1} max={30}
                                  onChange={e => updateEntry(idx, 'price', parseInt(e.target.value) || 1)}
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
                      <span style={{ fontSize: 13, color: '#8a9a8c' }}>
                        {entries.filter(e => e._selected).length} / {entries.length} sélectionné(s)
                        · {entries.filter(e => e._selected && e._type === 'player').length} joueurs
                        · {entries.filter(e => e._selected && e._type === 'coach').length} coach
                      </span>
                      <button onClick={handleConfirm}
                        disabled={confirming || !entries.filter(e => e._selected).length}
                        style={{ ...S.btnConfirm, ...(confirming ? S.btnDisabled : {}) }}>
                        {confirming ? '⟳ Importation...' : `✅ Confirmer l'import — ${selectedNation}`}
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
              <button onClick={loadPlayers} style={S.btnMini}>🔄 Actualiser</button>
            </div>

            <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {Object.entries(GROUPES).map(([g, equipes]) =>
                equipes.map(eq => (
                  <button key={`${g}-${eq}`} onClick={async () => {
                    try {
                      const { data } = await axios.get(`/api/v1/admin/players?team=${encodeURIComponent(eq)}`)
                      setPlayers(data.players)
                    } catch {}
                  }} style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 6, padding: '4px 10px',
                    color: '#8a9a8c', fontSize: 11, cursor: 'pointer',
                  }}>
                    {FLAG_EMOJIS[eq] || '🏳️'} {eq}
                  </button>
                ))
              )}
              <button onClick={loadPlayers} style={{ ...S.btnMini, background: 'rgba(201,168,76,0.1)', color: '#c9a84c' }}>
                Toutes les équipes
              </button>
            </div>

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
                      {['Nation', 'Nom', 'Poste', 'Prix', 'Âge', 'Sup.'].map((h, i) => (
                        <th key={i} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => (
                      <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={S.td}>
                          <span style={{ fontSize: 18 }}>{FLAG_EMOJIS[p.nationality] || '🏳️'}</span>
                          <span style={{ fontSize: 12, color: '#8a9a8c', marginLeft: 6 }}>{p.nationality}</span>
                        </td>
                        <td style={{ ...S.td, fontWeight: 500 }}>{p.name}</td>
                        <td style={S.td}><Badge pos={p.position} /></td>
                        <td style={{ ...S.td, color: '#c9a84c' }}>{p.price}M</td>
                        <td style={{ ...S.td, color: '#8a9a8c' }}>{p.stats?.age || '—'}</td>
                        <td style={S.td}>
                          <button onClick={() => deletePlayer(p.id)} style={S.btnDelete}>✕</button>
                        </td>
                      </tr>
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
            TAB : GROUPES CdM 2026
        ══════════════════════════════════════════════════ */}
        {tab === 'groupes' && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ ...S.cardTitle, marginBottom: 4 }}>🏆 Coupe du Monde 2026 — Groupes</h2>
              <p style={S.cardSub}>48 équipes · 12 groupes de 4 · USA, Canada, Mexique</p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
              {Object.entries(GROUPES).map(([groupe, equipes]) => (
                <div key={groupe} style={S.groupeDetailCard}>
                  <div style={S.groupeDetailHeader}>Groupe {groupe}</div>
                  {equipes.map((eq, i) => (
                    <div key={eq} style={S.groupeRow}>
                      <span style={{ color: '#8a9a8c', fontSize: 12, width: 20 }}>{i + 1}.</span>
                      <span style={{ fontSize: 20 }}>{FLAG_EMOJIS[eq] || '🏳️'}</span>
                      <span style={{ fontSize: 14, flex: 1 }}>{eq}</span>
                      <button onClick={() => { setTab('import'); handleSelectNation(eq) }}
                        style={{ ...S.btnMini, fontSize: 10, padding: '3px 7px' }}>
                        Importer
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div style={{ ...S.card, marginTop: 20 }}>
              <h3 style={{ ...S.cardTitle, fontSize: '1rem', marginBottom: 12 }}>📋 Règles de qualification</h3>
              <div style={{ color: '#8a9a8c', fontSize: 13, lineHeight: 1.7 }}>
                <p>• <strong style={{ color: '#f5f5f0' }}>2 premiers de chaque groupe</strong> → qualifiés directement (24 équipes)</p>
                <p>• <strong style={{ color: '#f5f5f0' }}>8 meilleurs 3es</strong> sur 12 → qualifiés via classement</p>
                <p>• Critères de départage : Points → Différence de buts → Buts marqués → Fair-play → Classement FIFA</p>
                <p>• Total : <strong style={{ color: '#c9a84c' }}>32 équipes</strong> au tour final</p>
              </div>
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
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 2rem', borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'rgba(15,45,20,0.95)', backdropFilter: 'blur(8px)', position: 'sticky', top: 0, zIndex: 100 },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '1.3rem', color: '#c9a84c', letterSpacing: '0.05em' },
  adminBadge: { background: '#c9a84c22', color: '#c9a84c', border: '1px solid #c9a84c44', borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em' },
  tournamentBadge: { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 4, padding: '2px 8px', fontSize: 11, color: '#8a9a8c' },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userTag: { fontSize: 13, color: '#8a9a8c' },
  btnOutline: { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 14px', color: '#8a9a8c', fontSize: 12, cursor: 'pointer' },
  container: { maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' },
  titleRow: { marginBottom: '1.5rem' },
  title: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '2rem', color: '#f5f5f0', letterSpacing: '0.04em', marginBottom: 4 },
  subtitle: { color: '#8a9a8c', fontSize: 14 },
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
  nationSelected: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 600, color: '#f5f5f0' },
  groupeBadge: { background: 'rgba(201,168,76,0.15)', color: '#c9a84c', borderRadius: 4, padding: '2px 8px', fontSize: 12, marginLeft: 6 },
  nationSearch: { width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, padding: '10px 14px', color: '#f5f5f0', fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  nationDropdown: { position: 'absolute', top: '100%', left: 0, right: 0, background: '#0f2d14', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 8, maxHeight: 320, overflowY: 'auto', zIndex: 200, marginTop: 4 },
  groupeHeader: { padding: '6px 14px', fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(201,168,76,0.05)' },
  nationOption: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', cursor: 'pointer', fontSize: 14, transition: 'background 0.15s' },
  nationOptionActive: { background: 'rgba(201,168,76,0.15)', color: '#c9a84c' },
  closeDropdown: { width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.06)', color: '#8a9a8c', padding: '10px', cursor: 'pointer', fontSize: 12 },
  groupesGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8, marginTop: 12 },
  groupeCard: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px', display: 'flex', flexDirection: 'column', gap: 4 },
  groupeCardTitle: { fontSize: 11, color: '#c9a84c', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 },
  equipeBtn: { background: 'transparent', border: 'none', color: '#f5f5f0', fontSize: 13, cursor: 'pointer', textAlign: 'left', padding: '3px 4px', borderRadius: 4, transition: 'background 0.15s' },
  modeToggle: { display: 'flex', gap: 8, marginBottom: '1.25rem' },
  modeBtn: { flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 16px', color: '#8a9a8c', fontSize: 14, cursor: 'pointer', transition: 'all 0.2s' },
  modeBtnActive: { background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.4)', color: '#c9a84c' },
  label: { display: 'block', fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
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
  statCard: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(201,168,76,0.15)', borderRadius: 12, padding: '1.5rem', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  statValue: { fontFamily: "'Bebas Neue', sans-serif", fontSize: '2.5rem', color: '#c9a84c', letterSpacing: '0.04em', lineHeight: 1 },
  statLabel: { fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.08em' },
  empty: { textAlign: 'center', padding: '3rem', color: '#8a9a8c', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  groupeDetailCard: { background: 'rgba(15,45,20,0.6)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 10, overflow: 'hidden' },
  groupeDetailHeader: { background: 'rgba(201,168,76,0.1)', borderBottom: '1px solid rgba(201,168,76,0.2)', padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#c9a84c', letterSpacing: '0.06em' },
  groupeRow: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)' },
}