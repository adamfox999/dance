import React, { createContext, useContext, useReducer, useEffect, useState } from 'react'
import { defaultState } from '../data/defaultState'
import { checkForNewStickers } from '../utils/milestones'
import { supabase, hasSupabaseConfig } from '../utils/supabaseClient'

const AppContext = createContext(null)

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
      return { ...action.payload }

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
        // Merge in new default keys, including nested keys like settings.viewMode
        return {
          ...defaultState,
          ...parsed,
          settings: {
            ...defaultState.settings,
            ...(parsed.settings || {}),
          },
          choreography: {
            ...defaultState.choreography,
            ...(parsed.choreography || {}),
          },
        }
      }
    } catch (e) {
      console.warn("Failed to load state from localStorage:", e)
    }
    return defaultState
  }

  const [state, dispatch] = useReducer(appReducer, null, loadInitialState)

  // Load from Supabase on mount
  useEffect(() => {
    if (!hasSupabaseConfig || !supabase) {
      setIsLoading(false)
      return
    }

    async function fetchState() {
      try {
        const { data, error } = await supabase
          .from('app_state')
          .select('state_data')
          .eq('id', 1)
          .single()

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
          console.error('Error fetching state from Supabase:', error)
        } else if (data && data.state_data) {
          dispatch({ type: 'IMPORT_STATE', payload: data.state_data })
        }
      } catch (err) {
        console.error('Unexpected error fetching state:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchState()
  }, [])

  // Persist to localStorage and Supabase on every state change
  useEffect(() => {
    if (isLoading) return // Don't save while initially loading

    try {
      localStorage.setItem("dance-tracker-state", JSON.stringify(state))
    } catch (e) {
      console.warn("Failed to save state to localStorage:", e)
    }

    if (!hasSupabaseConfig || !supabase) return

    // Debounce Supabase saves to avoid too many requests
    const saveToSupabase = async () => {
      try {
        const { error } = await supabase
          .from('app_state')
          .upsert({ id: 1, state_data: state })

        if (error) {
          console.error('Error saving state to Supabase:', error)
        }
      } catch (err) {
        console.error('Unexpected error saving state:', err)
      }
    }

    const timeoutId = setTimeout(saveToSupabase, 1000) // 1 second debounce
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
