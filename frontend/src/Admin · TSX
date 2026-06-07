import React, { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// ── Types ──────────────────────────────────────────────────────────────────────

interface ParsedEntry {
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
  players: ParsedEntry[]
  coaches: ParsedEntry[]
  warnings: string[]
  total: number
}

type InputMode = 'text' | 'image'
type Tab = 'import' | 'players' | 'stats'

// ── Helpers ────────────────────────────────────────────────────────────────────

const POSITION_COLORS: Record<string, string> = {
  GK: '#f59e0b',
  DEF: '#3b82f6',
  MID: '#10b981',
  FWD: '#ef4444',
  COACH: '#8b5cf6',
}

const POSITION_LABELS: Record<string, string> = {
  GK: 'GK', DEF: 'DEF', MID: 'MIL', FWD: 'ATT', COACH: 'COACH',
}

function Badge({ pos }: { pos: string }) {
  return (
    <span style={{
      background: POSITION_COLORS[pos] + '22',
      color: POSITION_COLORS[pos],
      border: `1px solid ${POSITION_COLORS[pos]}44`,
      borderRadius: 4,
      padding: '2px 7px',
      fontSize: 11,
      fontWeight: 600,
      letterSpacing: '0.05em',
      textTransform: 'uppercase',
    }}>
      {POSITION_LABELS[pos] || pos}
    </span>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function Admin() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  // Guard admin
  if (user?.role !== 'admin') {
    return (
      <div style={styles.centered}>
        <div style={styles.errorBox}>
          <span style={{ fontSize: 32 }}>🔒</span>
          <p>Accès réservé aux administrateurs</p>
          <button onClick={() => navigate('/dashboard')} style={styles.btnGold}>
            Retour au Dashboard
          </button>
        </div>
      </div>
    )
  }

  const [tab, setTab] = useState<Tab>('import')
  const [mode, setMode] = useState<InputMode>('text')
  const [text, setText] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ParseResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [confirmSuccess, setConfirmSuccess] = useState<string | null>(null)
  const [players, setPlayers] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [entries, setEntries] = useState<ParsedEntry[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Drag & drop
  const [dragOver, setDragOver] = useState(false)

  const handleImageDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const handleParse = async () => {
    setError(null)
    setResult(null)
    setConfirmSuccess(null)
    setLoading(true)

    try {
      const formData = new FormData()
      if (mode === 'text' && text.trim()) {
        formData.append('text', text.trim())
      } else if (mode === 'image' && imageFile) {
        formData.append('image', imageFile)
      } else {
        setError('Fournissez du texte ou une image.')
        setLoading(false)
        return
      }

      const { data } = await axios.post<ParseResult>('/api/v1/admin/import-players', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      setResult(data)
      // Fusionner joueurs + coachs avec sélection par défaut = true
      const all: ParsedEntry[] = [
        ...data.players.map(p => ({ ...p, _selected: true, _type: 'player' as const })),
        ...data.coaches.map(c => ({ ...c, _selected: true, _type: 'coach' as const })),
      ]
      setEntries(all)
    } catch (e: any) {
      const detail = e.response?.data?.detail
      if (detail?.error === 'RULE_VIOLATION') {
        setError(`⚠ Règle violée : ${detail.message}`)
      } else {
        setError(typeof detail === 'string' ? detail : 'Erreur lors de l\'analyse IA')
      }
    } finally {
      setLoading(false)
    }
  }

  const toggleEntry = (idx: number) => {
    setEntries(prev => prev.map((e, i) => i === idx ? { ...e, _selected: !e._selected } : e))
  }

  const updatePrice = (idx: number, val: string) => {
    const n = parseInt(val)
    if (!isNaN(n)) {
      setEntries(prev => prev.map((e, i) => i === idx ? { ...e, price: n } : e))
    }
  }

  const handleConfirm = async () => {
    const selected = entries.filter(e => e._selected)
    if (selected.length === 0) {
      setError('Sélectionnez au moins une entrée à importer.')
      return
    }

    setConfirming(true)
    setError(null)
    try {
      const payload = {
        players: selected.filter(e => e._type === 'player').map(({ _selected, _type, ...rest }) => rest),
        coaches: selected.filter(e => e._type === 'coach').map(({ _selected, _type, ...rest }) => rest),
      }
      const { data } = await axios.post('/api/v1/admin/confirm-import', payload)
      setConfirmSuccess(
        `✅ Importé : ${data.inserted_players} joueur(s) et ${data.inserted_coaches} entraîneur(s)` +
        (data.errors.length ? ` | ⚠ ${data.errors.length} erreur(s)` : '')
      )
      setResult(null)
      setEntries([])
      setText('')
      setImageFile(null)
      setImagePreview(null)
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Erreur lors de la confirmation')
    } finally {
      setConfirming(false)
    }
  }

  const loadPlayers = async () => {
    try {
      const { data } = await axios.get('/api/v1/admin/players')
      setPlayers(data.players)
    } catch { /* handled */ }
  }

  const loadStats = async () => {
    try {
      const { data } = await axios.get('/api/v1/admin/stats')
      setStats(data)
    } catch { /* handled */ }
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

  return (
    <div style={styles.bg}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>🏆 Fantasy Boulzazen</span>
          <span style={styles.adminBadge}>ADMIN</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.userTag}>👤 {user.username}</span>
          <button onClick={() => navigate('/dashboard')} style={styles.btnOutline}>Dashboard</button>
          <button onClick={() => { logout(); navigate('/login') }} style={styles.btnOutline}>Déconnexion</button>
        </div>
      </div>

      <div style={styles.container}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>Panneau d'Administration</h1>
          <p style={styles.subtitle}>Gestion des joueurs, entraîneurs et données du tournoi</p>
        </div>

        {/* Tabs */}
        <div style={styles.tabs}>
          {([['import', '🤖 Import IA'], ['players', '👥 Joueurs'], ['stats', '📊 Stats']] as [Tab, string][]).map(([t, label]) => (
            <button
              key={t}
              onClick={() => handleTabChange(t)}
              style={{ ...styles.tabBtn, ...(tab === t ? styles.tabActive : {}) }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB IMPORT ── */}
        {tab === 'import' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2 style={styles.cardTitle}>Import via Intelligence Artificielle</h2>
                <p style={styles.cardSub}>Groq (texte) · Gemini Vision (image/OCR)</p>
              </div>
              <div style={styles.aiLogos}>
                <span style={styles.groqTag}>Groq</span>
                <span style={styles.geminiTag}>Gemini</span>
              </div>
            </div>

            {/* Mode Toggle */}
            <div style={styles.modeToggle}>
              {(['text', 'image'] as InputMode[]).map(m => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setResult(null); setError(null) }}
                  style={{ ...styles.modeBtn, ...(mode === m ? styles.modeBtnActive : {}) }}
                >
                  {m === 'text' ? '📝 Texte / Copier-Coller' : '🖼️ Image / Capture d\'écran'}
                </button>
              ))}
            </div>

            {/* Text Input */}
            {mode === 'text' && (
              <div>
                <label style={styles.label}>
                  Collez ici la liste des joueurs, effectif ou données textuelles
                </label>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  placeholder={`Exemple :\nKylian Mbappé - Attaquant - France - PSG\nGianluigi Donnarumma - Gardien - Italie\nOu même un texte non structuré, l'IA l'analysera...`}
                  style={styles.textarea}
                  rows={10}
                />
              </div>
            )}

            {/* Image Drop Zone */}
            {mode === 'image' && (
              <div>
                <label style={styles.label}>Image de la fiche d'effectif (capture, photo, scan...)</label>
                <div
                  style={{ ...styles.dropzone, ...(dragOver ? styles.dropzoneActive : {}) }}
                  onDragOver={e => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleImageDrop}
                  onClick={() => fileRef.current?.click()}
                >
                  {imagePreview ? (
                    <div style={styles.previewWrap}>
                      <img src={imagePreview} alt="preview" style={styles.preview} />
                      <button
                        style={styles.removeImg}
                        onClick={e => { e.stopPropagation(); setImageFile(null); setImagePreview(null) }}
                      >✕ Changer</button>
                    </div>
                  ) : (
                    <div style={styles.dropContent}>
                      <span style={{ fontSize: 40 }}>📸</span>
                      <p style={styles.dropText}>Glissez une image ici ou cliquez pour parcourir</p>
                      <p style={styles.dropSub}>JPG, PNG, WEBP · Max 10MB</p>
                    </div>
                  )}
                </div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  style={{ display: 'none' }}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={styles.errorBanner}>
                <span>{error}</span>
                <button onClick={() => setError(null)} style={styles.closeBtn}>✕</button>
              </div>
            )}

            {/* Success */}
            {confirmSuccess && (
              <div style={styles.successBanner}>{confirmSuccess}</div>
            )}

            {/* Parse Button */}
            <button
              onClick={handleParse}
              disabled={loading || (mode === 'text' ? !text.trim() : !imageFile)}
              style={{ ...styles.btnGold, ...(loading ? styles.btnDisabled : {}) }}
            >
              {loading ? (
                <><span style={styles.spinner}>⟳</span> Analyse en cours...</>
              ) : (
                `🚀 Analyser avec l'IA ${mode === 'image' ? '(Gemini)' : '(Groq)'}`
              )}
            </button>

            {/* ── Results ── */}
            {result && entries.length > 0 && (
              <div style={styles.results}>
                <div style={styles.resultsHeader}>
                  <div>
                    <h3 style={styles.resultsTitle}>
                      {result.total} entrée(s) détectée(s)
                      <span style={styles.sourceInfo}> · {result.source_info}</span>
                    </h3>
                    {result.warnings.length > 0 && (
                      <div style={styles.warnings}>
                        {result.warnings.map((w, i) => (
                          <span key={i} style={styles.warningChip}>⚠ {w}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div style={styles.selectActions}>
                    <button style={styles.btnMini} onClick={() => setEntries(e => e.map(x => ({ ...x, _selected: true })))}>
                      Tout sélectionner
                    </button>
                    <button style={styles.btnMini} onClick={() => setEntries(e => e.map(x => ({ ...x, _selected: false })))}>
                      Tout désélectionner
                    </button>
                  </div>
                </div>

                {/* Entries Table */}
                <div style={styles.tableWrap}>
                  <table style={styles.table}>
                    <thead>
                      <tr style={styles.thead}>
                        <th style={styles.th}></th>
                        <th style={styles.th}>Nom</th>
                        <th style={styles.th}>Poste</th>
                        <th style={styles.th}>Nationalité</th>
                        <th style={styles.th}>Équipe</th>
                        <th style={styles.th}>Prix (M€)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entries.map((entry, idx) => (
                        <tr
                          key={idx}
                          style={{
                            ...styles.tr,
                            opacity: entry._selected ? 1 : 0.4,
                            background: entry._selected ? 'rgba(201,168,76,0.04)' : 'transparent',
                          }}
                        >
                          <td style={{ ...styles.td, width: 40 }}>
                            <input
                              type="checkbox"
                              checked={!!entry._selected}
                              onChange={() => toggleEntry(idx)}
                              style={styles.checkbox}
                            />
                          </td>
                          <td style={{ ...styles.td, fontWeight: 500 }}>{entry.name}</td>
                          <td style={styles.td}><Badge pos={entry.position} /></td>
                          <td style={styles.td}>
                            <span style={styles.natChip}>{entry.nationality}</span>
                          </td>
                          <td style={{ ...styles.td, color: 'var(--muted, #8a9a8c)', fontSize: 13 }}>{entry.team}</td>
                          <td style={styles.td}>
                            <input
                              type="number"
                              value={entry.price}
                              onChange={e => updatePrice(idx, e.target.value)}
                              min={1}
                              max={30}
                              style={styles.priceInput}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Confirm */}
                <div style={styles.confirmRow}>
                  <span style={styles.selectedCount}>
                    {entries.filter(e => e._selected).length} / {entries.length} sélectionné(s)
                  </span>
                  <button
                    onClick={handleConfirm}
                    disabled={confirming || entries.filter(e => e._selected).length === 0}
                    style={{ ...styles.btnConfirm, ...(confirming ? styles.btnDisabled : {}) }}
                  >
                    {confirming ? '⟳ Importation...' : '✅ Confirmer l\'import'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── TAB PLAYERS ── */}
        {tab === 'players' && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <h2 style={styles.cardTitle}>Joueurs & Entraîneurs ({players.length})</h2>
              <button onClick={loadPlayers} style={styles.btnMini}>🔄 Actualiser</button>
            </div>
            {players.length === 0 ? (
              <div style={styles.empty}>
                <span style={{ fontSize: 48 }}>⚽</span>
                <p>Aucun joueur en base. Utilisez l'onglet Import IA.</p>
              </div>
            ) : (
              <div style={styles.tableWrap}>
                <table style={styles.table}>
                  <thead>
                    <tr style={styles.thead}>
                      <th style={styles.th}>Nom</th>
                      <th style={styles.th}>Poste</th>
                      <th style={styles.th}>Nationalité</th>
                      <th style={styles.th}>Équipe</th>
                      <th style={styles.th}>Prix</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {players.map(p => (
                      <tr key={p.id} style={styles.tr}>
                        <td style={{ ...styles.td, fontWeight: 500 }}>{p.name}</td>
                        <td style={styles.td}><Badge pos={p.position} /></td>
                        <td style={styles.td}><span style={styles.natChip}>{p.nationality}</span></td>
                        <td style={{ ...styles.td, color: '#8a9a8c', fontSize: 13 }}>{p.team}</td>
                        <td style={{ ...styles.td, color: '#c9a84c' }}>{p.price}M</td>
                        <td style={styles.td}>
                          <button onClick={() => deletePlayer(p.id)} style={styles.btnDelete}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── TAB STATS ── */}
        {tab === 'stats' && stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { icon: '👤', label: 'Utilisateurs', value: stats.total_users },
              { icon: '⚽', label: 'Joueurs', value: stats.total_players },
              { icon: '🧑‍💼', label: 'Entraîneurs', value: stats.total_coaches },
              { icon: '🏳️', label: 'Nations', value: stats.teams_count },
            ].map(({ icon, label, value }) => (
              <div key={label} style={styles.statCard}>
                <span style={{ fontSize: 32 }}>{icon}</span>
                <div style={styles.statValue}>{value}</div>
                <div style={styles.statLabel}>{label}</div>
              </div>
            ))}
            {stats.positions && Object.entries(stats.positions).map(([pos, cnt]) => (
              <div key={pos} style={{ ...styles.statCard, borderColor: POSITION_COLORS[pos] + '44' }}>
                <Badge pos={pos} />
                <div style={{ ...styles.statValue, color: POSITION_COLORS[pos] }}>{cnt as number}</div>
                <div style={styles.statLabel}>{POSITION_LABELS[pos]}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'stats' && !stats && (
          <div style={styles.empty}>
            <span style={{ fontSize: 40 }}>📊</span><p>Chargement des statistiques...</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  bg: {
    minHeight: '100vh',
    background: 'var(--green-dark, #0a1f0e)',
    color: 'var(--white, #f5f5f0)',
    fontFamily: "'DM Sans', sans-serif",
  },
  centered: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0a1f0e',
  },
  errorBox: {
    background: 'rgba(15,45,20,0.9)',
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 16,
    padding: '2rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    alignItems: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 2rem',
    borderBottom: '1px solid rgba(255,255,255,0.07)',
    background: 'rgba(15,45,20,0.95)',
    backdropFilter: 'blur(8px)',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 12 },
  logo: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.3rem',
    color: '#c9a84c',
    letterSpacing: '0.05em',
  },
  adminBadge: {
    background: '#c9a84c22',
    color: '#c9a84c',
    border: '1px solid #c9a84c44',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: '0.1em',
  },
  headerRight: { display: 'flex', alignItems: 'center', gap: 10 },
  userTag: { fontSize: 13, color: '#8a9a8c' },
  btnOutline: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    padding: '6px 14px',
    color: '#8a9a8c',
    fontSize: 12,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  container: { maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' },
  titleRow: { marginBottom: '1.5rem' },
  title: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '2rem',
    color: '#f5f5f0',
    letterSpacing: '0.04em',
    marginBottom: 4,
  },
  subtitle: { color: '#8a9a8c', fontSize: 14 },
  tabs: { display: 'flex', gap: 4, marginBottom: '1.5rem', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 0 },
  tabBtn: {
    background: 'transparent',
    border: 'none',
    color: '#8a9a8c',
    padding: '10px 20px',
    fontSize: 14,
    cursor: 'pointer',
    borderBottom: '2px solid transparent',
    transition: 'all 0.2s',
    borderRadius: '6px 6px 0 0',
  },
  tabActive: { color: '#c9a84c', borderBottom: '2px solid #c9a84c', background: 'rgba(201,168,76,0.05)' },
  card: {
    background: 'rgba(15,45,20,0.6)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: '1.5rem',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: 12,
  },
  cardTitle: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1.3rem',
    color: '#f5f5f0',
    letterSpacing: '0.04em',
    marginBottom: 4,
  },
  cardSub: { color: '#8a9a8c', fontSize: 13 },
  aiLogos: { display: 'flex', gap: 6 },
  groqTag: {
    background: '#f0572222',
    color: '#f05722',
    border: '1px solid #f0572244',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  geminiTag: {
    background: '#4285f422',
    color: '#4285f4',
    border: '1px solid #4285f444',
    borderRadius: 6,
    padding: '4px 10px',
    fontSize: 12,
    fontWeight: 600,
  },
  modeToggle: { display: 'flex', gap: 8, marginBottom: '1.25rem' },
  modeBtn: {
    flex: 1,
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: '10px 16px',
    color: '#8a9a8c',
    fontSize: 14,
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    background: 'rgba(201,168,76,0.1)',
    border: '1px solid rgba(201,168,76,0.4)',
    color: '#c9a84c',
  },
  label: { display: 'block', fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 },
  textarea: {
    width: '100%',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.12)',
    borderRadius: 8,
    padding: '12px 14px',
    color: '#f5f5f0',
    fontSize: 14,
    resize: 'vertical',
    outline: 'none',
    fontFamily: "'DM Sans', sans-serif",
    boxSizing: 'border-box',
  },
  dropzone: {
    border: '2px dashed rgba(201,168,76,0.3)',
    borderRadius: 10,
    padding: '2rem',
    textAlign: 'center',
    cursor: 'pointer',
    transition: 'all 0.2s',
    minHeight: 160,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.02)',
  },
  dropzoneActive: {
    border: '2px dashed #c9a84c',
    background: 'rgba(201,168,76,0.06)',
  },
  dropContent: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 },
  dropText: { color: '#f5f5f0', fontSize: 14 },
  dropSub: { color: '#8a9a8c', fontSize: 12 },
  previewWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  preview: { maxHeight: 200, maxWidth: '100%', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' },
  removeImg: {
    background: 'rgba(224,82,82,0.15)',
    border: '1px solid rgba(224,82,82,0.3)',
    borderRadius: 6,
    color: '#f08080',
    fontSize: 12,
    padding: '4px 12px',
    cursor: 'pointer',
  },
  errorBanner: {
    background: 'rgba(224,82,82,0.12)',
    border: '1px solid rgba(224,82,82,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: '#f08080',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  closeBtn: { background: 'none', border: 'none', color: '#f08080', cursor: 'pointer', fontSize: 14 },
  successBanner: {
    background: 'rgba(16,185,129,0.1)',
    border: '1px solid rgba(16,185,129,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    fontSize: 13,
    color: '#34d399',
    marginTop: 12,
  },
  btnGold: {
    marginTop: 16,
    background: '#c9a84c',
    color: '#0a1f0e',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1rem',
    letterSpacing: '0.1em',
    border: 'none',
    borderRadius: 8,
    padding: '13px 24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    transition: 'background 0.2s',
  },
  btnDisabled: { opacity: 0.5, cursor: 'not-allowed' },
  spinner: { display: 'inline-block', animation: 'spin 1s linear infinite' },
  results: {
    marginTop: '1.5rem',
    background: 'rgba(0,0,0,0.2)',
    border: '1px solid rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: '1rem',
  },
  resultsHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap', gap: 8 },
  resultsTitle: { fontSize: 15, fontWeight: 600, color: '#f5f5f0' },
  sourceInfo: { color: '#8a9a8c', fontWeight: 400, fontSize: 13 },
  warnings: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  warningChip: {
    background: 'rgba(245,158,11,0.1)',
    border: '1px solid rgba(245,158,11,0.3)',
    borderRadius: 4,
    padding: '2px 8px',
    fontSize: 11,
    color: '#f59e0b',
  },
  selectActions: { display: 'flex', gap: 8 },
  btnMini: {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6,
    color: '#8a9a8c',
    fontSize: 11,
    padding: '5px 10px',
    cursor: 'pointer',
  },
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse' },
  thead: { borderBottom: '1px solid rgba(255,255,255,0.08)' },
  th: { padding: '8px 12px', textAlign: 'left', fontSize: 11, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 500 },
  tr: { borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.15s' },
  td: { padding: '10px 12px', fontSize: 14, color: '#f5f5f0' },
  checkbox: { width: 15, height: 15, cursor: 'pointer', accentColor: '#c9a84c' },
  natChip: {
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 4,
    padding: '2px 7px',
    fontSize: 12,
  },
  priceInput: {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(201,168,76,0.3)',
    borderRadius: 6,
    color: '#c9a84c',
    fontSize: 13,
    fontWeight: 600,
    padding: '4px 8px',
    width: 60,
    textAlign: 'center',
  },
  confirmRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 },
  selectedCount: { fontSize: 13, color: '#8a9a8c' },
  btnConfirm: {
    background: 'linear-gradient(135deg, #10b981, #059669)',
    color: '#fff',
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '1rem',
    letterSpacing: '0.08em',
    border: 'none',
    borderRadius: 8,
    padding: '11px 24px',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#8a9a8c',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
  },
  btnDelete: {
    background: 'rgba(224,82,82,0.1)',
    border: '1px solid rgba(224,82,82,0.2)',
    borderRadius: 5,
    color: '#f08080',
    fontSize: 12,
    padding: '3px 9px',
    cursor: 'pointer',
  },
  statCard: {
    background: 'rgba(15,45,20,0.6)',
    border: '1px solid rgba(201,168,76,0.15)',
    borderRadius: 12,
    padding: '1.5rem',
    textAlign: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
  },
  statValue: {
    fontFamily: "'Bebas Neue', sans-serif",
    fontSize: '2.5rem',
    color: '#c9a84c',
    letterSpacing: '0.04em',
    lineHeight: 1,
  },
  statLabel: { fontSize: 12, color: '#8a9a8c', textTransform: 'uppercase', letterSpacing: '0.08em' },
}