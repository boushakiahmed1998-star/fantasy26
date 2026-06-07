import { create } from 'zustand'
import axios from 'axios'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface Player {
  id: string
  name: string
  nationality: string
  position: 'GK' | 'DEF' | 'MID' | 'FWD'
  team: string
  price: number
  stats?: Record<string, unknown>
}

export interface Coach {
  id: string
  name: string
  nationality: string
  team: string
  price: number
}

// ── Configurations formations ──────────────────────────────────────────────────

export const FORMATIONS: Record<string, { GK: number; DEF: number; MID: number; FWD: number }> = {
  '4-3-3':   { GK: 1, DEF: 4, MID: 3, FWD: 3 },
  '4-4-2':   { GK: 1, DEF: 4, MID: 4, FWD: 2 },
  '3-5-2':   { GK: 1, DEF: 3, MID: 5, FWD: 2 },
  '4-2-3-1': { GK: 1, DEF: 4, MID: 5, FWD: 1 },
  '3-4-3':   { GK: 1, DEF: 3, MID: 4, FWD: 3 },
  '5-3-2':   { GK: 1, DEF: 5, MID: 3, FWD: 2 },
  '5-4-1':   { GK: 1, DEF: 5, MID: 4, FWD: 1 },
}

// ── Positions sur le terrain (x%, y%) par formation ───────────────────────────

export const FIELD_POSITIONS: Record<string, Record<string, [number, number]>> = {
  '4-3-3': {
    GK_0: [50, 86],
    DEF_0: [13, 67], DEF_1: [35, 67], DEF_2: [65, 67], DEF_3: [87, 67],
    MID_0: [20, 47], MID_1: [50, 44], MID_2: [80, 47],
    FWD_0: [20, 20], FWD_1: [50, 16], FWD_2: [80, 20],
  },
  '4-4-2': {
    GK_0: [50, 86],
    DEF_0: [13, 67], DEF_1: [35, 67], DEF_2: [65, 67], DEF_3: [87, 67],
    MID_0: [13, 50], MID_1: [36, 50], MID_2: [64, 50], MID_3: [87, 50],
    FWD_0: [33, 20], FWD_1: [67, 20],
  },
  '3-5-2': {
    GK_0: [50, 86],
    DEF_0: [24, 67], DEF_1: [50, 67], DEF_2: [76, 67],
    MID_0: [9, 52], MID_1: [29, 47], MID_2: [50, 44], MID_3: [71, 47], MID_4: [91, 52],
    FWD_0: [33, 20], FWD_1: [67, 20],
  },
  '4-2-3-1': {
    GK_0: [50, 86],
    DEF_0: [13, 67], DEF_1: [35, 67], DEF_2: [65, 67], DEF_3: [87, 67],
    MID_0: [32, 60], MID_1: [68, 60],
    MID_2: [14, 42], MID_3: [50, 38], MID_4: [86, 42],
    FWD_0: [50, 16],
  },
  '3-4-3': {
    GK_0: [50, 86],
    DEF_0: [24, 67], DEF_1: [50, 67], DEF_2: [76, 67],
    MID_0: [13, 50], MID_1: [36, 50], MID_2: [64, 50], MID_3: [87, 50],
    FWD_0: [20, 20], FWD_1: [50, 16], FWD_2: [80, 20],
  },
  '5-3-2': {
    GK_0: [50, 86],
    DEF_0: [9, 67], DEF_1: [27, 67], DEF_2: [50, 67], DEF_3: [73, 67], DEF_4: [91, 67],
    MID_0: [20, 47], MID_1: [50, 44], MID_2: [80, 47],
    FWD_0: [33, 20], FWD_1: [67, 20],
  },
  '5-4-1': {
    GK_0: [50, 86],
    DEF_0: [9, 67], DEF_1: [27, 67], DEF_2: [50, 67], DEF_3: [73, 67], DEF_4: [91, 67],
    MID_0: [13, 50], MID_1: [36, 50], MID_2: [64, 50], MID_3: [87, 50],
    FWD_0: [50, 16],
  },
}

// ── Helpers formation ──────────────────────────────────────────────────────────

export function getFormationSlots(formation: string): { slotId: string; position: 'GK' | 'DEF' | 'MID' | 'FWD' }[] {
  const config = FORMATIONS[formation] || FORMATIONS['4-3-3']
  const slots: { slotId: string; position: 'GK' | 'DEF' | 'MID' | 'FWD' }[] = []

  for (const pos of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    for (let i = 0; i < config[pos]; i++) {
      slots.push({ slotId: `${pos}_${i}`, position: pos })
    }
  }

  // Banc : 1 GK + 1 DEF + 1 MID + 1 FWD
  const bench = ['GK', 'DEF', 'MID', 'FWD'] as const
  bench.forEach((pos, i) => slots.push({ slotId: `BENCH_${i}`, position: pos }))

  return slots
}

export function getSlotPosition(slotId: string): 'GK' | 'DEF' | 'MID' | 'FWD' {
  return slotId.split('_')[0] as 'GK' | 'DEF' | 'MID' | 'FWD'
}

export function isBenchSlot(slotId: string): boolean {
  return slotId.startsWith('BENCH_')
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface FantasyState {
  formation: string
  slots: Record<string, Player | null>
  coach: Coach | null
  captainId: string | null
  teamName: string
  activeSlot: string | null
  loading: boolean
  saving: boolean
  error: string | null
  savedMsg: string | null

  // Actions
  setFormation: (f: string) => void
  setActiveSlot: (slotId: string | null) => void
  addPlayer: (slotId: string, player: Player) => void
  removePlayer: (slotId: string) => void
  setCoach: (coach: Coach | null) => void
  setCaptain: (playerId: string) => void
  setTeamName: (name: string) => void
  clearError: () => void

  // API
  loadTeam: () => Promise<void>
  saveTeam: () => Promise<void>
  autoFill: (formation?: string) => Promise<void>

  // Computed helpers
  getBudgetUsed: () => number
  getNationalityCount: () => Record<string, number>
  getPlayerCount: () => number
}

export const useFantasyStore = create<FantasyState>((set, get) => ({
  formation: '4-3-3',
  slots: {},
  coach: null,
  captainId: null,
  teamName: 'Ma Sélection',
  activeSlot: null,
  loading: false,
  saving: false,
  error: null,
  savedMsg: null,

  setFormation: (f) => {
    const { slots } = get()
    // Conserver les joueurs dans les slots compatibles avec la nouvelle formation
    const newSlotDefs = getFormationSlots(f)
    const newSlots: Record<string, Player | null> = {}
    newSlotDefs.forEach(({ slotId }) => {
      newSlots[slotId] = slots[slotId] ?? null
    })
    set({ formation: f, slots: newSlots, activeSlot: null })
  },

  setActiveSlot: (slotId) => set({ activeSlot: slotId }),

  addPlayer: (slotId, player) => {
    const { slots } = get()
    // Si le joueur est déjà dans un autre slot, le retirer
    const newSlots: Record<string, Player | null> = {}
    Object.entries(slots).forEach(([sid, p]) => {
      newSlots[sid] = p?.id === player.id ? null : p
    })
    newSlots[slotId] = player
    set({ slots: newSlots, activeSlot: null, error: null, savedMsg: null })
  },

  removePlayer: (slotId) => {
    const { slots, captainId } = get()
    const removed = slots[slotId]
    set({
      slots: { ...slots, [slotId]: null },
      captainId: removed?.id === captainId ? null : captainId,
      savedMsg: null,
    })
  },

  setCoach: (coach) => set({ coach, savedMsg: null }),

  setCaptain: (playerId) => {
    const { captainId } = get()
    set({ captainId: captainId === playerId ? null : playerId, savedMsg: null })
  },

  setTeamName: (name) => set({ teamName: name }),
  clearError: () => set({ error: null }),

  getBudgetUsed: () => {
    const { slots, coach } = get()
    const playersTotal = Object.values(slots).reduce((sum, p) => sum + (p?.price ?? 0), 0)
    return playersTotal + (coach?.price ?? 0)
  },

  getNationalityCount: () => {
    const counts: Record<string, number> = {}
    Object.values(get().slots).forEach(p => {
      if (p) counts[p.nationality] = (counts[p.nationality] ?? 0) + 1
    })
    return counts
  },

  getPlayerCount: () => Object.values(get().slots).filter(Boolean).length,

  // ── API calls ──────────────────────────────────────────────────────────────

  loadTeam: async () => {
    set({ loading: true, error: null })
    try {
      const { data } = await axios.get('/api/v1/fantasy/my-team')
      if (data.team) {
        const { players: meta, coach, name } = data.team
        const formationData = meta || {}
        const formation = formationData.formation || '4-3-3'
        const rawSlots: Record<string, string | null> = formationData.slots || {}
        const playersData: Record<string, Player> = data.team.players_data || {}

        const slots: Record<string, Player | null> = {}
        Object.entries(rawSlots).forEach(([sid, pid]) => {
          slots[sid] = pid ? (playersData[pid] ?? null) : null
        })

        set({
          formation,
          slots,
          coach: coach || null,
          captainId: formationData.captain_id || null,
          teamName: name || 'Ma Sélection',
        })
      }
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      console.error('loadTeam error:', e)
      set({ error: err?.response?.data?.detail || 'Erreur de chargement' })
    } finally {
      set({ loading: false })
    }
  },

  saveTeam: async () => {
    const { slots, coach, captainId, teamName, formation } = get()
    set({ saving: true, error: null, savedMsg: null })

    try {
      const slotMap: Record<string, string | null> = {}
      Object.entries(slots).forEach(([sid, p]) => { slotMap[sid] = p?.id ?? null })

      await axios.post('/api/v1/fantasy/save', {
        name: teamName,
        formation,
        slots: slotMap,
        coach_id: coach?.id ?? null,
        captain_id: captainId,
      })

      set({ savedMsg: '✅ Équipe sauvegardée !', saving: false })
      setTimeout(() => set({ savedMsg: null }), 4000)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string | { message?: string } } } }
      const detail = err?.response?.data?.detail
      const msg = (typeof detail === 'object' ? detail?.message : detail) || 'Erreur lors de la sauvegarde'
      set({ error: msg, saving: false })
    }
  },

  autoFill: async (formationOverride) => {
    const formation = formationOverride || get().formation
    set({ loading: true, error: null, savedMsg: null })

    try {
      const { data } = await axios.post('/api/v1/fantasy/auto-fill', { formation, budget: 100 })

      const newSlots: Record<string, Player | null> = {}
      Object.entries(data.slots).forEach(([sid, p]) => { newSlots[sid] = p as Player })

      set({
        formation,
        slots: newSlots,
        coach: data.coach ?? null,
        loading: false,
      })
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      set({
        error: err?.response?.data?.detail || 'Impossible de générer une équipe',
        loading: false,
      })
    }
  },
}))