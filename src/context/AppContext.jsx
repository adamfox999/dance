import { createContext, useContext, useReducer, useEffect, useState } from 'react'
import { defaultState } from '../data/defaultState'
import { checkForNewStickers } from '../utils/milestones'
import { fetchStateFromBackend, saveStateToBackend } from '../utils/backendApi'
import { setFileStorageUserScope } from '../utils/fileStorage'
import { hasSupabaseConfig, supabase } from '../utils/supabaseClient'

const AppContext = createContext(null)
const ADMIN_PIN = '6789'
const ADMIN_TIMEOUT_MS = 10 * 60 * 1000 // 10 minutes

function normalizeVersion(version = {}, index = 0) {
  return {
    id: version.id || `cv-${Date.now()}-${index}`,
    label: version.label || version.versionName || `v${index + 1}`,
    createdAt: version.createdAt || version.date || new Date().toISOString(),
    musicUrl: version.musicUrl || '',
    musicFileName: version.musicFileName || '',
    duration: version.duration || 0,
    songInstructions: Array.isArray(version.songInstructions) ? version.songInstructions : [],
    cues: Array.isArray(version.cues) ? version.cues : [],
    videoSyncOffset: version.videoSyncOffset || 0,
    videoSyncConfidence: Number.isFinite(version.videoSyncConfidence) ? version.videoSyncConfidence : null,
    videoFileName: version.videoFileName || '',
    videoAnnotations: Array.isArray(version.videoAnnotations) ? version.videoAnnotations : [],
  }
}

function normalizeRoutine(routine = {}, index = 0) {
  const versions = Array.isArray(routine.choreographyVersions) && routine.choreographyVersions.length
    ? routine.choreographyVersions.map((version, versionIndex) => normalizeVersion(version, versionIndex))
    : [normalizeVersion({}, 0)]

  return {
    ...routine,
    id: routine.id || `routine-${Date.now()}-${index}`,
    choreographyVersions: versions,
  }
}

function normalizeSession(session = {}) {
  return {
    ...session,
    type: session.type || 'practice',
    status: session.status || (session.completedAt ? 'completed' : 'scheduled'),
    routineId: session.routineId || null,
    disciplineId: session.disciplineId || null,
    choreographyVersionId: session.choreographyVersionId || null,
    rehearsalVideoKey: session.rehearsalVideoKey || '',
    rehearsalVideoName: session.rehearsalVideoName || '',
    scheduledAt: session.scheduledAt || session.date || new Date().toISOString().split('T')[0],
    completedAt: session.completedAt || null,
    islaReflection: session.islaReflection || { feeling: '', note: '', goals: [] },
  }
}

function mergeStateWithDefaults(inputState) {
  const base = { ...defaultState, ...(inputState || {}) }
  return {
    ...base,
    settings: { ...defaultState.settings, ...(base.settings || {}) },
    islaProfile: { ...defaultState.islaProfile, ...(base.islaProfile || {}) },
    disciplines: base.disciplines?.length ? base.disciplines : defaultState.disciplines,
    routines: (base.routines || []).map((routine, index) => normalizeRoutine(routine, index)),
    shows: base.shows || [],
    sessions: (base.sessions || []).map(normalizeSession),
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
        label: 'Original',
        createdAt: new Date().toISOString(),
        musicUrl: oldChoreo.musicUrl || '',
        musicFileName: oldChoreo.musicFileName || '',
        duration: oldChoreo.duration || 0,
        songInstructions: oldChoreo.songInstructions || [],
        cues: oldChoreo.cues || [],
        videoSyncOffset: oldChoreo.videoSyncOffset || 0,
      }],
      practiceVideos: [],
    }
    migrated.routines = [routine, ...(migrated.routines || [])]
  }

  // Convert old sessions — add routineId/disciplineId fields
  if (inputState.sessions) {
    migrated.sessions = inputState.sessions.map(s => normalizeSession({
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

function getLocalStateKey(userId) {
  return `dance-tracker-state:${userId}`
}

// ============ REDUCER ============
function appReducer(state, action) {
  switch (action.type) {
    // ---- Sessions ----
    case "ADD_SESSION":
      return { ...state, sessions: [...state.sessions, normalizeSession(action.payload)] }

    case "SCHEDULE_REHEARSAL":
      return {
        ...state,
        sessions: [...state.sessions, normalizeSession({
          ...action.payload,
          type: 'practice',
          status: 'scheduled',
        })],
      }

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

    case "SET_REHEARSAL_VERSION":
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.payload.sessionId
            ? { ...session, choreographyVersionId: action.payload.choreographyVersionId || null }
            : session
        ),
      }

    case "COMPLETE_REHEARSAL":
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.payload.sessionId
            ? {
                ...session,
                status: 'completed',
                completedAt: action.payload.completedAt || new Date().toISOString(),
              }
            : session
        ),
      }

    case "ATTACH_REHEARSAL_VIDEO":
      return {
        ...state,
        sessions: state.sessions.map((session) =>
          session.id === action.payload.sessionId
            ? {
                ...session,
                rehearsalVideoKey: action.payload.rehearsalVideoKey || session.rehearsalVideoKey || '',
                rehearsalVideoName: action.payload.rehearsalVideoName || session.rehearsalVideoName || '',
                status: 'completed',
                completedAt: session.completedAt || new Date().toISOString(),
              }
            : session
        ),
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
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig)
  const [authSession, setAuthSession] = useState(null)
  const [authUser, setAuthUser] = useState(null)

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

  const [state, dispatch] = useReducer(appReducer, defaultState)

  useEffect(() => {
    let mounted = true

    if (!hasSupabaseConfig || !supabase) {
      setFileStorageUserScope(null)
      setAuthSession(null)
      setAuthUser(null)
      setAuthLoading(false)
      return () => {
        mounted = false
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const session = data?.session || null
      setAuthSession(session)
      setAuthUser(session?.user || null)
      setFileStorageUserScope(session?.user?.id || null)
      setAuthLoading(false)
    }).catch(() => {
      if (!mounted) return
      setFileStorageUserScope(null)
      setAuthSession(null)
      setAuthUser(null)
      setAuthLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthSession(session || null)
      setAuthUser(session?.user || null)
      setFileStorageUserScope(session?.user?.id || null)
    })

    return () => {
      mounted = false
      sub?.subscription?.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (authLoading) return

    let cancelled = false

    async function hydrateState() {
      if (hasSupabaseConfig && !authUser?.id) {
        dispatch({ type: 'RESET_STATE' })
        setIsLoading(false)
        return
      }

      setIsLoading(true)

      if (authUser?.id) {
        try {
          const saved = localStorage.getItem(getLocalStateKey(authUser.id))
          if (saved) {
            const parsed = JSON.parse(saved)
            if (!cancelled) {
              dispatch({ type: 'IMPORT_STATE', payload: mergeStateWithDefaults(migrateOldState(parsed)) })
            }
          }
        } catch (e) {
          console.warn('Failed to load state from localStorage:', e)
        }

        try {
          const payload = await fetchStateFromBackend()
          if (cancelled) return

          if (payload?.source === 'dance' && payload?.danceData?.state_data) {
            dispatch({ type: 'IMPORT_STATE', payload: stateFromDanceRow(payload.danceData) })
          }
        } catch (err) {
          console.warn('Backend state fetch unavailable; using local state only:', err)
        }
      }

      if (!cancelled) setIsLoading(false)
    }

    hydrateState()
    return () => {
      cancelled = true
    }
  }, [authLoading, authUser?.id])

  // Persist to localStorage and backend on every state change
  useEffect(() => {
    if (isLoading) return // Don't save while initially loading
    if (hasSupabaseConfig && !authUser?.id) return

    try {
      if (authUser?.id) {
        localStorage.setItem(getLocalStateKey(authUser.id), JSON.stringify(state))
      }
    } catch (e) {
      console.warn("Failed to save state to localStorage:", e)
    }

    // Debounce backend saves to avoid too many requests
    const saveToBackend = async () => {
      if (!authUser?.id) return
      try {
        await saveStateToBackend(state)
      } catch (err) {
        console.warn('Backend state save failed; local save still kept:', err)
      }
    }

    const timeoutId = setTimeout(saveToBackend, 1000) // 1 second debounce
    return () => clearTimeout(timeoutId)
  }, [state, isLoading, authUser?.id])

  const getMagicLinkRedirectUrl = () => {
    const explicitRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL
    if (explicitRedirect) return explicitRedirect
    if (typeof window === 'undefined') return undefined

    const basePath = import.meta.env.BASE_URL || '/'
    return new URL(basePath, window.location.origin).toString()
  }

  // Check whether a user with this email already exists.
  // Uses signInWithOtp with shouldCreateUser:false — if it succeeds the user
  // is known; if it errors out the email is new.
  const checkUserExists = async (email) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: getMagicLinkRedirectUrl() },
    })
    // Supabase returns an error when the user doesn't exist and shouldCreateUser is false
    if (error) return false
    return true
  }

  // Login — existing user, just send magic link
  const signInWithMagicLink = async (email) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { shouldCreateUser: false, emailRedirectTo: getMagicLinkRedirectUrl() },
    })
    if (error) throw error
    return true
  }

  const verifyEmailOtp = async (email, token) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    const trimmedToken = String(token || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')
    if (!trimmedToken) throw new Error('Code is required.')

    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedToken,
      type: 'email',
    })
    if (error) throw error
    return true
  }

  // Sign-up — create user with metadata then send magic link
  const signUpWithMagicLink = async (email, metadata) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')

    const opts = { emailRedirectTo: getMagicLinkRedirectUrl() }
    if (metadata) opts.data = metadata

    const { error } = await supabase.auth.signInWithOtp({
      email: trimmedEmail,
      options: { ...opts, shouldCreateUser: true },
    })
    if (error) throw error
    return true
  }

  const signOut = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  // Check for new sticker unlocks on state changes
  useEffect(() => {
    const newStickers = checkForNewStickers(state)
    if (newStickers.length > 0) {
      dispatch({ type: "ADD_STICKERS", payload: newStickers })
    }
  }, [state])

  return (
    <AppContext.Provider value={{
      state,
      dispatch,
      isLoading,
      isAdmin,
      unlockAdmin,
      lockAdmin,
      resetAdminTimer,
      authLoading,
      authSession,
      authUser,
      isAuthenticated: Boolean(authUser),
      hasSupabaseAuth: hasSupabaseConfig,
      signInWithMagicLink,
      signUpWithMagicLink,
      verifyEmailOtp,
      checkUserExists,
      signOut,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error("useApp must be used within AppProvider")
  return ctx
}
