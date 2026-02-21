import React, { createContext, useContext, useReducer, useEffect, useState } from 'react'
import { defaultState } from '../data/defaultState'
import { checkForNewStickers } from '../utils/milestones'
import { fetchStateFromBackend, saveStateToBackend } from '../utils/backendApi'

const AppContext = createContext(null)
const ADMIN_PIN = '6789'
const ADMIN_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

function mergeStateWithDefaults(inputState) {
  const base = { ...defaultState, ...(inputState || {}) }
  return {
    ...base,
    settings: { ...defaultState.settings, ...(base.settings || {}) },
    islaProfile: { ...defaultState.islaProfile, ...(base.islaProfile || {}) },
    disciplines: base.disciplines?.length ? base.disciplines : defaultState.disciplines,
    routines: base.routines || [],
    shows: base.shows || [],
    sessions: base.sessions || [],
    stickers: base.stickers || [],
    practiceLog: base.practiceLog || [],
  }
}

// Migrate old state shape to new model
function migrateOldState(inputState) {
  if (!inputState) return inputState
  // Detect old shape: has 'chunks', 'choreography', or 'rhythmScores'
  const hasOldShape = inputState.chunks || inputState.choreography || inputState.rhythmScores != null
  if (!hasOldShape) return inputState

  const migrated = { ...inputState }

  // Convert old choreography + chunks into a routine
  if (inputState.choreography && inputState.choreography.musicUrl) {
    const oldChoreo = inputState.choreography
    const routine = {
      id: `routine-migrated-${Date.now()}`,
      name: inputState.settings?.danceName || 'Migrated Routine',
      type: 'practice',
      formation: 'solo',
      dancers: [inputState.settings?.dancers?.[0] || 'Isla'],
      disciplineId: null,
      choreographyVersions: [{
        id: `cv-migrated-${Date.now()}`,
        versionName: 'Original',
        date: new Date().toISOString().split('T')[0],
        musicUrl: oldChoreo.musicUrl || '',
        musicFileName: oldChoreo.musicFileName || '',
        duration: oldChoreo.duration || 0,
        songInstructions: oldChoreo.songInstructions || [],
        videoSyncOffset: oldChoreo.videoSyncOffset || 0,
      }],
      practiceVideos: [],
    }
    migrated.routines = [routine, ...(migrated.routines || [])]
  }

  // Convert old sessions — add routineId/disciplineId fields
  if (inputState.sessions) {
    migrated.sessions = inputState.sessions.map(s => ({
      ...s,
      routineId: s.routineId || null,
      disciplineId: s.disciplineId || null,
      notes: s.praise ? [...(s.praise || []), ...(s.workOn || [])] : (s.notes || []),
      islaReflection: s.islaReflection || { feeling: '', note: '', goals: [] },
    }))
  }

  // Map old settings
  if (inputState.settings) {
    migrated.settings = {
      dancerName: inputState.settings.dancers?.[0] || inputState.settings.dancerName || 'Isla',
      themeColor: inputState.settings.themeColor || '#a855f7',
      promptLeadMs: inputState.settings.promptLeadMs || 200,
    }
  }

  // Ensure disciplines exist
  if (!migrated.disciplines || migrated.disciplines.length === 0) {
    migrated.disciplines = defaultState.disciplines
  }

  // Ensure islaProfile exists
  if (!migrated.islaProfile) {
    migrated.islaProfile = defaultState.islaProfile
  }

  // Remove old keys
  delete migrated.chunks
  delete migrated.choreography
  delete migrated.rhythmScores

  return migrated
}

function stateFromDanceRow(row) {
  const source = row?.state_data || {}
  const migrated = migrateOldState(source)
  return mergeStateWithDefaults({
    ...migrated,
    settings: {
      ...(migrated.settings || {}),
      dancerName: row?.dancers?.[0] ?? migrated?.settings?.dancerName ?? 'Isla',
      themeColor: row?.theme_color ?? migrated?.settings?.themeColor,
      promptLeadMs: row?.prompt_lead_ms ?? migrated?.settings?.promptLeadMs,
    },
  })
}

// ============ REDUCER ============
function appReducer(state, action) {
  switch (action.type) {
    // ---- Sessions ----
    case "ADD_SESSION":
      return { ...state, sessions: [...state.sessions, action.payload] }

    case "UPDATE_SESSION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload } : s
        ),
      }

    case "DELETE_SESSION":
      return {
        ...state,
        sessions: state.sessions.filter((s) => s.id !== action.payload),
      }

    // ---- Isla's self-reflection on a session ----
    case "SET_SESSION_REFLECTION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, islaReflection: { ...s.islaReflection, ...action.payload.reflection } }
            : s
        ),
      }

    // ---- Emoji reactions ----
    case "ADD_EMOJI_REACTION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, emojiReactions: [...(s.emojiReactions || []), action.payload.emoji] }
            : s
        ),
      }

    // ---- Disciplines ----
    case "SET_DISCIPLINES":
      return { ...state, disciplines: action.payload }

    case "UPDATE_DISCIPLINE":
      return {
        ...state,
        disciplines: state.disciplines.map((d) =>
          d.id === action.payload.id ? { ...d, ...action.payload } : d
        ),
      }

    case "ADD_DISCIPLINE":
      return { ...state, disciplines: [...state.disciplines, action.payload] }

    case "DELETE_DISCIPLINE":
      return { ...state, disciplines: state.disciplines.filter((d) => d.id !== action.payload) }

    // ---- Discipline elements ----
    case "SET_ELEMENT_STATUS":
      return {
        ...state,
        disciplines: state.disciplines.map((d) =>
          d.id === action.payload.disciplineId
            ? {
                ...d,
                elements: d.elements.map((e) =>
                  e.id === action.payload.elementId
                    ? { ...e, status: action.payload.status }
                    : e
                ),
              }
            : d
        ),
      }

    case "ADD_ELEMENT":
      return {
        ...state,
        disciplines: state.disciplines.map((d) =>
          d.id === action.payload.disciplineId
            ? { ...d, elements: [...d.elements, action.payload.element] }
            : d
        ),
      }

    case "DELETE_ELEMENT":
      return {
        ...state,
        disciplines: state.disciplines.map((d) =>
          d.id === action.payload.disciplineId
            ? { ...d, elements: d.elements.filter((e) => e.id !== action.payload.elementId) }
            : d
        ),
      }

    // ---- Routines ----
    case "ADD_ROUTINE":
      return { ...state, routines: [...state.routines, action.payload] }

    case "UPDATE_ROUTINE":
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      }

    case "DELETE_ROUTINE":
      return { ...state, routines: state.routines.filter((r) => r.id !== action.payload) }

    // ---- Choreography versions within a routine ----
    case "ADD_CHOREOGRAPHY_VERSION": {
      const { routineId, version } = action.payload
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === routineId
            ? { ...r, choreographyVersions: [...(r.choreographyVersions || []), version] }
            : r
        ),
      }
    }

    case "UPDATE_CHOREOGRAPHY_VERSION": {
      const { routineId, versionId, updates } = action.payload
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === routineId
            ? {
                ...r,
                choreographyVersions: (r.choreographyVersions || []).map((v) =>
                  v.id === versionId ? { ...v, ...updates } : v
                ),
              }
            : r
        ),
      }
    }

    // ---- Practice videos within a routine ----
    case "ADD_PRACTICE_VIDEO": {
      const { routineId, video } = action.payload
      return {
        ...state,
        routines: state.routines.map((r) =>
          r.id === routineId
            ? { ...r, practiceVideos: [...(r.practiceVideos || []), video] }
            : r
        ),
      }
    }

    // ---- Shows ----
    case "ADD_SHOW":
      return { ...state, shows: [...state.shows, action.payload] }

    case "UPDATE_SHOW":
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload } : s
        ),
      }

    case "DELETE_SHOW":
      return { ...state, shows: state.shows.filter((s) => s.id !== action.payload) }

    // ---- Scrapbook entries within a show ----
    case "ADD_SCRAPBOOK_ENTRY": {
      const { showId, entry } = action.payload
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === showId
            ? { ...s, scrapbookEntries: [...(s.scrapbookEntries || []), entry] }
            : s
        ),
      }
    }

    case "ADD_SCRAPBOOK_REACTION": {
      const { showId, entryId, emoji } = action.payload
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === showId
            ? {
                ...s,
                scrapbookEntries: (s.scrapbookEntries || []).map((e) =>
                  e.id === entryId
                    ? { ...e, emojiReactions: [...(e.emojiReactions || []), emoji] }
                    : e
                ),
              }
            : s
        ),
      }
    }

    // ---- Stickers ----
    case "ADD_STICKERS":
      return { ...state, stickers: [...state.stickers, ...action.payload] }

    case "ADD_CUSTOM_STICKER":
      return { ...state, stickers: [...state.stickers, action.payload] }

    // ---- Practice log ----
    case "LOG_PRACTICE":
      if (state.practiceLog.includes(action.payload)) return state
      return { ...state, practiceLog: [...state.practiceLog, action.payload] }

    // ---- Isla's profile ----
    case "UPDATE_ISLA_PROFILE":
      return { ...state, islaProfile: { ...state.islaProfile, ...action.payload } }

    case "ADD_GOAL":
      return {
        ...state,
        islaProfile: {
          ...state.islaProfile,
          goals: [...state.islaProfile.goals, action.payload],
        },
      }

    case "COMPLETE_GOAL":
      return {
        ...state,
        islaProfile: {
          ...state.islaProfile,
          goals: state.islaProfile.goals.map((g) =>
            g.id === action.payload
              ? { ...g, completedDate: new Date().toISOString().split('T')[0] }
              : g
          ),
        },
      }

    case "SET_CURRENT_FOCUS":
      return {
        ...state,
        islaProfile: { ...state.islaProfile, currentFocus: action.payload },
      }

    // ---- Settings ----
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } }

    // ---- Full state ----
    case "IMPORT_STATE":
      return mergeStateWithDefaults(migrateOldState(action.payload))

    case "RESET_STATE":
      return { ...defaultState }

    default:
      return state
  }
}

// ============ PROVIDER ============
export function AppProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminTimer, setAdminTimer] = useState(null)

  // Admin mode: unlock with PIN, auto-lock after timeout
  const unlockAdmin = (pin) => {
    if (pin === ADMIN_PIN) {
      setIsAdmin(true)
      // Clear existing timer
      if (adminTimer) clearTimeout(adminTimer)
      // Set auto-lock timer
      const timer = setTimeout(() => setIsAdmin(false), ADMIN_TIMEOUT_MS)
      setAdminTimer(timer)
      return true
    }
    return false
  }

  const lockAdmin = () => {
    setIsAdmin(false)
    if (adminTimer) clearTimeout(adminTimer)
  }

  // Reset admin timer on admin actions
  const resetAdminTimer = () => {
    if (!isAdmin) return
    if (adminTimer) clearTimeout(adminTimer)
    const timer = setTimeout(() => setIsAdmin(false), ADMIN_TIMEOUT_MS)
    setAdminTimer(timer)
  }

  // Load from localStorage or use defaults
  const loadInitialState = () => {
    try {
      const saved = localStorage.getItem("dance-tracker-state")
      if (saved) {
        const parsed = JSON.parse(saved)
        return mergeStateWithDefaults(migrateOldState(parsed))
      }
    } catch (e) {
      console.warn("Failed to load state from localStorage:", e)
    }
    return defaultState
  }

  const [state, dispatch] = useReducer(appReducer, null, loadInitialState)

  // Load from backend on mount
  useEffect(() => {
    async function fetchState() {
      try {
        const payload = await fetchStateFromBackend()

        if (payload?.source === 'dance' && payload?.danceData?.state_data) {
          dispatch({ type: 'IMPORT_STATE', payload: stateFromDanceRow(payload.danceData) })
        } else if (payload?.source === 'app_state' && payload?.appStateData?.state_data) {
          const merged = mergeStateWithDefaults(payload.appStateData.state_data)
          dispatch({ type: 'IMPORT_STATE', payload: merged })
        }
      } catch (err) {
        console.warn('Backend state fetch unavailable; using local state only:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchState()
  }, [])

  // Persist to localStorage and backend on every state change
  useEffect(() => {
    if (isLoading) return // Don't save while initially loading

    try {
      localStorage.setItem("dance-tracker-state", JSON.stringify(state))
    } catch (e) {
      console.warn("Failed to save state to localStorage:", e)
    }

    // Debounce backend saves to avoid too many requests
    const saveToBackend = async () => {
      try {
        await saveStateToBackend(state)
      } catch (err) {
        console.warn('Backend state save failed; local save still kept:', err)
      }
    }

    const timeoutId = setTimeout(saveToBackend, 1000) // 1 second debounce
    return () => clearTimeout(timeoutId)
  }, [state, isLoading])

  // Check for new sticker unlocks on state changes
  useEffect(() => {
    const newStickers = checkForNewStickers(state)
    if (newStickers.length > 0) {
      dispatch({ type: "ADD_STICKERS", payload: newStickers })
    }
  }, [state.sessions, state.practiceLog, state.disciplines, state.shows])

  return (
    <AppContext.Provider value={{ state, dispatch, isLoading, isAdmin, unlockAdmin, lockAdmin, resetAdminTimer }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
