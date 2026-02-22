import { createContext, useContext, useReducer, useEffect, useState, useCallback } from 'react'
import { defaultState } from '../data/defaultState'
import { checkForNewStickers } from '../utils/milestones'
import { fetchStateFromBackend, saveStateToBackend } from '../utils/backendApi'
import { setFileStorageUserScope } from '../utils/fileStorage'
import { hasSupabaseConfig, supabase } from '../utils/supabaseClient'
import {
  fetchUserProfile,
  upsertUserProfile,
  fetchKidProfiles,
  createKidProfile as apiCreateKidProfile,
  updateKidProfile as apiUpdateKidProfile,
  deleteKidProfile as apiDeleteKidProfile,
  fetchMyShares,
  fetchIncomingShares,
  createShare as apiCreateShare,
  acceptShare as apiAcceptShare,
  acceptShareByToken as apiAcceptShareByToken,
  revokeShare as apiRevokeShare,
  deleteShare as apiDeleteShare,
  fetchSharedDance,
  fetchSharedOwnerProfile,
  fetchPartnerKidProfiles as apiFetchPartnerKids,
  updateSharePartnerKids as apiUpdateSharePartnerKids,
  fetchMyGuardians,
  fetchIncomingGuardianInvites,
  createGuardianInvite as apiCreateGuardian,
  acceptGuardianInvite as apiAcceptGuardian,
  acceptGuardianByToken as apiAcceptGuardianByToken,
  updateGuardianKids as apiUpdateGuardianKids,
  revokeGuardian as apiRevokeGuardian,
  deleteGuardian as apiDeleteGuardian,
  fetchGuardianOwnerProfile,
  fetchGuardianKidProfiles,
} from '../utils/profileApi'

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
    kidProfileIds: Array.isArray(routine.kidProfileIds) ? routine.kidProfileIds : [],
    choreographyVersions: versions,
  }
}

function normalizeShow(show = {}) {
  const normalizedEntries = Array.isArray(show.entries)
    ? show.entries.map((entry = {}, index) => ({
        ...entry,
        id: entry.id || `entry-${Date.now()}-${index}`,
        routineId: entry.routineId || '',
        scheduledDate: entry.scheduledDate || show.startDate || show.date || '',
        scheduledTime: entry.scheduledTime || '',
        place: entry.place ?? null,
        qualified: Boolean(entry.qualified),
        qualifiedForEventId: entry.qualifiedForEventId || '',
        notes: entry.notes || '',
      }))
    : []

  return {
    ...show,
    id: show.id || `show-${Date.now()}`,
    name: show.name || 'Untitled Event',
    date: show.date || show.startDate || new Date().toISOString().split('T')[0],
    startDate: show.startDate || show.date || new Date().toISOString().split('T')[0],
    endDate: show.endDate || show.startDate || show.date || '',
    venue: show.venue || '',
    eventType: show.eventType || 'show',
    competitionOrg: show.competitionOrg || '',
    region: show.region || '',
    entries: normalizedEntries,
    routineIds: Array.isArray(show.routineIds) ? show.routineIds : [],
    scrapbookEntries: Array.isArray(show.scrapbookEntries) ? show.scrapbookEntries : [],
    place: show.place ?? null,
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
    dancerReflection: session.dancerReflection || { feeling: '', note: '', goals: [] },
    videoAnnotations: Array.isArray(session.videoAnnotations) ? session.videoAnnotations : [],
  }
}

function mergeStateWithDefaults(inputState) {
  const base = { ...defaultState, ...(inputState || {}) }
  return {
    ...base,
    settings: { ...defaultState.settings, ...(base.settings || {}) },
    dancerProfile: { ...defaultState.dancerProfile, ...(base.dancerProfile || {}) },
    disciplines: base.disciplines?.length ? base.disciplines : defaultState.disciplines,
    routines: (base.routines || []).map((routine, index) => normalizeRoutine(routine, index)),
    shows: (base.shows || []).map((show) => normalizeShow(show)),
    sessions: (base.sessions || []).map(normalizeSession),
    stickers: base.stickers || [],
    practiceLog: base.practiceLog || [],
  }
}

// Migrate old state shape to new model
function migrateOldState(inputState) {
  if (!inputState) return inputState
  const migrated = { ...inputState }

  // One-time key migration: legacy isla* -> dancer*
  if (!migrated.dancerProfile && migrated.islaProfile) {
    migrated.dancerProfile = { ...migrated.islaProfile }
  }
  delete migrated.islaProfile

  if (Array.isArray(migrated.sessions)) {
    migrated.sessions = migrated.sessions.map((session) => {
      const nextSession = { ...session }
      if (!nextSession.dancerReflection && nextSession.islaReflection) {
        nextSession.dancerReflection = { ...nextSession.islaReflection }
      }
      delete nextSession.islaReflection

      if (!nextSession.dancerNote && nextSession.islaNote) nextSession.dancerNote = nextSession.islaNote
      if (!nextSession.dancerFeeling && nextSession.islaFeeling) nextSession.dancerFeeling = nextSession.islaFeeling
      delete nextSession.islaNote
      delete nextSession.islaFeeling
      return nextSession
    })
  }

  if (Array.isArray(migrated.routines)) {
    migrated.routines = migrated.routines.map((routine) => {
      if (!Array.isArray(routine.practiceVideos)) return routine
      return {
        ...routine,
        practiceVideos: routine.practiceVideos.map((video) => {
          const nextVideo = { ...video }
          if (!nextVideo.dancerNote && nextVideo.islaNote) nextVideo.dancerNote = nextVideo.islaNote
          if (!nextVideo.dancerFeeling && nextVideo.islaFeeling) nextVideo.dancerFeeling = nextVideo.islaFeeling
          delete nextVideo.islaNote
          delete nextVideo.islaFeeling
          return nextVideo
        }),
      }
    })
  }

  if (Array.isArray(migrated.shows)) {
    migrated.shows = migrated.shows.map((show) => {
      if (!Array.isArray(show.scrapbookEntries)) return show
      return {
        ...show,
        scrapbookEntries: show.scrapbookEntries.map((entry) => {
          if (entry?.author !== 'isla') return entry
          return { ...entry, author: 'dancer' }
        }),
      }
    })
  }

  // Detect old shape: has 'chunks', 'choreography', or 'rhythmScores'
  const hasOldShape = inputState.chunks || inputState.choreography || inputState.rhythmScores != null
  if (!hasOldShape) return migrated

  // Convert old choreography + chunks into a routine
  if (inputState.choreography && inputState.choreography.musicUrl) {
    const oldChoreo = inputState.choreography
    const routine = {
      id: `routine-migrated-${Date.now()}`,
      name: inputState.settings?.danceName || 'Migrated Routine',
      type: 'practice',
      formation: 'solo',
      dancers: [inputState.settings?.dancers?.[0] || 'My Dancing'],
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
      dancerReflection: s.dancerReflection || { feeling: '', note: '', goals: [] },
    }))
  }

  // Map old settings
  if (inputState.settings) {
    migrated.settings = {
      dancerName: inputState.settings.dancers?.[0] || inputState.settings.dancerName || 'My Dancing',
      themeColor: inputState.settings.themeColor || '#a855f7',
      promptLeadMs: inputState.settings.promptLeadMs || 200,
    }
  }

  // Ensure disciplines exist
  if (!migrated.disciplines || migrated.disciplines.length === 0) {
    migrated.disciplines = defaultState.disciplines
  }

  // Ensure dancerProfile exists
  if (!migrated.dancerProfile) {
    migrated.dancerProfile = defaultState.dancerProfile
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
      dancerName: row?.dancers?.[0] ?? migrated?.settings?.dancerName ?? 'My Dancing',
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

    // ---- Dancer self-reflection on a session ----
    case "SET_SESSION_REFLECTION":
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.id === action.payload.sessionId
            ? { ...s, dancerReflection: { ...s.dancerReflection, ...action.payload.reflection } }
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

    // ---- Shows / Events ----
    case "ADD_SHOW":
      return { ...state, shows: [...state.shows, normalizeShow(action.payload)] }

    case "UPDATE_SHOW":
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === action.payload.id ? { ...s, ...action.payload } : s
        ),
      }

    case "DELETE_SHOW":
      return { ...state, shows: state.shows.filter((s) => s.id !== action.payload) }

    // ---- Event entries (routine performances within a show/event) ----
    case "ADD_EVENT_ENTRY": {
      const { showId, entry } = action.payload
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === showId
            ? {
                ...s,
                entries: [...(s.entries || []), entry],
                routineIds: (s.routineIds || []).includes(entry.routineId)
                  ? s.routineIds
                  : [...(s.routineIds || []), entry.routineId],
              }
            : s
        ),
      }
    }

    case "UPDATE_EVENT_ENTRY": {
      const { showId, entryId, updates } = action.payload
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === showId
            ? {
                ...s,
                entries: (s.entries || []).map((e) =>
                  e.id === entryId ? { ...e, ...updates } : e
                ),
              }
            : s
        ),
      }
    }

    case "DELETE_EVENT_ENTRY": {
      const { showId: delShowId, entryId: delEntryId } = action.payload
      return {
        ...state,
        shows: state.shows.map((s) =>
          s.id === delShowId
            ? { ...s, entries: (s.entries || []).filter((e) => e.id !== delEntryId) }
            : s
        ),
      }
    }

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

    // ---- Dancer profile ----
    case "UPDATE_DANCER_PROFILE":
      return { ...state, dancerProfile: { ...state.dancerProfile, ...action.payload } }

    case "ADD_GOAL":
      return {
        ...state,
        dancerProfile: {
          ...state.dancerProfile,
          goals: [...state.dancerProfile.goals, action.payload],
        },
      }

    case "COMPLETE_GOAL":
      return {
        ...state,
        dancerProfile: {
          ...state.dancerProfile,
          goals: state.dancerProfile.goals.map((g) =>
            g.id === action.payload
              ? { ...g, completedDate: new Date().toISOString().split('T')[0] }
              : g
          ),
        },
      }

    case "SET_CURRENT_FOCUS":
      return {
        ...state,
        dancerProfile: { ...state.dancerProfile, currentFocus: action.payload },
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
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig)
  const [authSession, setAuthSession] = useState(null)
  const [authUser, setAuthUser] = useState(null)

  // Profile state
  const [userProfile, setUserProfile] = useState(null)       // { id, display_name, avatar_emoji, ... }
  const [kidProfiles, setKidProfiles] = useState([])          // [{ id, display_name, avatar_emoji, ... }]
  // activeProfile: { type: 'adult' } | { type: 'kid', kidId: '...' }
  const [activeProfile, setActiveProfile] = useState({ type: 'adult' })
  const isKidMode = activeProfile.type === 'kid'
  const activeKidProfile = isKidMode ? kidProfiles.find(k => k.id === activeProfile.kidId) : null

  // Admin = logged-in parent in adult mode (no separate PIN/timeout needed)
  const isAdmin = Boolean(authUser) && !isKidMode

  // The display name for whoever is currently active
  const activeProfileName = isKidMode
    ? (activeKidProfile?.display_name || 'Dancer')
    : (userProfile?.display_name || 'Parent')
  const activeProfileEmoji = isKidMode
    ? (activeKidProfile?.avatar_emoji || '💃')
    : (userProfile?.avatar_emoji || '👤')

  // Share state
  const [outgoingShares, setOutgoingShares] = useState([])
  const [incomingShares, setIncomingShares] = useState([])
  const [sharedDances, setSharedDances] = useState([])       // [{ share, dance, ownerProfile }]

  // Guardian state
  const [outgoingGuardians, setOutgoingGuardians] = useState([])   // invites I sent
  const [incomingGuardians, setIncomingGuardians] = useState([])   // invites I received
  const [guardianFamilies, setGuardianFamilies] = useState([])     // [{ guardian, ownerProfile, kids }]

  // Legacy admin helpers — kept for compatibility but simplified
  const unlockAdmin = () => true
  const lockAdmin = () => {}
  const resetAdminTimer = () => {}

  const [state, dispatch] = useReducer(appReducer, defaultState)

  // ============ PROFILE SWITCHING ============
  // Switch to a kid profile — no auth required
  const switchToKidProfile = useCallback((kidId) => {
    setActiveProfile({ type: 'kid', kidId })
  }, [])

  // Switch back to adult — requires PIN re-auth (prevents kids from accessing parent view)
  const switchToAdultProfile = useCallback((pin) => {
    if (pin !== ADMIN_PIN) return false
    setActiveProfile({ type: 'adult' })
    return true
  }, [])

  // ============ PROFILE MANAGEMENT ============
  const loadProfiles = useCallback(async () => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const [profile, kids] = await Promise.all([
        fetchUserProfile(),
        fetchKidProfiles(),
      ])
      // Auto-create user_profile if it doesn't exist yet
      if (!profile) {
        const metaName = authUser.user_metadata?.displayName
          || authUser.user_metadata?.display_name
          || authUser.email?.split('@')[0]
          || ''
        const newProfile = await upsertUserProfile({
          displayName: metaName,
          avatarEmoji: '👤',
        })
        setUserProfile(newProfile)
      } else {
        setUserProfile(profile)
      }
      setKidProfiles(kids || [])
      console.log('[loadProfiles] loaded', { profile, kidsCount: (kids || []).length })
    } catch (err) {
      console.error('Failed to load profiles:', err)
    }
  }, [authUser])

  const saveUserProfile = useCallback(async ({ displayName, avatarEmoji }) => {
    const profile = await upsertUserProfile({ displayName, avatarEmoji })
    setUserProfile(profile)
    return profile
  }, [])

  const addKidProfile = useCallback(async ({ displayName, avatarEmoji }) => {
    const kid = await apiCreateKidProfile({ displayName, avatarEmoji })
    setKidProfiles(prev => [...prev, kid])
    return kid
  }, [])

  const editKidProfile = useCallback(async (kidId, updates) => {
    const kid = await apiUpdateKidProfile(kidId, updates)
    setKidProfiles(prev => prev.map(k => k.id === kidId ? kid : k))
    return kid
  }, [])

  const removeKidProfile = useCallback(async (kidId) => {
    await apiDeleteKidProfile(kidId)
    setKidProfiles(prev => prev.filter(k => k.id !== kidId))
    // If currently viewing this kid, switch back to adult
    if (activeProfile.type === 'kid' && activeProfile.kidId === kidId) {
      setActiveProfile({ type: 'adult' })
    }
  }, [activeProfile])

  // ============ SHARING MANAGEMENT ============
  const loadShares = useCallback(async () => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const [outgoing, incoming] = await Promise.all([
        fetchMyShares(),
        fetchIncomingShares(),
      ])
      setOutgoingShares(outgoing || [])
      setIncomingShares(incoming || [])

      // For accepted incoming shares, load the dance data + owner profile
      const accepted = (incoming || []).filter(s => s.status === 'accepted')
      const dances = await Promise.all(
        accepted.map(async (share) => {
          try {
            const [dance, ownerProfile] = await Promise.all([
              fetchSharedDance(share.dance_id),
              fetchSharedOwnerProfile(share.owner_user_id),
            ])
            return { share, dance, ownerProfile }
          } catch {
            return null
          }
        })
      )
      setSharedDances(dances.filter(Boolean))
    } catch (err) {
      console.warn('Failed to load shares:', err)
    }
  }, [authUser?.id])

  const createShareInvite = useCallback(async ({ danceId, routineId }) => {
    const share = await apiCreateShare({ danceId, routineId })
    setOutgoingShares(prev => [share, ...prev])
    return share
  }, [])

  const acceptShareInvite = useCallback(async (shareId) => {
    const share = await apiAcceptShare(shareId)
    setIncomingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...share } : s))
    // Reload to get dance data
    await loadShares()
    return share
  }, [loadShares])

  const revokeShareInvite = useCallback(async (shareId) => {
    const share = await apiRevokeShare(shareId)
    setOutgoingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...share } : s))
    return share
  }, [])

  const removeShare = useCallback(async (shareId) => {
    await apiDeleteShare(shareId)
    setOutgoingShares(prev => prev.filter(s => s.id !== shareId))
  }, [])

  const acceptShareByToken = useCallback(async (token) => {
    const share = await apiAcceptShareByToken(token)
    await loadShares()
    return share
  }, [loadShares])

  const fetchPartnerKids = useCallback(async (partnerUserId) => {
    return apiFetchPartnerKids(partnerUserId)
  }, [])

  const updateSharePartnerKids = useCallback(async (shareId, kidIds) => {
    const updated = await apiUpdateSharePartnerKids(shareId, kidIds)
    setOutgoingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...updated } : s))
    return updated
  }, [])

  // ============ GUARDIAN MANAGEMENT ============
  const loadGuardians = useCallback(async () => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const [outgoing, incoming] = await Promise.all([
        fetchMyGuardians(),
        fetchIncomingGuardianInvites(),
      ])
      setOutgoingGuardians(outgoing || [])
      setIncomingGuardians(incoming || [])

      // For accepted incoming guardian invites, load the owner profile + assigned kids
      const accepted = (incoming || []).filter(g => g.status === 'accepted')
      const families = await Promise.all(
        accepted.map(async (guardian) => {
          try {
            const [ownerProfile, kids] = await Promise.all([
              fetchGuardianOwnerProfile(guardian.owner_user_id),
              guardian.kid_profile_ids?.length
                ? fetchGuardianKidProfiles(guardian.owner_user_id, guardian.kid_profile_ids)
                : Promise.resolve([]),
            ])
            return { guardian, ownerProfile, kids }
          } catch {
            return null
          }
        })
      )
      setGuardianFamilies(families.filter(Boolean))
    } catch (err) {
      console.warn('Failed to load guardians:', err)
    }
  }, [authUser?.id])

  const createGuardianInvite = useCallback(async ({ kidProfileIds, role }) => {
    const guardian = await apiCreateGuardian({ kidProfileIds, role })
    setOutgoingGuardians(prev => [guardian, ...prev])
    return guardian
  }, [])

  const acceptGuardianInvite = useCallback(async (guardianId) => {
    const guardian = await apiAcceptGuardian(guardianId)
    setIncomingGuardians(prev => prev.map(g => g.id === guardianId ? { ...g, ...guardian } : g))
    await loadGuardians()
    return guardian
  }, [loadGuardians])

  const updateGuardianKids = useCallback(async (guardianId, kidIds) => {
    const updated = await apiUpdateGuardianKids(guardianId, kidIds)
    setOutgoingGuardians(prev => prev.map(g => g.id === guardianId ? { ...g, ...updated } : g))
    return updated
  }, [])

  const revokeGuardianInvite = useCallback(async (guardianId) => {
    const updated = await apiRevokeGuardian(guardianId)
    setOutgoingGuardians(prev => prev.map(g => g.id === guardianId ? { ...g, ...updated } : g))
    return updated
  }, [])

  const removeGuardian = useCallback(async (guardianId) => {
    await apiDeleteGuardian(guardianId)
    setOutgoingGuardians(prev => prev.filter(g => g.id !== guardianId))
  }, [])

  const acceptGuardianByToken = useCallback(async (token) => {
    const guardian = await apiAcceptGuardianByToken(token)
    await loadGuardians()
    return guardian
  }, [loadGuardians])

  // Load profiles & shares & guardians when user logs in
  useEffect(() => {
    if (authLoading || !authUser?.id) return
    loadProfiles()
    loadShares()
    loadGuardians()
  }, [authLoading, authUser?.id, loadProfiles, loadShares, loadGuardians])

  // ============ INVITE TOKEN HANDLING ============
  // Check for ?invite=TOKEN in URL and auto-accept guardian invite after login
  useEffect(() => {
    if (authLoading || !authUser?.id) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')
    if (!token) return

    // Strip the token from the URL so it doesn't get reused
    const url = new URL(window.location)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)

    // Accept the invite
    ;(async () => {
      try {
        await acceptGuardianByToken(token)
        alert('Guardian invite accepted!')
      } catch (err) {
        console.warn('Failed to accept guardian invite:', err)
        alert(err?.message || 'Could not accept invite. It may have expired or already been used.')
      }
    })()
  }, [authLoading, authUser?.id, acceptGuardianByToken])

  // Check for ?share=TOKEN in URL and auto-accept share invite after login
  useEffect(() => {
    if (authLoading || !authUser?.id) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('share')
    if (!token) return

    const url = new URL(window.location)
    url.searchParams.delete('share')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)

    ;(async () => {
      try {
        await acceptShareByToken(token)
        alert('Share invite accepted! You now have access to the shared dance.')
        // Redirect to dashboard where shared dances are visible
        window.location.replace('/')
      } catch (err) {
        console.warn('Failed to accept share invite:', err)
        alert(err?.message || 'Could not accept share invite. It may have expired or already been used.')
      }
    })()
  }, [authLoading, authUser?.id, acceptShareByToken])

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

  const verifyEmailOtp = async (email, token, otpType = 'email') => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    const trimmedToken = String(token || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')
    if (!trimmedToken) throw new Error('Code is required.')

    // Try the requested type first, fall back to the other if it fails
    const { error } = await supabase.auth.verifyOtp({
      email: trimmedEmail,
      token: trimmedToken,
      type: otpType,
    })
    if (error) {
      // Supabase uses different OTP types for login vs signup —
      // if one fails, try the other before giving up
      const fallbackType = otpType === 'email' ? 'signup' : 'email'
      const { error: fallbackError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedToken,
        type: fallbackType,
      })
      if (fallbackError) throw error // throw original error
    }
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

      // Profiles
      userProfile,
      kidProfiles,
      activeProfile,
      isKidMode,
      activeKidProfile,
      activeProfileName,
      activeProfileEmoji,
      switchToKidProfile,
      switchToAdultProfile,
      saveUserProfile,
      addKidProfile,
      editKidProfile,
      removeKidProfile,
      loadProfiles,

      // Sharing
      outgoingShares,
      incomingShares,
      sharedDances,
      createShareInvite,
      acceptShareInvite,
      acceptShareByToken,
      revokeShareInvite,
      removeShare,
      loadShares,
      fetchPartnerKids,
      updateSharePartnerKids,

      // Guardians
      outgoingGuardians,
      incomingGuardians,
      guardianFamilies,
      createGuardianInvite,
      acceptGuardianInvite,
      acceptGuardianByToken,
      updateGuardianKids,
      revokeGuardianInvite,
      removeGuardian,
      loadGuardians,
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
