import React, { createContext, useContext, useReducer, useEffect, useState } from 'react'
import { defaultState } from '../data/defaultState'
import { checkForNewStickers } from '../utils/milestones'
import { fetchStateFromBackend, saveStateToBackend } from '../utils/backendApi'

const AppContext = createContext(null)

function mergeStateWithDefaults(inputState) {
  return {
    ...defaultState,
    ...(inputState || {}),
    settings: {
      ...defaultState.settings,
      ...((inputState || {}).settings || {}),
    },
    choreography: {
      ...defaultState.choreography,
      ...((inputState || {}).choreography || {}),
    },
  }
}

function stateFromDanceRow(row) {
  const source = row?.state_data || {}
  return mergeStateWithDefaults({
    ...source,
    settings: {
      ...(source.settings || {}),
      danceName: row?.name ?? source?.settings?.danceName,
      dancers: row?.dancers ?? source?.settings?.dancers,
      themeColor: row?.theme_color ?? source?.settings?.themeColor,
      viewMode: row?.view_mode ?? source?.settings?.viewMode,
      promptLeadMs: row?.prompt_lead_ms ?? source?.settings?.promptLeadMs,
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

    // ---- Chunk ratings within a session ----
    case "SET_CHUNK_RATING":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? {
                ...s,
                chunkRatings: {
                  ...s.chunkRatings,
                  [action.payload.chunkId]: action.payload.rating,
                },
              }
            : s
        ),
      }

    // ---- Emoji reactions ----
    case "ADD_EMOJI_REACTION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, emojiReactions: [...s.emojiReactions, action.payload.emoji] }
            : s
        ),
      }

    // ---- Praise ----
    case "ADD_PRAISE":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, praise: [...s.praise, action.payload.text] }
            : s
        ),
      }

    // ---- Work-on notes ----
    case "ADD_WORK_ON":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, workOn: [...s.workOn, action.payload.text] }
            : s
        ),
      }

    // ---- Chunks ----
    case "SET_CHUNKS":
      return { ...state, chunks: action.payload }

    case "ADD_CHUNK":
      return { ...state, chunks: [...state.chunks, action.payload] }

    case "UPDATE_CHUNK":
      return {
        ...state,
        chunks: state.chunks.map((c) =>
          c.id === action.payload.id ? { ...c, ...action.payload } : c
        ),
      }

    case "DELETE_CHUNK":
      return {
        ...state,
        chunks: state.chunks.filter((c) => c.id !== action.payload),
      }

    // ---- Stickers ----
    case "ADD_STICKERS":
      return { ...state, stickers: [...state.stickers, ...action.payload] }

    case "ADD_CUSTOM_STICKER":
      return { ...state, stickers: [...state.stickers, action.payload] }

    // ---- Rhythm scores ----
    case "ADD_RHYTHM_SCORE":
      return { ...state, rhythmScores: [...state.rhythmScores, action.payload] }

    // ---- Practice log ----
    case "LOG_PRACTICE":
      if (state.practiceLog.includes(action.payload)) return state
      return { ...state, practiceLog: [...state.practiceLog, action.payload] }

    // ---- Choreography ----
    case "SET_CHOREOGRAPHY":
      return { ...state, choreography: { ...state.choreography, ...action.payload } }

    case "ADD_CUE":
      return {
        ...state,
        choreography: {
          ...state.choreography,
          cues: [...state.choreography.cues, action.payload]
            .sort((a, b) => a.time - b.time),
        },
      }

    case "UPDATE_CUE":
      return {
        ...state,
        choreography: {
          ...state.choreography,
          cues: state.choreography.cues
            .map((c) => (c.id === action.payload.id ? { ...c, ...action.payload } : c))
            .sort((a, b) => a.time - b.time),
        },
      }

    case "DELETE_CUE":
      return {
        ...state,
        choreography: {
          ...state.choreography,
          cues: state.choreography.cues.filter((c) => c.id !== action.payload),
        },
      }

    case "SET_VIDEO_SYNC_OFFSET":
      return {
        ...state,
        choreography: {
          ...state.choreography,
          videoSyncOffset: action.payload,
        },
      }

    // ---- Settings ----
    case "UPDATE_SETTINGS":
      return { ...state, settings: { ...state.settings, ...action.payload } }

    // ---- Full state ----
    case "IMPORT_STATE":
      return mergeStateWithDefaults(action.payload)

    case "RESET_STATE":
      return { ...defaultState }

    default:
      return state
  }
}

// ============ PROVIDER ============
export function AppProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true)

  // Load from localStorage or use defaults
  const loadInitialState = () => {
    try {
      const saved = localStorage.getItem("dance-tracker-state")
      if (saved) {
        const parsed = JSON.parse(saved)
        return mergeStateWithDefaults(parsed)
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
  }, [state.sessions, state.practiceLog, state.rhythmScores])

  return (
    <AppContext.Provider value={{ state, dispatch, isLoading }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
