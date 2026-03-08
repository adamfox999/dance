import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { defaultState } from '../data/defaultState'
import { buildSessionLivePath } from '../utils/helpers'
import { checkForNewStickers } from '../utils/milestones'
import { setFileStorageUserScope } from '../utils/fileStorage'
import { hasSupabaseConfig, supabase } from '../utils/supabaseClient'
import { setDanceOwnerId as setBackendDanceOwnerId } from '../utils/backendApi'
import { notify } from '../utils/notify'
import {
  initializeDanceData,
  setDanceOwnerId as setDanceDataOwnerId,
  fetchDisciplinesWithChildren,
  fetchRoutinesWithChildren,
  fetchSessions          as apiFetchSessions,
  fetchEventsWithChildren,
  fetchStickers          as apiFetchStickers,
  fetchPracticeLog       as apiFetchPracticeLog,
  fetchDancerProfile     as apiFetchDancerProfile,
  fetchDancerGoals       as apiFetchDancerGoals,
  fetchDancerDisciplines as apiFetchDancerDisciplines,
  fetchDancerJourneyEvents as apiFetchDancerJourneyEvents,
  fetchSettings          as apiFetchSettings,
  createDiscipline       as apiCreateDiscipline,
  updateDiscipline       as apiUpdateDiscipline,
  deleteDiscipline       as apiDeleteDiscipline,
  createDisciplineElement as apiCreateDisciplineElement,
  updateDisciplineElement as apiUpdateDisciplineElement,
  deleteDisciplineElement as apiDeleteDisciplineElement,
  createRoutine          as apiCreateRoutine,
  updateRoutine          as apiUpdateRoutine,
  deleteRoutine          as apiDeleteRoutine,
  createChoreographyVersion as apiCreateChoreographyVersion,
  updateChoreographyVersion as apiUpdateChoreographyVersion,
  createPracticeVideo    as apiCreatePracticeVideo,
  createSession          as apiCreateSession,
  updateSession          as apiUpdateSession,
  fetchSessionFeedback   as apiFetchSessionFeedback,
  upsertSessionFeedback  as apiUpsertSessionFeedback,
  deleteSession          as apiDeleteSession,
  fetchSessionPracticeReflection as apiFetchSessionPracticeReflection,
  fetchRoutineLivingGoals as apiFetchRoutineLivingGoals,
  upsertSessionPracticeReflection as apiUpsertSessionPracticeReflection,
  savePracticeGoalCheckins as apiSavePracticeGoalCheckins,
  createEvent            as apiCreateEvent,
  updateEvent            as apiUpdateEvent,
  deleteEvent            as apiDeleteEvent,
  createEventEntry       as apiCreateEventEntry,
  updateEventEntry       as apiUpdateEventEntry,
  deleteEventEntry       as apiDeleteEventEntry,
  createScrapbookEntry   as apiCreateScrapbookEntry,
  updateScrapbookEntry   as apiUpdateScrapbookEntry,
  deleteScrapbookEntry   as apiDeleteScrapbookEntry,
  createSticker          as apiCreateSticker,
  createStickers         as apiCreateStickers,
  logPractice            as apiLogPractice,
  upsertDancerProfile    as apiUpsertDancerProfile,
  createDancerGoal       as apiCreateDancerGoal,
  updateDancerGoal       as apiUpdateDancerGoal,
  createDancerDiscipline as apiCreateDancerDiscipline,
  updateDancerDiscipline as apiUpdateDancerDiscipline,
  deleteDancerDiscipline as apiDeleteDancerDiscipline,
  createDancerJourneyEvent as apiCreateDancerJourneyEvent,
  updateDancerJourneyEvent as apiUpdateDancerJourneyEvent,
  deleteDancerJourneyEvent as apiDeleteDancerJourneyEvent,
  updateSettings         as apiUpdateSettings,
} from '../utils/danceApi'
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
  fetchMyFamilyUnits,
  fetchGuardianFamilyUnits,
  createFamilyUnit as apiCreateFamilyUnit,
  updateFamilyUnit as apiUpdateFamilyUnit,
  deleteFamilyUnit as apiDeleteFamilyUnit,
} from '../utils/profileApi'

const AppContext = createContext(null)
const ACTIVE_PROFILE_STORAGE_KEY = 'dance-tracker:active-profile'
const PARENT_PIN_STORAGE_PREFIX = 'dance-tracker:parent-pin:'
const SESSION_UPLOAD_REMINDER_PREFIX = 'dance-tracker:session-upload-reminder:'
const SESSION_UPLOAD_PERMISSION_ASKED_KEY = 'dance-tracker:session-upload-reminder-permission-asked'
const APP_SNAPSHOT_STORAGE_PREFIX = 'dance-tracker:app-snapshot:v1:'

function getAppSnapshotStorageKey(userId) {
  if (!userId) return ''
  return `${APP_SNAPSHOT_STORAGE_PREFIX}${userId}`
}

function readAppSnapshot(userId) {
  if (!userId || typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(getAppSnapshotStorageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.data || typeof parsed.data !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

function writeAppSnapshot(userId, data) {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.setItem(getAppSnapshotStorageKey(userId), JSON.stringify({
      version: 1,
      savedAt: new Date().toISOString(),
      data,
    }))
  } catch {
    // Ignore storage failures
  }
}

function toSessionDateString(session = {}) {
  const directDate = typeof session.date === 'string' ? session.date.trim() : ''
  if (directDate) return directDate.slice(0, 10)
  const scheduledAt = typeof session.scheduledAt === 'string' ? session.scheduledAt.trim() : ''
  if (scheduledAt) return scheduledAt.slice(0, 10)
  const completedAt = typeof session.completedAt === 'string' ? session.completedAt.trim() : ''
  if (completedAt) return completedAt.slice(0, 10)
  return ''
}

function toLocalDateTimeMs(dateStr, timeStr = '') {
  if (!dateStr) return null
  const [yearRaw, monthRaw, dayRaw] = String(dateStr).split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null

  const parsedTime = String(timeStr || '').trim()
  if (!parsedTime) {
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
  }

  const [hourRaw, minuteRaw] = parsedTime.split(':')
  const hours = Number.parseInt(hourRaw, 10)
  const minutes = Number.parseInt(minuteRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
  }

  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime()
}

function hasSessionCompletedWithoutVideo(session = {}) {
  if (!session?.id || session?.rehearsalVideoKey) return false
  if (session?.noVideoTaken) return false
  const now = Date.now()
  if (session.status === 'completed' || session.completedAt) return true

  const dateStr = toSessionDateString(session)
  if (!dateStr) return false

  const endMs = toLocalDateTimeMs(dateStr, session.endTime || '')
  if (Number.isFinite(endMs) && endMs <= now) return true

  const startMs = toLocalDateTimeMs(dateStr, session.startTime || session.time || '')
  if (Number.isFinite(startMs) && startMs + (60 * 60 * 1000) <= now) return true

  const dayStartMs = toLocalDateTimeMs(dateStr, '')
  if (Number.isFinite(dayStartMs)) {
    const todayStart = new Date(new Date().toISOString().slice(0, 10)).getTime()
    if (dayStartMs < todayStart) return true
  }

  return false
}

function normalizeIsoDate(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.length >= 10 ? raw.slice(0, 10) : raw
}

function compareIsoDateStrings(leftValue, rightValue) {
  const left = normalizeIsoDate(leftValue)
  const right = normalizeIsoDate(rightValue)
  if (left && right) return left.localeCompare(right)
  if (left && !right) return -1
  if (!left && right) return 1
  return 0
}

function compareEventEntriesChronological(left = {}, right = {}) {
  const byDate = compareIsoDateStrings(left.scheduledDate, right.scheduledDate)
  if (byDate !== 0) return byDate

  const leftTime = String(left.scheduledTime || '').trim()
  const rightTime = String(right.scheduledTime || '').trim()
  if (leftTime && rightTime && leftTime !== rightTime) return leftTime.localeCompare(rightTime)
  if (leftTime && !rightTime) return -1
  if (!leftTime && rightTime) return 1

  const leftId = String(left.id || '')
  const rightId = String(right.id || '')
  return leftId.localeCompare(rightId)
}

function sortEventEntriesChronological(entries = []) {
  return [...entries].sort(compareEventEntriesChronological)
}

function normalizeEventChronological(event = {}) {
  const sortedEntries = sortEventEntriesChronological(event.entries || [])
  return {
    ...event,
    entries: sortedEntries,
    routineIds: [...new Set(sortedEntries.map((entry) => entry.routineId).filter(Boolean))],
  }
}

function compareEventsChronological(left = {}, right = {}) {
  const byStartDate = compareIsoDateStrings(left.startDate || left.date, right.startDate || right.date)
  if (byStartDate !== 0) return byStartDate

  const leftName = String(left.name || '')
  const rightName = String(right.name || '')
  return leftName.localeCompare(rightName)
}

function sortEventsChronological(eventList = []) {
  return [...eventList]
    .map((eventItem) => normalizeEventChronological(eventItem))
    .sort(compareEventsChronological)
}

function readStoredActiveProfile() {
  if (typeof window === 'undefined') return { type: 'adult' }
  try {
    const raw = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
    if (!raw) return { type: 'adult' }
    const parsed = JSON.parse(raw)
    if (parsed?.type === 'kid' && parsed?.kidId) {
      return { type: 'kid', kidId: parsed.kidId }
    }
  } catch {
    // Ignore invalid storage payloads
  }
  return { type: 'adult' }
}

// ============ PROVIDER ============
export function AppProvider({ children }) {
  const [isLoading, setIsLoading] = useState(true)
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [isUsingCachedData, setIsUsingCachedData] = useState(false)
  const [lastSyncedAt, setLastSyncedAt] = useState(null)
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig)
  const [authSession, setAuthSession] = useState(null)
  const [authUser, setAuthUser] = useState(null)
  const authUserIdRef = useRef(null)
  const lastOfflineNoticeAtRef = useRef(0)
  const connectivityToastReadyRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const blockOfflineMutation = useCallback((actionLabel = 'make changes') => {
    if (isOnline) return false
    const now = Date.now()
    if ((now - lastOfflineNoticeAtRef.current) > 2000) {
      notify(`You're offline. Reconnect to ${actionLabel}.`)
      lastOfflineNoticeAtRef.current = now
    }
    return true
  }, [isOnline])

  useEffect(() => {
    if (!connectivityToastReadyRef.current) {
      connectivityToastReadyRef.current = true
      return
    }
    notify(isOnline ? 'Back online. Syncing latest data…' : 'You are offline. Showing cached data.')
  }, [isOnline])

  useEffect(() => {
    authUserIdRef.current = authUser?.id || null
  }, [authUser?.id])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const keysToDelete = []
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i)
        if (key && key.startsWith(PARENT_PIN_STORAGE_PREFIX)) keysToDelete.push(key)
      }
      keysToDelete.forEach((key) => window.localStorage.removeItem(key))
    } catch {
      // Ignore storage cleanup errors
    }
  }, [authUser?.id])

  const signOutOtherDevices = useCallback(async () => {
    if (!hasSupabaseConfig || !supabase || !authUser?.id) return 0
    const { error } = await supabase.auth.signOut({ scope: 'others' })
    if (error) throw error
    return 0
  }, [authUser?.id])

  // Profile state
  const [userProfile, setUserProfile] = useState(null)
  const [kidProfiles, setKidProfiles] = useState([])
  const [activeProfile, setActiveProfile] = useState(() => readStoredActiveProfile())
  const isKidMode = activeProfile.type === 'kid'

  // Share state
  const [outgoingShares, setOutgoingShares] = useState([])
  const [incomingShares, setIncomingShares] = useState([])
  const [sharedDances, setSharedDances] = useState([])
  const incomingSharesRef = useRef([])

  useEffect(() => {
    incomingSharesRef.current = incomingShares
  }, [incomingShares])

  // Guardian state
  const [outgoingGuardians, setOutgoingGuardians] = useState([])
  const [incomingGuardians, setIncomingGuardians] = useState([])
  const [guardianFamilies, setGuardianFamilies] = useState([])
  const [myFamilyUnitsDB, setMyFamilyUnitsDB] = useState([])
  const [guardianFamilyUnitsDB, setGuardianFamilyUnitsDB] = useState([])
  const [profilesLoaded, setProfilesLoaded] = useState(false)

  // ===== NORMALIZED DANCE DATA =====
  const [disciplines, setDisciplines] = useState(defaultState.disciplines)
  const [routines, setRoutines] = useState([])
  const [sessions, setSessions] = useState([])
  const [events, setEvents] = useState([])
  const [stickers, setStickers] = useState([])
  const [practiceLog, setPracticeLog] = useState([])
  const [dancerProfile, setDancerProfile] = useState({ name: 'My Dancing', currentFocus: null })
  const [dancerGoals, setDancerGoals] = useState([])
  const [dancerDisciplines, setDancerDisciplines] = useState([])
  const [dancerJourneyEvents, setDancerJourneyEvents] = useState([])
  const [settings, setSettingsState] = useState({ dancerName: 'My Dancing', themeColor: '#a855f7', promptLeadMs: 0 })

  // Refs for read-then-write patterns (stable callbacks that need current data)
  const sessionsRef = useRef(sessions)
  const eventsRef = useRef(events)
  const stickersRef = useRef(stickers)

  useEffect(() => {
    sessionsRef.current = sessions
  }, [sessions])

  useEffect(() => {
    eventsRef.current = events
  }, [events])

  useEffect(() => {
    stickersRef.current = stickers
  }, [stickers])

  // Merged kid profiles (own + guardian families)
  const allKidProfiles = (() => {
    const merged = [...kidProfiles]
    const seenIds = new Set(kidProfiles.map(k => k.id))
    for (const fam of guardianFamilies) {
      for (const kid of (fam.kids || [])) {
        if (!seenIds.has(kid.id)) { seenIds.add(kid.id); merged.push(kid) }
      }
    }
    return merged
  })()

  const activeKidProfile = isKidMode ? allKidProfiles.find(k => k.id === activeProfile.kidId) : null

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(ACTIVE_PROFILE_STORAGE_KEY, JSON.stringify({
        ...activeProfile,
        userId: authUser?.id || null,
      }))
    } catch {
      // Ignore localStorage write failures
    }
  }, [activeProfile, authUser?.id])

  useEffect(() => {
    if (!authUser?.id || typeof window === 'undefined') return
    try {
      const raw = window.localStorage.getItem(ACTIVE_PROFILE_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw)
      if (parsed?.userId && parsed.userId !== authUser.id) {
        setActiveProfile({ type: 'adult' })
      }
    } catch {
      // Ignore invalid storage payloads
    }
  }, [authUser?.id])

  useEffect(() => {
    if (activeProfile.type !== 'kid') return
    if (!profilesLoaded) return
    if (allKidProfiles.some((kid) => kid.id === activeProfile.kidId)) return
    setActiveProfile({ type: 'adult' })
  }, [activeProfile, allKidProfiles, profilesLoaded])

  const isAdmin = Boolean(authUser) && !isKidMode
  const activeProfileName = isKidMode
    ? (activeKidProfile?.display_name || 'Dancer')
    : (userProfile?.display_name || 'Parent')
  const activeProfileEmoji = isKidMode
    ? (activeKidProfile?.avatar_emoji || '💃')
    : (userProfile?.avatar_emoji || '👤')

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!isAdmin) return
    if (!Array.isArray(sessions) || !sessions.length) return

    const routineNameById = new Map((routines || []).map((routine) => [routine.id, routine.name || 'Routine']))
    const dueSessions = sessions.filter((session) => hasSessionCompletedWithoutVideo(session))
    if (!dueSessions.length) return

    const canNotify = typeof Notification !== 'undefined'
    if (canNotify && Notification.permission === 'default') {
      try {
        const asked = window.localStorage.getItem(SESSION_UPLOAD_PERMISSION_ASKED_KEY)
        if (!asked) {
          window.localStorage.setItem(SESSION_UPLOAD_PERMISSION_ASKED_KEY, '1')
          Notification.requestPermission().catch(() => {})
        }
      } catch {
        // Ignore local storage failures
      }
    }

    dueSessions.forEach(async (session) => {
      const reminderKey = `${SESSION_UPLOAD_REMINDER_PREFIX}${session.id}`
      try {
        if (window.localStorage.getItem(reminderKey)) return
      } catch {
        // Continue; still attempt reminder if storage is unavailable
      }

      const title = (session.title || '').trim() || routineNameById.get(session.routineId) || 'Practice session'
      const deepLink = buildSessionLivePath(session, { openMedia: 'video' })
      const fullUrl = `${window.location.origin}${deepLink}`

      const markSeen = () => {
        try {
          window.localStorage.setItem(reminderKey, new Date().toISOString())
        } catch {
          // Ignore local storage failures
        }
      }

      if (canNotify && Notification.permission === 'granted') {
        try {
          const registration = await navigator.serviceWorker?.ready
          if (registration?.showNotification) {
            await registration.showNotification('Add practice video', {
              body: `${title} has ended. Tap Upload now to add the session video.`,
              tag: `upload-reminder-${session.id}`,
              renotify: true,
              requireInteraction: true,
              actions: [{ action: 'upload-now', title: 'Upload now' }],
              data: { url: fullUrl },
            })
            markSeen()
            return
          }
        } catch {
          // Fallback to in-page Notification API below
        }

        const notification = new Notification('Add practice video', {
          body: `${title} has ended. Tap Upload now to add the session video.`,
          tag: `upload-reminder-${session.id}`,
          renotify: true,
          requireInteraction: true,
          data: { url: fullUrl },
        })

        notification.onclick = (event) => {
          event?.preventDefault?.()
          try { window.focus() } catch {
            // Ignore focus errors
          }
          window.location.assign(fullUrl)
          notification.close()
        }

        markSeen()
        return
      }

      notify(`Add practice video: ${title}`)
      markSeen()
    })
  }, [isAdmin, routines, sessions])

  // Family units
  const familyUnits = (() => {
    const units = []
    for (const dbUnit of myFamilyUnitsDB) {
      const members = []
      if (userProfile) members.push({ type: 'adult', profile: userProfile, relationship: 'You', isSelf: true })
      for (const kid of kidProfiles.filter(k => (dbUnit.kid_profile_ids || []).includes(k.id))) {
        members.push({ type: 'child', profile: kid, relationship: 'Your child', isOwn: true })
      }
      for (const g of outgoingGuardians.filter(g => g.status === 'accepted' && g.family_unit_id === dbUnit.id)) {
        members.push({
          type: 'adult',
          profile: { id: g.guardian_user_id, display_name: g.guardian_email || 'Guardian', avatar_emoji: '👤' },
          relationship: 'Parent / Guardian',
          guardianId: g.id,
        })
      }
      units.push({ id: dbUnit.id, name: dbUnit.name, isOwner: true, kidProfileIds: dbUnit.kid_profile_ids || [], members })
    }
    for (const fam of guardianFamilies) {
      const members = []
      if (fam.ownerProfile) members.push({ type: 'adult', profile: fam.ownerProfile, relationship: 'Owner', guardianId: fam.guardian?.id })
      if (userProfile) members.push({ type: 'adult', profile: userProfile, relationship: 'You (guardian)', isSelf: true })
      for (const kid of (fam.kids || [])) members.push({ type: 'child', profile: kid, relationship: 'Child', isOwn: false })
      units.push({
        id: fam.familyUnit?.id || fam.guardian?.id || `fam-${fam.ownerProfile?.id}`,
        name: fam.familyUnit?.name || (fam.ownerProfile?.display_name ? `${fam.ownerProfile.display_name}'s Family` : 'Family'),
        isOwner: false,
        members,
      })
    }
    return units
  })()

  const unlockAdmin = () => true
  const lockAdmin = () => {}
  const resetAdminTimer = () => {}

  // ============ PROFILE SWITCHING ============
  const switchToKidProfile = useCallback((kidId) => { setActiveProfile({ type: 'kid', kidId }) }, [])

  const switchToAdultProfileWithEmailCode = useCallback(async (email, token) => {
    if (!authUser?.id) return false
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const authEmail = String(authUser.email || '').trim().toLowerCase()
    const providedEmail = String(email || '').trim().toLowerCase()
    const trimmedToken = String(token || '').trim()
    if (!authEmail || !providedEmail || authEmail !== providedEmail) {
      throw new Error('Email does not match the signed-in parent account.')
    }
    if (!trimmedToken) {
      throw new Error('Code is required.')
    }
    const otpTypesToTry = ['email', 'magiclink', 'recovery', 'signup']
    let lastError = null
    for (const otpType of otpTypesToTry) {
      const { error } = await supabase.auth.verifyOtp({
        email: authEmail,
        token: trimmedToken,
        type: otpType,
      })
      if (!error) {
        setActiveProfile({ type: 'adult' })
        return true
      }
      lastError = error
    }

    const message = String(lastError?.message || '').toLowerCase()
    if (message.includes('expired') || message.includes('invalid')) {
      throw new Error('Code is invalid or expired. Tap resend and enter the newest code.')
    }
    throw lastError || new Error('Could not verify re-authentication code.')
  }, [authUser])

  // ============ PROFILE MANAGEMENT ============
  const loadProfiles = useCallback(async () => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const [profile, kids] = await Promise.all([fetchUserProfile(), fetchKidProfiles()])
      if (!profile) {
        const metaName = authUser.user_metadata?.displayName || authUser.user_metadata?.display_name || authUser.email?.split('@')[0] || ''
        const newProfile = await upsertUserProfile({ displayName: metaName, avatarEmoji: '👤' })
        setUserProfile(newProfile)
      } else {
        setUserProfile(profile)
      }
      setKidProfiles(kids || [])
    } catch (err) { console.error('Failed to load profiles:', err) }
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
    if (activeProfile.type === 'kid' && activeProfile.kidId === kidId) setActiveProfile({ type: 'adult' })
  }, [activeProfile])

  // ============ SHARING MANAGEMENT ============
  const loadShares = useCallback(async ({ skipIncoming = false } = {}) => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const outgoing = await fetchMyShares()
      const incoming = skipIncoming ? incomingSharesRef.current : await fetchIncomingShares()
      setOutgoingShares(outgoing || [])
      if (!skipIncoming) setIncomingShares(incoming || [])
      const accepted = (incoming || []).filter(s => s.status === 'accepted')
      const dances = await Promise.all(accepted.map(async (share) => {
        try {
          const [dance, ownerProfile] = await Promise.all([fetchSharedDance(share.dance_id), fetchSharedOwnerProfile(share.owner_user_id)])
          return { share, dance, ownerProfile }
        } catch { return null }
      }))
      setSharedDances(dances.filter(Boolean))
    } catch (err) { console.warn('Failed to load shares:', err) }
  }, [authUser?.id])

  const createShareInvite = useCallback(async ({ danceId, routineId }) => {
    const share = await apiCreateShare({ danceId, routineId })
    setOutgoingShares(prev => [share, ...prev])
    return share
  }, [])

  const acceptShareInvite = useCallback(async (shareId) => {
    const share = await apiAcceptShare(shareId)
    setIncomingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...share } : s))
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

  const fetchPartnerKids = useCallback(async (partnerUserId) => apiFetchPartnerKids(partnerUserId), [])

  const updateSharePartnerKids = useCallback(async (shareId, kidIds) => {
    const updated = await apiUpdateSharePartnerKids(shareId, kidIds)
    setOutgoingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...updated } : s))
    setIncomingShares(prev => prev.map(s => s.id === shareId ? { ...s, ...updated } : s))
    setSharedDances(prev => prev.map(item => {
      if (!item?.share || item.share.id !== shareId) return item
      return { ...item, share: { ...item.share, ...updated } }
    }))
    return updated
  }, [])

  // ============ GUARDIAN MANAGEMENT ============
  const loadGuardians = useCallback(async () => {
    if (!hasSupabaseConfig || !authUser?.id) return
    try {
      const [outgoing, incoming, myUnits, guardianUnits] = await Promise.all([
        fetchMyGuardians(), fetchIncomingGuardianInvites(), fetchMyFamilyUnits(), fetchGuardianFamilyUnits(),
      ])
      setOutgoingGuardians(outgoing || [])
      setIncomingGuardians(incoming || [])
      setMyFamilyUnitsDB(myUnits || [])
      setGuardianFamilyUnitsDB(guardianUnits || [])

      const accepted = (incoming || []).filter(g => g.status === 'accepted')
      const families = await Promise.all(accepted.map(async (guardian) => {
        try {
          const unitRow = guardian.family_unit_id
            ? (guardianUnits || []).find(u => u.id === guardian.family_unit_id)
            : null
          const unitKidIds = guardian.family_unit_id ? unitRow?.kid_profile_ids : guardian.kid_profile_ids
          const [ownerProfile, kids] = await Promise.all([
            fetchGuardianOwnerProfile(guardian.owner_user_id),
            unitKidIds?.length ? fetchGuardianKidProfiles(guardian.owner_user_id, unitKidIds) : Promise.resolve([]),
          ])
          return { guardian, ownerProfile, kids, familyUnit: unitRow }
        } catch { return null }
      }))
      setGuardianFamilies(families.filter(Boolean))
    } catch (err) { console.warn('Failed to load guardians:', err) }
  }, [authUser?.id])

  const createGuardianInvite = useCallback(async ({ familyUnitId, kidProfileIds, role }) => {
    const guardian = await apiCreateGuardian({ familyUnitId, kidProfileIds, role })
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
    setProfilesLoaded(false)
    Promise.all([loadProfiles(), loadGuardians()]).finally(() => setProfilesLoaded(true))
    loadShares({ skipIncoming: true })
  }, [authLoading, authUser?.id, loadProfiles, loadShares, loadGuardians])

  // ============ INVITE TOKEN HANDLING ============
  useEffect(() => {
    if (authLoading || !authUser?.id) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('invite')
    if (!token) return
    const url = new URL(window.location)
    url.searchParams.delete('invite')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    ;(async () => {
      try { await acceptGuardianByToken(token); notify('Guardian invite accepted!') }
      catch (err) { console.warn('Failed to accept guardian invite:', err); notify(err?.message || 'Could not accept invite.') }
    })()
  }, [authLoading, authUser?.id, acceptGuardianByToken])

  useEffect(() => {
    if (authLoading || !authUser?.id) return
    const params = new URLSearchParams(window.location.search)
    const token = params.get('share')
    if (!token) return
    const url = new URL(window.location)
    url.searchParams.delete('share')
    window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    ;(async () => {
      try { await acceptShareByToken(token); notify('Share invite accepted!'); window.location.replace('/') }
      catch (err) { console.warn('Failed to accept share invite:', err); notify(err?.message || 'Could not accept share invite.') }
    })()
  }, [authLoading, authUser?.id, acceptShareByToken])

  // ============ AUTH SETUP ============
  useEffect(() => {
    let mounted = true
    if (!hasSupabaseConfig || !supabase) {
      setFileStorageUserScope(null); setDanceDataOwnerId(null); setBackendDanceOwnerId(null); setAuthSession(null); setAuthUser(null); setAuthLoading(false)
      return () => { mounted = false }
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      const session = data?.session || null
      setAuthSession(session); setAuthUser(session?.user || null); setFileStorageUserScope(session?.user?.id || null); setDanceDataOwnerId(session?.user?.id || null); setBackendDanceOwnerId(session?.user?.id || null); setAuthLoading(false)
    }).catch(() => {
      if (!mounted) return
      setFileStorageUserScope(null); setDanceDataOwnerId(null); setBackendDanceOwnerId(null); setAuthSession(null); setAuthUser(null); setAuthLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Only update state if the user actually changed (sign-in, sign-out).
      // TOKEN_REFRESHED fires when returning to the tab — resetting owner IDs
      // would clobber the correct guardian→child mapping set during hydration.
      if (event === 'TOKEN_REFRESHED') return

      const nextUserId = session?.user?.id || null
      if (nextUserId === authUserIdRef.current) return

      setAuthSession(session || null); setAuthUser(session?.user || null); setFileStorageUserScope(session?.user?.id || null); setDanceDataOwnerId(session?.user?.id || null); setBackendDanceOwnerId(session?.user?.id || null)
    })
    return () => { mounted = false; sub?.subscription?.unsubscribe() }
  }, [])

  // ================================================================
  // DANCE DATA — MUTATION FUNCTIONS
  // ================================================================

  // ---- Sessions ----
  const addSession = useCallback(async (payload) => {
    const created = await apiCreateSession(payload)
    setSessions(prev => [...prev, created])
    return created
  }, [])

  const scheduleRehearsal = useCallback(async (payload) => {
    const created = await apiCreateSession({ ...payload, type: 'practice', status: 'scheduled' })
    setSessions(prev => [...prev, created])
    return created
  }, [])

  const editSession = useCallback(async (id, updates) => {
    const updated = await apiUpdateSession(id, updates)
    setSessions(prev => prev.map(s => s.id === id ? updated : s))
    return updated
  }, [])

  const removeSession = useCallback(async (id) => {
    setSessions(prev => prev.filter(s => s.id !== id))
    await apiDeleteSession(id)
  }, [])

  const setRehearsalVersion = useCallback(async (sessionId, choreographyVersionId) => {
    const updated = await apiUpdateSession(sessionId, { choreographyVersionId: choreographyVersionId || null })
    setSessions(prev => prev.map(s => s.id === sessionId ? updated : s))
  }, [])

  const completeRehearsal = useCallback(async (sessionId, completedAt) => {
    const updated = await apiUpdateSession(sessionId, { status: 'completed', completedAt: completedAt || new Date().toISOString() })
    setSessions(prev => prev.map(s => s.id === sessionId ? updated : s))
  }, [])

  const attachRehearsalVideo = useCallback(async (sessionId, videoKey, videoName) => {
    const updated = await apiUpdateSession(sessionId, {
      rehearsalVideoKey: videoKey || '', rehearsalVideoName: videoName || '',
      noVideoTaken: false,
      noVideoTakenAt: null,
      status: 'completed', completedAt: new Date().toISOString(),
    })
    setSessions(prev => prev.map(s => s.id === sessionId ? updated : s))
  }, [])

  const setSessionReflection = useCallback(async (sessionId, reflection) => {
    if (blockOfflineMutation('save reflections')) return
    const session = sessionsRef.current.find(s => s.id === sessionId)
    if (!session) return
    const merged = { ...session.dancerReflection, ...reflection }
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, dancerReflection: merged } : s))
    apiUpdateSession(sessionId, { dancerReflection: merged }).catch(e => console.warn('Save reflection:', e))
  }, [blockOfflineMutation])

  const addEmojiReaction = useCallback(async (sessionId, emoji) => {
    if (blockOfflineMutation('add reactions')) return
    const session = sessionsRef.current.find(s => s.id === sessionId)
    if (!session) return
    const updated = [...(session.emojiReactions || []), emoji]
    setSessions(prev => prev.map(s => s.id === sessionId ? { ...s, emojiReactions: updated } : s))
    apiUpdateSession(sessionId, { emojiReactions: updated }).catch(e => console.warn('Save reaction:', e))
  }, [blockOfflineMutation])

  const fetchSessionPracticeReflection = useCallback(async (sessionId, kidProfileId = null) => {
    if (!sessionId) return null
    const resolvedKidProfileId = kidProfileId || (activeProfile?.type === 'kid' ? activeProfile.kidId : null)
    return apiFetchSessionPracticeReflection(sessionId, resolvedKidProfileId)
  }, [activeProfile])

  const fetchRoutineLivingGoals = useCallback(async (routineId, kidProfileId = null) => {
    if (!routineId) return []
    const resolvedKidProfileId = kidProfileId || (activeProfile?.type === 'kid' ? activeProfile.kidId : null)
    return apiFetchRoutineLivingGoals(routineId, resolvedKidProfileId)
  }, [activeProfile])

  const fetchSessionFeedback = useCallback(async (sessionId, kidProfileId) => {
    if (!sessionId || !kidProfileId) return null
    return apiFetchSessionFeedback(sessionId, kidProfileId)
  }, [])

  const saveSessionFeedback = useCallback(async (sessionId, kidProfileId, payload = {}) => {
    if (!sessionId || !kidProfileId) return null
    return apiUpsertSessionFeedback(sessionId, kidProfileId, payload)
  }, [])

  const saveSessionPracticeReflection = useCallback(async (sessionId, payload = {}) => {
    if (!sessionId) return null
    const kidProfileId = payload.kidProfileId
      || (activeProfile?.type === 'kid' ? activeProfile.kidId : null)
    return apiUpsertSessionPracticeReflection(sessionId, { ...payload, kidProfileId })
  }, [activeProfile])

  const saveSessionGoalCheckins = useCallback(async (sessionId, ratings = []) => {
    if (!sessionId) return []
    return apiSavePracticeGoalCheckins(sessionId, ratings)
  }, [])

  // ---- Disciplines ----
  const addDiscipline = useCallback(async (payload) => {
    const created = await apiCreateDiscipline(payload)
    created.elements = []
    created.gradeHistory = []
    setDisciplines(prev => [...prev, created])
    return created
  }, [])

  const editDiscipline = useCallback(async (id, updates) => {
    const updated = await apiUpdateDiscipline(id, updates)
    setDisciplines(prev => prev.map(d => d.id === id ? { ...d, ...updated } : d))
    return updated
  }, [])

  const removeDiscipline = useCallback(async (id) => {
    setDisciplines(prev => prev.filter(d => d.id !== id))
    await apiDeleteDiscipline(id)
  }, [])

  // ---- Discipline elements ----
  const addElement = useCallback(async (disciplineId, element) => {
    const created = await apiCreateDisciplineElement(disciplineId, element)
    setDisciplines(prev => prev.map(d =>
      d.id === disciplineId ? { ...d, elements: [...d.elements, created] } : d
    ))
    return created
  }, [])

  const setElementStatus = useCallback(async (disciplineId, elementId, newStatus) => {
    const updated = await apiUpdateDisciplineElement(elementId, { status: newStatus })
    setDisciplines(prev => prev.map(d =>
      d.id === disciplineId ? { ...d, elements: d.elements.map(e => e.id === elementId ? updated : e) } : d
    ))
  }, [])

  const removeElement = useCallback(async (disciplineId, elementId) => {
    setDisciplines(prev => prev.map(d =>
      d.id === disciplineId ? { ...d, elements: d.elements.filter(e => e.id !== elementId) } : d
    ))
    await apiDeleteDisciplineElement(elementId)
  }, [])

  // ---- Routines ----
  const addRoutine = useCallback(async (payload) => {
    const created = await apiCreateRoutine(payload)
    const firstVersion = await apiCreateChoreographyVersion(created.id, { label: 'v1' })
    created.choreographyVersions = [firstVersion]
    created.practiceVideos = []
    setRoutines(prev => [...prev, created])
    return created
  }, [])

  const editRoutine = useCallback(async (id, updates) => {
    const updated = await apiUpdateRoutine(id, updates)
    setRoutines(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))
    return updated
  }, [])

  const removeRoutine = useCallback(async (id) => {
    setRoutines(prev => prev.filter(r => r.id !== id))
    await apiDeleteRoutine(id)
  }, [])

  // ---- Choreography versions ----
  const addChoreographyVersion = useCallback(async (routineId, versionData) => {
    const created = await apiCreateChoreographyVersion(routineId, versionData)
    setRoutines(prev => prev.map(r =>
      r.id === routineId ? { ...r, choreographyVersions: [...(r.choreographyVersions || []), created] } : r
    ))
    return created
  }, [])

  const editChoreographyVersion = useCallback(async (routineId, versionId, updates) => {
    setRoutines(prev => prev.map(r =>
      r.id === routineId
        ? { ...r, choreographyVersions: (r.choreographyVersions || []).map(v => v.id === versionId ? { ...v, ...updates } : v) }
        : r
    ))
    apiUpdateChoreographyVersion(versionId, updates).catch(e => console.warn('Save version:', e))
  }, [])

  // ---- Practice videos ----
  const addPracticeVideo = useCallback(async (routineId, videoData) => {
    const created = await apiCreatePracticeVideo(routineId, videoData)
    setRoutines(prev => prev.map(r =>
      r.id === routineId ? { ...r, practiceVideos: [...(r.practiceVideos || []), created] } : r
    ))
    return created
  }, [])

  // ---- Events (shows) ----
  const addShow = useCallback(async (payload) => {
    const created = await apiCreateEvent(payload)
    setEvents(prev => sortEventsChronological([...prev, created]))
    return created
  }, [])

  const editShow = useCallback(async (id, updates) => {
    const updated = await apiUpdateEvent(id, updates)
    setEvents(prev => sortEventsChronological(prev.map(ev => ev.id === id ? { ...ev, ...updated } : ev)))
    return updated
  }, [])

  const removeShow = useCallback(async (id) => {
    setEvents(prev => sortEventsChronological(prev.filter(ev => ev.id !== id)))
    await apiDeleteEvent(id)
  }, [])

  // ---- Event entries ----
  const addEventEntry = useCallback(async (showId, entry) => {
    const created = await apiCreateEventEntry(showId, entry)
    setEvents(prev => sortEventsChronological(prev.map(ev =>
      ev.id === showId
        ? (() => {
            const nextEntries = sortEventEntriesChronological([...(ev.entries || []), created])
            return {
              ...ev,
              entries: nextEntries,
              routineIds: [...new Set(nextEntries.map((item) => item.routineId).filter(Boolean))],
            }
          })()
        : ev
    )))
    return created
  }, [])

  const editEventEntry = useCallback(async (showId, entryId, updates) => {
    // Find the current entry so we can detect qualifiedForEventId changes
    let currentEntry = null
    setEvents(prev => {
      const ev = prev.find(e => e.id === showId)
      currentEntry = (ev?.entries || []).find(e => e.id === entryId) || null
      return prev // no-op, just reading
    })

    const updated = await apiUpdateEventEntry(entryId, updates)
    setEvents(prev => sortEventsChronological(prev.map(ev =>
      ev.id === showId
        ? (() => {
            const nextEntries = sortEventEntriesChronological((ev.entries || []).map((entry) => entry.id === entryId ? updated : entry))
            return {
              ...ev,
              entries: nextEntries,
              routineIds: [...new Set(nextEntries.map((item) => item.routineId).filter(Boolean))],
            }
          })()
        : ev
    )))

    // Auto-create an entry in the target competition when qualifiedForEventId is set
    if (
      updates.qualifiedForEventId !== undefined &&
      updates.qualifiedForEventId &&
      updates.qualifiedForEventId !== (currentEntry?.qualifiedForEventId || '')
    ) {
      const routineId = updated.routineId || currentEntry?.routineId
      if (routineId) {
        // Check if the routine already has an entry in the target event
        let alreadyExists = false
        setEvents(prev => {
          const targetEvent = prev.find(e => e.id === updates.qualifiedForEventId)
          alreadyExists = (targetEvent?.entries || []).some(e => e.routineId === routineId)
          return prev // no-op, just reading
        })
        if (!alreadyExists) {
          try {
            const newEntry = await apiCreateEventEntry(updates.qualifiedForEventId, {
              routineId,
              scheduledDate: '',
              scheduledTime: '',
              place: null,
              qualified: false,
              qualifiedForEventId: '',
              notes: '',
            })
            setEvents(prev => sortEventsChronological(prev.map(ev =>
              ev.id === updates.qualifiedForEventId
                ? (() => {
                    const nextEntries = sortEventEntriesChronological([...(ev.entries || []), newEntry])
                    return {
                      ...ev,
                      entries: nextEntries,
                      routineIds: [...new Set(nextEntries.map((item) => item.routineId).filter(Boolean))],
                    }
                  })()
                : ev
            )))
          } catch (err) {
            console.error('Auto-add entry to qualified event failed:', err)
          }
        }
      }
    }

    return updated
  }, [])

  const removeEventEntry = useCallback(async (showId, entryId) => {
    setEvents(prev => sortEventsChronological(prev.map(ev =>
      ev.id === showId
        ? (() => {
            const nextEntries = sortEventEntriesChronological((ev.entries || []).filter((entry) => entry.id !== entryId))
            return {
              ...ev,
              entries: nextEntries,
              routineIds: [...new Set(nextEntries.map((item) => item.routineId).filter(Boolean))],
            }
          })()
        : ev
    )))
    await apiDeleteEventEntry(entryId)
  }, [])

  // ---- Scrapbook entries ----
  const addScrapbookEntry = useCallback(async (showId, entry) => {
    const created = await apiCreateScrapbookEntry(showId, entry)
    setEvents(prev => sortEventsChronological(prev.map(ev =>
      ev.id === showId ? { ...ev, scrapbookEntries: [...(ev.scrapbookEntries || []), created] } : ev
    )))
    return created
  }, [])

  const addScrapbookReaction = useCallback(async (showId, entryId, emoji) => {
    if (blockOfflineMutation('add scrapbook reactions')) return
    const ev = eventsRef.current.find(e => e.id === showId)
    const entry = ev?.scrapbookEntries?.find(e => e.id === entryId)
    if (!entry) return
    const updated = [...(entry.emojiReactions || []), emoji]
    setEvents(prev => sortEventsChronological(prev.map(e =>
      e.id === showId
        ? { ...e, scrapbookEntries: (e.scrapbookEntries || []).map(s => s.id === entryId ? { ...s, emojiReactions: updated } : s) }
        : e
    )))
    apiUpdateScrapbookEntry(entryId, { emojiReactions: updated }).catch(e => console.warn('Save scrapbook reaction:', e))
  }, [blockOfflineMutation])

  const removeScrapbookEntry = useCallback(async (showId, entryId) => {
    setEvents(prev => sortEventsChronological(prev.map(ev =>
      ev.id === showId
        ? { ...ev, scrapbookEntries: (ev.scrapbookEntries || []).filter((entry) => entry.id !== entryId) }
        : ev
    )))
    await apiDeleteScrapbookEntry(entryId)
  }, [])

  // ---- Stickers ----
  const addStickers = useCallback(async (stickerArray) => {
    if (!stickerArray?.length) return
    const created = await apiCreateStickers(stickerArray)
    setStickers(prev => [...prev, ...created])
    return created
  }, [])

  const addCustomSticker = useCallback(async (payload) => {
    const created = await apiCreateSticker({ ...payload, type: 'custom' })
    setStickers(prev => [...prev, created])
    return created
  }, [])

  // ---- Practice log ----
  const logPracticeDay = useCallback(async (dateStr) => {
    setPracticeLog(prev => prev.includes(dateStr) ? prev : [...prev, dateStr])
    apiLogPractice(dateStr).catch(e => console.warn('Save practice log:', e))
  }, [])

  // ---- Dancer profile ----
  const updateDancerProfileFn = useCallback(async (updates) => {
    setDancerProfile(prev => ({ ...prev, ...updates }))
    apiUpsertDancerProfile(updates).catch(e => console.warn('Save dancer profile:', e))
  }, [])

  const addGoal = useCallback(async (payload) => {
    const created = await apiCreateDancerGoal({ text: payload.text || '' })
    setDancerGoals(prev => [...prev, created])
    return created
  }, [])

  const completeGoal = useCallback(async (goalId) => {
    const completedDate = new Date().toISOString().split('T')[0]
    setDancerGoals(prev => prev.map(g => g.id === goalId ? { ...g, completedDate } : g))
    apiUpdateDancerGoal(goalId, { completedDate }).catch(e => console.warn('Save goal:', e))
  }, [])

  const setCurrentFocus = useCallback(async (focus) => {
    setDancerProfile(prev => ({ ...prev, currentFocus: focus }))
    apiUpsertDancerProfile({ currentFocus: focus }).catch(e => console.warn('Save focus:', e))
  }, [])

  const addDancerDiscipline = useCallback(async (payload) => {
    const created = await apiCreateDancerDiscipline(payload)
    setDancerDisciplines(prev => [...prev, created])
    return created
  }, [])

  const editDancerDiscipline = useCallback(async (disciplineId, updates) => {
    const updated = await apiUpdateDancerDiscipline(disciplineId, updates)
    setDancerDisciplines(prev => prev.map((discipline) => discipline.id === disciplineId ? updated : discipline))
    return updated
  }, [])

  const removeDancerDiscipline = useCallback(async (disciplineId) => {
    setDancerDisciplines(prev => prev.filter((discipline) => discipline.id !== disciplineId))
    await apiDeleteDancerDiscipline(disciplineId)
  }, [])

  const addDancerJourneyEvent = useCallback(async (payload) => {
    const created = await apiCreateDancerJourneyEvent(payload)
    setDancerJourneyEvents(prev => [created, ...prev])
    return created
  }, [])

  const editDancerJourneyEvent = useCallback(async (eventId, updates) => {
    const updated = await apiUpdateDancerJourneyEvent(eventId, updates)
    setDancerJourneyEvents(prev => prev.map((eventItem) => eventItem.id === eventId ? updated : eventItem))
    return updated
  }, [])

  const removeDancerJourneyEvent = useCallback(async (eventId) => {
    setDancerJourneyEvents(prev => prev.filter((eventItem) => eventItem.id !== eventId))
    await apiDeleteDancerJourneyEvent(eventId)
  }, [])

  // ---- Settings ----
  const updateSettingsFn = useCallback(async (updates) => {
    setSettingsState(prev => ({ ...prev, ...updates }))
    apiUpdateSettings(updates).catch(e => console.warn('Save settings:', e))
  }, [])

  // ---- Reset (wipe local state) ----
  const resetState = useCallback(() => {
    setDisciplines(defaultState.disciplines); setRoutines([]); setSessions([]); setEvents([])
    setStickers([]); setPracticeLog([]); setDancerProfile({ name: 'My Dancing', currentFocus: null })
    setDancerGoals([]); setDancerDisciplines([]); setDancerJourneyEvents([]); setSettingsState({ dancerName: 'My Dancing', themeColor: '#a855f7', promptLeadMs: 0 })
  }, [])

  const applySnapshotData = useCallback((snapshotData = {}) => {
    const nextDisciplines = Array.isArray(snapshotData.disciplines) ? snapshotData.disciplines : defaultState.disciplines
    const nextRoutines = Array.isArray(snapshotData.routines) ? snapshotData.routines : []
    const nextSessions = Array.isArray(snapshotData.sessions) ? snapshotData.sessions : []
    const nextEvents = Array.isArray(snapshotData.events) ? sortEventsChronological(snapshotData.events) : []
    const nextSettings = snapshotData.settings || { dancerName: 'My Dancing', themeColor: '#a855f7', promptLeadMs: 0 }
    setDisciplines(nextDisciplines.length ? nextDisciplines : defaultState.disciplines)
    setRoutines(nextRoutines)
    setSessions(nextSessions)
    setEvents(nextEvents)
    setSettingsState(nextSettings)
    setStickers(Array.isArray(snapshotData.stickers) ? snapshotData.stickers : [])
    setPracticeLog(Array.isArray(snapshotData.practiceLog) ? snapshotData.practiceLog : [])
    setDancerProfile(snapshotData.dancerProfile || { name: 'My Dancing', currentFocus: null })
    setDancerGoals(Array.isArray(snapshotData.dancerGoals) ? snapshotData.dancerGoals : [])
    setDancerDisciplines(Array.isArray(snapshotData.dancerDisciplines) ? snapshotData.dancerDisciplines : [])
    setDancerJourneyEvents(Array.isArray(snapshotData.dancerJourneyEvents) ? snapshotData.dancerJourneyEvents : [])
    setIncomingShares(Array.isArray(snapshotData.incomingShares) ? snapshotData.incomingShares : [])
    setOutgoingShares(Array.isArray(snapshotData.outgoingShares) ? snapshotData.outgoingShares : [])
    setIncomingGuardians(Array.isArray(snapshotData.incomingGuardians) ? snapshotData.incomingGuardians : [])
    setOutgoingGuardians(Array.isArray(snapshotData.outgoingGuardians) ? snapshotData.outgoingGuardians : [])
    setUserProfile(snapshotData.userProfile || null)
    setKidProfiles(Array.isArray(snapshotData.kidProfiles) ? snapshotData.kidProfiles : [])
    setLastSyncedAt(snapshotData.lastSyncedAt || null)
  }, [])

  // ================================================================
  // HYDRATION — load from normalized tables
  // ================================================================
  useEffect(() => {
    if (authLoading) return
    let cancelled = false

    async function hydrateState() {
      if (hasSupabaseConfig && !authUser?.id) { setIsLoading(false); return }
      if (!authUser?.id) { setIsLoading(false); return }

      const cachedSnapshot = readAppSnapshot(authUser.id)
      const hasCachedSnapshot = Boolean(cachedSnapshot?.data)
      if (cachedSnapshot?.data) {
        applySnapshotData(cachedSnapshot.data)
        setIsUsingCachedData(true)
        setIsLoading(false)
      } else {
        setIsUsingCachedData(false)
      }

      if (!isOnline && hasCachedSnapshot) return

      if (!hasCachedSnapshot) {
        setIsLoading(true)
        setStickers([])
        setPracticeLog([])
        setDancerProfile({ name: 'My Dancing', currentFocus: null })
        setDancerGoals([])
        setDancerDisciplines([])
        setDancerJourneyEvents([])
      }
      try {
        const init = await initializeDanceData()
        if (cancelled) return
        setFileStorageUserScope(init.ownerId)
        setDanceDataOwnerId(init.ownerId)
        setBackendDanceOwnerId(init.ownerId)

        const [disc, rout, sess, evts, sett, incoming, guardianInvites] = await Promise.all([
          fetchDisciplinesWithChildren(),
          fetchRoutinesWithChildren(),
          apiFetchSessions(),
          fetchEventsWithChildren(),
          apiFetchSettings(),
          fetchIncomingShares(),
          fetchIncomingGuardianInvites().catch(() => []),
        ])
        if (cancelled) return
        setIncomingShares(incoming || [])

        let nextDisc = disc
        let nextRout = rout
        let nextSess = sess
        let nextEvts = evts

        const acceptedForOwner = (incoming || []).filter(
          (share) => share.status === 'accepted' && share.owner_user_id === init.ownerId
        )
        const shareAllForOwner = acceptedForOwner.some((share) => !share.routine_id)
        const sharedRoutineIds = new Set(
          acceptedForOwner.map((share) => share.routine_id).filter(Boolean)
        )

        const hasAcceptedGuardianAccessForOwner = (guardianInvites || []).some(
          (guardian) => guardian.status === 'accepted' && guardian.owner_user_id === init.ownerId
        )

        const shouldScopeToSharedRoutines = authUser?.id !== init.ownerId
          && acceptedForOwner.length > 0
          && !shareAllForOwner
          && sharedRoutineIds.size > 0
          && !hasAcceptedGuardianAccessForOwner

        if (shouldScopeToSharedRoutines) {
          nextRout = rout.filter((routine) => sharedRoutineIds.has(routine.id))
          nextSess = sess.filter((session) => session.routineId && sharedRoutineIds.has(session.routineId))
          nextEvts = (evts || [])
            .map((event) => {
              const filteredEntries = (event.entries || []).filter(
                (entry) => entry.routineId && sharedRoutineIds.has(entry.routineId)
              )
              if (!filteredEntries.length) return null
              return {
                ...event,
                entries: filteredEntries,
                routineIds: [...new Set(filteredEntries.map((entry) => entry.routineId).filter(Boolean))],
              }
            })
            .filter(Boolean)

          // Routine shares do not include discipline data.
          // Discipline access is reserved for owners/guardians (family access).
          nextDisc = []
        }

        const shouldUseDefaultDisciplines = authUser?.id === init.ownerId && (!nextDisc || nextDisc.length === 0)
        setDisciplines(shouldUseDefaultDisciplines ? defaultState.disciplines : nextDisc)
        setRoutines(nextRout)
        setSessions(nextSess)
        setEvents(sortEventsChronological(nextEvts))
        setSettingsState(sett)
        setIsUsingCachedData(false)
        setLastSyncedAt(new Date().toISOString())

        if (!cancelled) setIsLoading(false)

        Promise.all([
          apiFetchStickers(),
          apiFetchPracticeLog(),
          apiFetchDancerProfile(),
          apiFetchDancerGoals(),
          apiFetchDancerDisciplines(),
          apiFetchDancerJourneyEvents(),
        ]).then(([stick, log, prof, goals, dancerDisc, dancerJourney]) => {
          if (cancelled) return
          setStickers(stick)
          setPracticeLog(log)
          setDancerProfile(prof || { name: 'My Dancing', currentFocus: null })
          setDancerGoals(goals)
          setDancerDisciplines(dancerDisc)
          setDancerJourneyEvents(dancerJourney)
        }).catch((err) => {
          if (!cancelled) console.warn('Deferred hydration failed:', err)
        })
      } catch (err) {
        console.warn('Hydration failed:', err)
        if (!cancelled) setIsLoading(false)
      }
    }

    hydrateState()
    return () => { cancelled = true }
  }, [authLoading, authUser?.id, applySnapshotData, isOnline])

  useEffect(() => {
    if (!authUser?.id) return
    if (isLoading) return
    writeAppSnapshot(authUser.id, {
      disciplines,
      routines,
      sessions,
      events,
      settings,
      stickers,
      practiceLog,
      dancerProfile,
      dancerGoals,
      dancerDisciplines,
      dancerJourneyEvents,
      incomingShares,
      outgoingShares,
      incomingGuardians,
      outgoingGuardians,
      userProfile,
      kidProfiles,
      lastSyncedAt,
    })
  }, [
    authUser?.id,
    isLoading,
    disciplines,
    routines,
    sessions,
    events,
    settings,
    stickers,
    practiceLog,
    dancerProfile,
    dancerGoals,
    dancerDisciplines,
    dancerJourneyEvents,
    incomingShares,
    outgoingShares,
    incomingGuardians,
    outgoingGuardians,
    userProfile,
    kidProfiles,
    lastSyncedAt,
  ])

  // ================================================================
  // MILESTONE STICKER CHECK
  // ================================================================
  const milestoneCheckedRef = useRef(new Set())
  useEffect(() => {
    if (isLoading) return
    const stateForCheck = {
      practiceLog, routines, sessions,
      shows: events,
      dancerProfile: { ...dancerProfile, goals: dancerGoals },
      disciplines,
      stickers: stickersRef.current,
    }
    const newOnes = checkForNewStickers(stateForCheck)
    const truly = newOnes.filter(s => !milestoneCheckedRef.current.has(s.type))
    if (truly.length > 0) {
      truly.forEach(s => milestoneCheckedRef.current.add(s.type))
      addStickers(truly).catch(e => console.warn('Milestone save:', e))
    }
  }, [practiceLog, routines, sessions, events, dancerProfile, dancerGoals, disciplines, isLoading, addStickers])

  // ============ AUTH HELPERS ============
  const getMagicLinkRedirectUrl = () => {
    const explicitRedirect = import.meta.env.VITE_AUTH_REDIRECT_URL
    if (explicitRedirect) return explicitRedirect
    if (typeof window === 'undefined') return undefined
    const basePath = import.meta.env.BASE_URL || '/'
    return new URL(basePath, window.location.origin).toString()
  }

  const checkUserExists = async (email) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: getMagicLinkRedirectUrl() } })
    return !error
  }

  const signInWithMagicLink = async (email) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')
    const { error } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { shouldCreateUser: false, emailRedirectTo: getMagicLinkRedirectUrl() } })
    if (error) throw error
    return true
  }

  const sendParentReauthCode = useCallback(async () => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const email = String(authUser?.email || '').trim()
    if (!email) throw new Error('No parent email is available for this account.')
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: getMagicLinkRedirectUrl(),
      },
    })
    if (error) throw error
    return true
  }, [authUser?.email])

  const verifyEmailOtp = async (email, token, otpType = 'email') => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    const trimmedToken = String(token || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')
    if (!trimmedToken) throw new Error('Code is required.')
    const { error } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: trimmedToken, type: otpType })
    if (error) {
      const fallbackType = otpType === 'email' ? 'signup' : 'email'
      const { error: fallbackError } = await supabase.auth.verifyOtp({ email: trimmedEmail, token: trimmedToken, type: fallbackType })
      if (fallbackError) throw error
    }
    return true
  }

  const signUpWithMagicLink = async (email, metadata) => {
    if (!supabase) throw new Error('Supabase auth is not configured.')
    const trimmedEmail = String(email || '').trim()
    if (!trimmedEmail) throw new Error('Email is required.')
    const opts = { emailRedirectTo: getMagicLinkRedirectUrl() }
    if (metadata) opts.data = metadata
    const { error } = await supabase.auth.signInWithOtp({ email: trimmedEmail, options: { ...opts, shouldCreateUser: true } })
    if (error) throw error
    return true
  }

  const signOut = async (scope = 'local') => {
    if (!supabase) return
    setDanceDataOwnerId(null)
    setBackendDanceOwnerId(null)

    if (scope === 'others') {
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) throw error
      return
    }

    const { error } = await supabase.auth.signOut(scope ? { scope } : undefined)
    if (error) throw error
  }

  const guardMutation = useCallback((fn, actionLabel = 'make changes') => {
    return async (...args) => {
      if (blockOfflineMutation(actionLabel)) return null
      return fn(...args)
    }
  }, [blockOfflineMutation])

  return (
    <AppContext.Provider value={{
      // Dance data (individual state)
      disciplines,
      routines,
      sessions,
      events,
      stickers,
      practiceLog,
      dancerProfile,
      dancerGoals,
      dancerDisciplines,
      dancerJourneyEvents,
      settings,
      isLoading,
      isOnline,
      isUsingCachedData,
      lastSyncedAt,
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
      sendParentReauthCode,
      signUpWithMagicLink,
      verifyEmailOtp,
      checkUserExists,
      signOut,
      signOutOtherDevices,

      // Profiles
      userProfile,
      kidProfiles: allKidProfiles,
      ownKidProfiles: kidProfiles,
      activeProfile,
      isKidMode,
      activeKidProfile,
      activeProfileName,
      activeProfileEmoji,
      switchToKidProfile,
      switchToAdultProfileWithEmailCode,
      saveUserProfile,
      addKidProfile,
      editKidProfile,
      removeKidProfile,
      loadProfiles,
      profilesLoaded,
      familyUnits,

      // Family unit CRUD
      createFamilyUnit: async ({ name, kidProfileIds }) => {
        if (blockOfflineMutation('create a family unit')) return null
        const unit = await apiCreateFamilyUnit({ name, kidProfileIds })
        setMyFamilyUnitsDB(prev => [...prev, unit])
        return unit
      },
      updateFamilyUnit: async (unitId, updates) => {
        if (blockOfflineMutation('update a family unit')) return null
        const unit = await apiUpdateFamilyUnit(unitId, updates)
        setMyFamilyUnitsDB(prev => prev.map(u => u.id === unitId ? unit : u))
        return unit
      },
      deleteFamilyUnit: async (unitId) => {
        if (blockOfflineMutation('delete a family unit')) return null
        await apiDeleteFamilyUnit(unitId)
        setMyFamilyUnitsDB(prev => prev.filter(u => u.id !== unitId))
      },

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

      // Direct mutation functions
      addSession: guardMutation(addSession),
      scheduleRehearsal: guardMutation(scheduleRehearsal),
      editSession: guardMutation(editSession),
      fetchSessionFeedback,
      saveSessionFeedback: guardMutation(saveSessionFeedback),
      removeSession: guardMutation(removeSession),
      setRehearsalVersion: guardMutation(setRehearsalVersion),
      completeRehearsal: guardMutation(completeRehearsal),
      attachRehearsalVideo: guardMutation(attachRehearsalVideo),
      setSessionReflection,
      addEmojiReaction,
      fetchSessionPracticeReflection,
      fetchRoutineLivingGoals,
      saveSessionPracticeReflection: guardMutation(saveSessionPracticeReflection),
      saveSessionGoalCheckins: guardMutation(saveSessionGoalCheckins),
      addDiscipline: guardMutation(addDiscipline),
      editDiscipline: guardMutation(editDiscipline),
      removeDiscipline: guardMutation(removeDiscipline),
      addElement: guardMutation(addElement),
      setElementStatus: guardMutation(setElementStatus),
      removeElement: guardMutation(removeElement),
      addRoutine: guardMutation(addRoutine),
      editRoutine: guardMutation(editRoutine),
      removeRoutine: guardMutation(removeRoutine),
      addChoreographyVersion: guardMutation(addChoreographyVersion),
      editChoreographyVersion: guardMutation(editChoreographyVersion),
      addPracticeVideo: guardMutation(addPracticeVideo),
      addShow: guardMutation(addShow),
      editShow: guardMutation(editShow),
      removeShow: guardMutation(removeShow),
      addEventEntry: guardMutation(addEventEntry),
      editEventEntry: guardMutation(editEventEntry),
      removeEventEntry: guardMutation(removeEventEntry),
      addScrapbookEntry: guardMutation(addScrapbookEntry),
      addScrapbookReaction,
      removeScrapbookEntry: guardMutation(removeScrapbookEntry),
      addStickers: guardMutation(addStickers),
      addCustomSticker: guardMutation(addCustomSticker),
      logPracticeDay: guardMutation(logPracticeDay),
      updateDancerProfile: guardMutation(updateDancerProfileFn),
      addGoal: guardMutation(addGoal),
      completeGoal: guardMutation(completeGoal),
      setCurrentFocus: guardMutation(setCurrentFocus),
      addDancerDiscipline: guardMutation(addDancerDiscipline),
      editDancerDiscipline: guardMutation(editDancerDiscipline),
      removeDancerDiscipline: guardMutation(removeDancerDiscipline),
      addDancerJourneyEvent: guardMutation(addDancerJourneyEvent),
      editDancerJourneyEvent: guardMutation(editDancerJourneyEvent),
      removeDancerJourneyEvent: guardMutation(removeDancerJourneyEvent),
      updateSettings: guardMutation(updateSettingsFn),
      resetState,
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
