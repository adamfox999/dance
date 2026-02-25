import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { loadFile } from '../utils/fileStorage'
import { formatDate as formatUiDate, formatDateWithWeekday } from '../utils/helpers'
import { getEventTypeIcon, getEventTypeLabel } from '../data/aedEvents'
import { fetchStateFromBackend } from '../utils/backendApi'
import { notify } from '../utils/notify'
import styles from './Timeline.module.css'

function formatDate(dateStr) {
  return formatUiDate(dateStr)
}

function dateValueToMs(value) {
  const time = new Date(value).getTime()
  return Number.isFinite(time) ? time : 0
}

function getSessionDate(session = {}) {
  return session.scheduledAt || session.completedAt || session.date || ''
}

function getPracticeVideoDate(video = {}) {
  return video.recordedAt || video.date || ''
}

function formatRehearsalTitle(dateStr) {
  const label = formatDateWithWeekday(dateStr)
  if (label === '—') return 'Rehearsal'
  return `${label} rehearsal`
}

function formatOrdinalPlace(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return ''
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  const mod10 = n % 10
  if (mod10 === 1) return `${n}st`
  if (mod10 === 2) return `${n}nd`
  if (mod10 === 3) return `${n}rd`
  return `${n}th`
}

function isPast(dateStr) {
  const time = new Date(dateStr).getTime()
  if (!Number.isFinite(time)) return false
  return time < new Date(new Date().toISOString().split('T')[0]).getTime()
}

const SESSION_ICONS = {
  'solo-practice': '💪',
  'private-lesson': '👩‍🏫',
  'class': '🏫',
  'show': '🎭',
  'exam': '🎓',
  'practice': '💪',
  'lesson': '👩‍🏫',
  'competition': '🏆',
}

const SESSION_TYPE_LABELS = {
  'solo-practice': 'Solo Practice',
  'private-lesson': 'Private Lesson',
  class: 'Class',
  show: 'Show',
  exam: 'Exam',
  practice: 'Practice',
  lesson: 'Lesson',
  competition: 'Competition',
}

function getStartOfLocalDayMs(dateStr) {
  if (typeof dateStr !== 'string' || !dateStr.trim()) return null
  const [yearRaw, monthRaw, dayRaw] = dateStr.split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null
  return new Date(year, month - 1, day, 0, 0, 0, 0).getTime()
}

function getSessionStartMs(dateStr, startTime = '') {
  const startOfDayMs = getStartOfLocalDayMs(dateStr)
  if (!Number.isFinite(startOfDayMs)) return null

  if (typeof startTime !== 'string' || !startTime.trim()) return startOfDayMs

  const [hourRaw, minuteRaw] = startTime.split(':')
  const hours = Number.parseInt(hourRaw, 10)
  const minutes = Number.parseInt(minuteRaw, 10)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return startOfDayMs

  const [yearRaw, monthRaw, dayRaw] = dateStr.split('-')
  const year = Number.parseInt(yearRaw, 10)
  const month = Number.parseInt(monthRaw, 10)
  const day = Number.parseInt(dayRaw, 10)
  return new Date(year, month - 1, day, hours, minutes, 0, 0).getTime()
}

function hasSessionStarted(session = {}, fallbackDate = '') {
  const dateStr = getSessionDate(session) || fallbackDate
  const startMs = getSessionStartMs(dateStr, session.startTime || session.time || '')
  if (!Number.isFinite(startMs)) return false
  return Date.now() >= startMs
}

const JOURNEY_EVENT_META = {
  class: { icon: '🏫', label: 'Class' },
  'private-lesson': { icon: '👩‍🏫', label: 'Private lesson' },
  'exam-goal': { icon: '🎯', label: 'Exam goal' },
  'exam-result': { icon: '🎓', label: 'Exam result' },
}

const posterFileTaskByKey = new Map()
const posterUrlByKey = new Map()
const posterUrlRefCountByKey = new Map()

function retainPosterUrl(key) {
  if (!key) return
  const currentCount = posterUrlRefCountByKey.get(key) || 0
  posterUrlRefCountByKey.set(key, currentCount + 1)
}

function releasePosterUrl(key) {
  if (!key) return
  const currentCount = posterUrlRefCountByKey.get(key) || 0
  if (currentCount <= 1) {
    posterUrlRefCountByKey.delete(key)
    const url = posterUrlByKey.get(key)
    if (url) {
      URL.revokeObjectURL(url)
      posterUrlByKey.delete(key)
    }
    return
  }

  posterUrlRefCountByKey.set(key, currentCount - 1)
}

function getPosterFileTask(key) {
  let task = posterFileTaskByKey.get(key)
  if (!task) {
    task = loadFile(key)
      .catch(() => null)
      .finally(() => {
        posterFileTaskByKey.delete(key)
      })
    posterFileTaskByKey.set(key, task)
  }
  return task
}

async function getPosterUrlForKey(key) {
  if (!key) return ''
  const existingUrl = posterUrlByKey.get(key)
  if (existingUrl) return existingUrl

  const file = await getPosterFileTask(key)
  if (!file?.blob) return ''

  const objectUrl = URL.createObjectURL(file.blob)
  posterUrlByKey.set(key, objectUrl)
  return objectUrl
}

function getShareableVideoSrc(value) {
  if (typeof value !== 'string') return ''
  const src = value.trim()
  if (!src) return ''
  if (src.startsWith('blob:')) return ''
  if (src.startsWith('file:')) return ''
  return src
}

function SessionVideoPoster({ rehearsalVideoKey, rehearsalVideoName, videoSrc, className, fallback = null, isLoading = false }) {
  const [videoUrl, setVideoUrl] = useState('')
  const [allowProvidedSrc, setAllowProvidedSrc] = useState(true)

  useEffect(() => {
    setAllowProvidedSrc(true)
  }, [videoSrc])

  useEffect(() => {
    // Wait for hydration so effectiveOwnerId returns the correct user (guardian fix)
    if (isLoading) return
    let mounted = true
    let retainedPosterKey = ''

    const safeVideoSrc = allowProvidedSrc ? getShareableVideoSrc(videoSrc) : ''

    if (safeVideoSrc) {
      setVideoUrl(safeVideoSrc)
      return () => {}
    }

    const loadPoster = async () => {
      if (!rehearsalVideoKey) {
        setVideoUrl('')
        return
      }

      try {
        const cachedPosterUrl = await getPosterUrlForKey(rehearsalVideoKey)
        if (!mounted || !cachedPosterUrl) {
          if (mounted) setVideoUrl('')
          return
        }

        retainPosterUrl(rehearsalVideoKey)
        retainedPosterKey = rehearsalVideoKey
        setVideoUrl(cachedPosterUrl)
      } catch {
        if (mounted) setVideoUrl('')
      }
    }

    loadPoster()

    return () => {
      mounted = false
      if (retainedPosterKey) releasePosterUrl(retainedPosterKey)
    }
  }, [rehearsalVideoKey, videoSrc, isLoading, allowProvidedSrc])

  if (!videoUrl) return fallback

  return (
    <video
      className={className || styles.cardThumb}
      src={videoUrl}
      preload="metadata"
      muted
      playsInline
      onLoadedData={(e) => {
        e.currentTarget.currentTime = 0
        e.currentTarget.pause()
      }}
      onError={() => {
        if (rehearsalVideoKey && allowProvidedSrc) {
          setAllowProvidedSrc(false)
          return
        }
        setVideoUrl('')
      }}
      title={rehearsalVideoName || 'Practice video'}
    />
  )
}

function getVideoPreviewSource(video = {}) {
  const firstValid = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || ''
  return {
    key: firstValid(video.rehearsalVideoKey, video.videoKey, video.key),
    src: getShareableVideoSrc(firstValid(video.content, video.videoUrl, video.url, video.src)),
    name: firstValid(video.rehearsalVideoName, video.videoName, video.fileName, video.name),
  }
}

export default function Timeline() {
  const { type, id } = useParams()
  const {
    disciplines, routines, sessions, events,
    kidProfiles,
    dancerDisciplines,
    dancerJourneyEvents,
    setSessionReflection, setElementStatus, scheduleRehearsal, editSession, removeSession, addEventEntry, editEventEntry, addShow,
    addDancerDiscipline, addDancerJourneyEvent,
    editRoutine,
    isAdmin, isKidMode, isLoading,
    hasSupabaseAuth,
    authUser,
    ownKidProfiles,
    outgoingShares, createShareInvite, loadShares,
    incomingShares,
    fetchPartnerKids, updateSharePartnerKids,
  } = useApp()
  const navigate = useNavigate()
  const nowRef = useRef(null)
  const [reflectingSession, setReflectingSession] = useState(null)
  const [feeling, setFeeling] = useState('')
  const [note, setNote] = useState('')
  const [editingSessionId, setEditingSessionId] = useState(null)
  const [editSessionDate, setEditSessionDate] = useState('')
  const [editSessionStartTime, setEditSessionStartTime] = useState('')
  const [editSessionEndTime, setEditSessionEndTime] = useState('')
  const [editSessionWith, setEditSessionWith] = useState('')
  const [editSessionVersionId, setEditSessionVersionId] = useState('')
  const [isSessionSaving, setIsSessionSaving] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addType, setAddType] = useState('practice')
  const [addDate, setAddDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [addPracticeStartTime, setAddPracticeStartTime] = useState('')
  const [addPracticeEndTime, setAddPracticeEndTime] = useState('')
  const [addPracticeWith, setAddPracticeWith] = useState('')
  const [addVersionId, setAddVersionId] = useState('')
  const [addShowName, setAddShowName] = useState('')
  const [addShowVenue, setAddShowVenue] = useState('')
  const [addShowPlace, setAddShowPlace] = useState('')
  const [addEventId, setAddEventId] = useState('')
  const [addEntryDate, setAddEntryDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [addEntryTime, setAddEntryTime] = useState('')
  const [addJourneyDisciplineId, setAddJourneyDisciplineId] = useState('')
  const [addJourneyDisciplineName, setAddJourneyDisciplineName] = useState('')
  const [addJourneyTitle, setAddJourneyTitle] = useState('')
  const [addJourneyDetails, setAddJourneyDetails] = useState('')
  const [lightbox, setLightbox] = useState(null) // { media: [...], index: N }

  // Share state
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState(null)
  const [shareLink, setShareLink] = useState(null)
  const [partnerKidsMap, setPartnerKidsMap] = useState({}) // { shareId: [kid, ...] }
  const [tagBusy, setTagBusy] = useState(false)
  const [sharedOwnerKids, setSharedOwnerKids] = useState([])

  // Determine what we're showing a timeline for
  const isDiscipline = type === 'discipline'
  const isRoutine = type === 'routine'
  const isDancer = type === 'dancer'

  const discipline = isDiscipline ? disciplines.find(d => d.id === id) : null
  const routine = isRoutine ? routines.find(r => r.id === id) : null
  const dancer = isDancer ? (kidProfiles || []).find((kid) => kid.id === id) : null
  const routineVersions = useMemo(
    () => routine?.choreographyVersions || [],
    [routine]
  )

  const visibleDancerDisciplines = useMemo(() => {
    if (!isDancer) return []
    return (dancerDisciplines || []).filter((item) => item.kidProfileId === id)
  }, [isDancer, dancerDisciplines, id])

  const visibleDancerJourneyEvents = useMemo(() => {
    if (!isDancer) return []
    return (dancerJourneyEvents || []).filter((item) => item.kidProfileId === id)
  }, [isDancer, dancerJourneyEvents, id])

  const dancerDisciplineById = useMemo(() => {
    const index = {}
    visibleDancerDisciplines.forEach((item) => {
      index[item.id] = item
    })
    return index
  }, [visibleDancerDisciplines])

  const title = isDiscipline
    ? `${discipline?.icon || ''} ${discipline?.name || 'Discipline'}`
    : isRoutine
      ? `🎵 ${routine?.name || 'Routine'}`
      : `${dancer?.avatar_emoji || '🧒'} ${dancer?.display_name || 'Dancer'} Journey`

  // Filter sessions for this context
  const filteredSessions = useMemo(() => {
    return [...(sessions || [])]
      .filter(s => {
        if (isDiscipline) return s.disciplineId === id
        if (isRoutine) return s.routineId === id
        return false
      })
      .sort((a, b) => dateValueToMs(getSessionDate(b)) - dateValueToMs(getSessionDate(a))) // newest first
  }, [sessions, id, isDiscipline, isRoutine])

  // For routines, also get practice videos
  const practiceVideos = !isRoutine || !routine
    ? []
    : [...(routine.practiceVideos || [])]
        .sort((a, b) => dateValueToMs(getPracticeVideoDate(b)) - dateValueToMs(getPracticeVideoDate(a)))

  // Related shows (for routines)
  const relatedShows = useMemo(() => {
    if (!isRoutine) return []
    return (events || [])
      .filter(s => (s.entries || []).some(e => e.routineId === id))
      .sort((a, b) => dateValueToMs(b.startDate || b.date) - dateValueToMs(a.startDate || a.date))
  }, [events, id, isRoutine])

  const isRoutineQualified = useMemo(() => {
    if (!isRoutine) return false
    return (events || []).some((eventItem) =>
      (eventItem.entries || []).some((entry) => entry.routineId === id && entry.qualified)
    )
  }, [events, id, isRoutine])

  // All events available to link an entry to (for the add dialog)
  const availableEvents = useMemo(() => {
    return (events || [])
      .filter((eventItem) => (eventItem.eventType || 'show') !== 'show')
      .sort((a, b) => dateValueToMs(a.startDate || a.date) - dateValueToMs(b.startDate || b.date))
  }, [events])

  // Merge all events into a single timeline
  const timelineItems = (() => {
    const items = []

    filteredSessions.forEach(s => {
      items.push({ type: 'session', date: getSessionDate(s), data: s })
    })

    practiceVideos.forEach(v => {
      items.push({ type: 'video', date: getPracticeVideoDate(v), data: v })
    })

    relatedShows.forEach(s => {
      const entry = (s.entries || []).find(e => e.routineId === id)
      const subEventDate = entry?.scheduledDate || s.startDate || s.date
      items.push({ type: 'show', date: subEventDate, data: s })
    })

    visibleDancerJourneyEvents.forEach((journeyEvent) => {
      items.push({ type: 'journey', date: journeyEvent.eventDate, data: journeyEvent })
    })

    // Sort newest first
    items.sort((a, b) => dateValueToMs(b.date) - dateValueToMs(a.date))
    return items
  })()

  // Discipline elements (for discipline view)
  const elements = isDiscipline ? (discipline?.elements || []) : []

  // Scroll to NOW on mount
  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  useEffect(() => {
    if (!isRoutine) return
    if (!addVersionId && routineVersions.length) {
      setAddVersionId(routineVersions[routineVersions.length - 1].id)
    }
  }, [isRoutine, addVersionId, routineVersions])

  useEffect(() => {
    if (!addDialogOpen || addType !== 'event-entry') return
    if (!availableEvents.length) {
      if (addEventId) setAddEventId('')
      return
    }
    if (!addEventId || !availableEvents.some((eventItem) => eventItem.id === addEventId)) {
      setAddEventId(availableEvents[0].id)
    }
  }, [addDialogOpen, addType, addEventId, availableEvents])

  useEffect(() => {
    if (!addDialogOpen) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAddDialogOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [addDialogOpen])

  const handleSubmitReflection = (sessionId) => {
    if (!feeling && !note) return
    setSessionReflection(sessionId, { feeling, note })
    setReflectingSession(null)
    setFeeling('')
    setNote('')
  }

  const handleElementStatus = (elementId, status) => {
    setElementStatus(id, elementId, status)
  }

  const openAddDialog = () => {
    if (!isAdmin) return
    if (!isRoutine && !isDancer) return
    if (isRoutine && !routine) return
    if (isDancer && !dancer) return
    setAddType(isDancer ? (visibleDancerDisciplines.length > 0 ? 'class' : 'discipline') : 'practice')
    setAddDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setAddPracticeStartTime('')
    setAddPracticeEndTime('')
    setAddPracticeWith('')
    setAddVersionId(routineVersions[routineVersions.length - 1]?.id || '')
    setAddShowName(`${routine?.name || ''} show`)
    setAddShowVenue('')
    setAddShowPlace('')
    setAddEventId(availableEvents[0]?.id || '')
    setAddEntryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setAddEntryTime('')
    setAddJourneyDisciplineId(visibleDancerDisciplines[0]?.id || '')
    setAddJourneyDisciplineName('')
    setAddJourneyTitle('')
    setAddJourneyDetails('')
    setShareMsg(null)
    setShareLink(null)
    setAddDialogOpen(true)
    // Load partner kids for accepted shares of this routine
    if (isRoutine) loadPartnerKidsForRoutine()
  }

  useEffect(() => {
    if (!addDialogOpen || !isDancer || addType === 'discipline') return
    if (!visibleDancerDisciplines.length) {
      if (addJourneyDisciplineId) setAddJourneyDisciplineId('')
      return
    }
    if (!addJourneyDisciplineId || !visibleDancerDisciplines.some((item) => item.id === addJourneyDisciplineId)) {
      setAddJourneyDisciplineId(visibleDancerDisciplines[0].id)
    }
  }, [addDialogOpen, isDancer, addType, addJourneyDisciplineId, visibleDancerDisciplines])

  // Shares for THIS routine
  const routineShares = useMemo(() => {
    return outgoingShares.filter(
      s => s.routine_id === id || (!s.routine_id && s.status === 'accepted')
    )
  }, [outgoingShares, id])

  const acceptedIncomingShare = useMemo(() => {
    const accepted = (incomingShares || []).filter((share) => {
      if (share.status !== 'accepted') return false
      if (share.routine_id) return share.routine_id === id
      return true
    })
    return accepted.find((share) => share.routine_id === id) || accepted[0] || null
  }, [incomingShares, id])

  const isSharedRecipientRoutine = Boolean(
    isRoutine
      && acceptedIncomingShare
      && authUser?.id
      && acceptedIncomingShare.owner_user_id !== authUser.id
  )

  const recipientTaggedKids = Array.isArray(acceptedIncomingShare?.partner_kid_ids)
    ? acceptedIncomingShare.partner_kid_ids
    : []
  const ownAssignedKidIds = Array.isArray(routine?.kidProfileIds) ? routine.kidProfileIds : []
  const ownAssignedKids = (ownKidProfiles || []).filter((kid) => ownAssignedKidIds.includes(kid.id))
  const ownUnassignedKids = (ownKidProfiles || []).filter((kid) => !ownAssignedKidIds.includes(kid.id))
  const recipientTaggedProfiles = (ownKidProfiles || []).filter((kid) => recipientTaggedKids.includes(kid.id))
  const recipientUntaggedKids = (ownKidProfiles || []).filter((kid) => !recipientTaggedKids.includes(kid.id))
  const ownerRoutineTaggedKids = (sharedOwnerKids || []).filter((kid) => ownAssignedKidIds.includes(kid.id))

  useEffect(() => {
    if (!isSharedRecipientRoutine || !acceptedIncomingShare?.owner_user_id) {
      setSharedOwnerKids([])
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const kids = await fetchPartnerKids(acceptedIncomingShare.owner_user_id)
        if (!cancelled) setSharedOwnerKids(kids || [])
      } catch {
        if (!cancelled) setSharedOwnerKids([])
      }
    })()
    return () => { cancelled = true }
  }, [isSharedRecipientRoutine, acceptedIncomingShare?.owner_user_id, fetchPartnerKids])

  const toggleOwnKidOnRoutineTop = async (kidId) => {
    if (!isAdmin) return
    if (!routine?.id) return
    const current = Array.isArray(routine.kidProfileIds) ? routine.kidProfileIds : []
    const updated = current.includes(kidId)
      ? current.filter((idValue) => idValue !== kidId)
      : [...current, kidId]
    setTagBusy(true)
    try {
      await editRoutine(routine.id, { kidProfileIds: updated })
    } catch (err) {
      notify(err?.message || 'Could not update dancers for this routine.')
    } finally {
      setTagBusy(false)
    }
  }

  const toggleRecipientKidTagTop = async (kidId) => {
    if (!isAdmin) return
    if (!acceptedIncomingShare?.id) return
    const updated = recipientTaggedKids.includes(kidId)
      ? recipientTaggedKids.filter((idValue) => idValue !== kidId)
      : [...recipientTaggedKids, kidId]
    setTagBusy(true)
    try {
      await updateSharePartnerKids(acceptedIncomingShare.id, updated)
    } catch (err) {
      notify(err?.message || 'Could not tag your child on this shared dance.')
    } finally {
      setTagBusy(false)
    }
  }

  const loadPartnerKidsForRoutine = async () => {
    const accepted = outgoingShares.filter(
      s => s.status === 'accepted' && s.invited_user_id &&
        (s.routine_id === id || !s.routine_id)
    )
    const map = {}
    await Promise.all(
      accepted.map(async (share) => {
        try {
          const kids = await fetchPartnerKids(share.invited_user_id)
          map[share.id] = kids
        } catch {
          map[share.id] = []
        }
      })
    )
    setPartnerKidsMap(prev => ({ ...prev, ...map }))
  }

  const handleShareInvite = async () => {
    setShareBusy(true)
    setShareMsg(null)
    setShareLink(null)
    try {
      const res = await fetchStateFromBackend()
      if (!res?.danceData?.id) throw new Error('No dance data found to share.')
      const share = await createShareInvite({
        danceId: res.danceData.id,
        routineId: id,
      })
      const link = `${window.location.origin}${window.location.pathname}?share=${share.invite_token}`
      setShareLink(link)
      setShareMsg({ type: 'success', text: 'Share link created!' })
      await loadShares()
    } catch (err) {
      setShareMsg({ type: 'error', text: err?.message || 'Could not create invite link' })
    } finally {
      setShareBusy(false)
    }
  }

  const handleCopyShareLink = async (value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setShareMsg({ type: 'success', text: 'Link copied!' })
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setShareMsg({ type: 'success', text: 'Link copied!' })
    }
  }

  const handleTogglePartnerKid = async (shareId, kidId) => {
    if (!isAdmin) return
    const share = outgoingShares.find(s => s.id === shareId)
    if (!share) return
    const current = share.partner_kid_ids || []
    const updated = current.includes(kidId)
      ? current.filter(k => k !== kidId)
      : [...current, kidId]
    try {
      await updateSharePartnerKids(shareId, updated)
    } catch (err) {
      console.warn('Failed to update partner kids:', err)
    }
  }

  const handleAddTimelineItem = async () => {
    if (!isRoutine && !isDancer) return

    try {
      if (isRoutine && addType === 'practice') {
        if (!routine) return
        if (!addDate) {
          notify('Please select a practice date.')
          return
        }
        const versionId = addVersionId || routineVersions[routineVersions.length - 1]?.id || null
        await scheduleRehearsal({
          date: addDate,
          scheduledAt: addDate,
          startTime: addPracticeStartTime,
          endTime: addPracticeEndTime,
          with: addPracticeWith.trim(),
          title: addPracticeWith.trim() ? `Practice with ${addPracticeWith.trim()}` : `${routine.name} rehearsal`,
          routineId: routine.id,
          disciplineId: routine.disciplineId || null,
          choreographyVersionId: versionId,
          status: 'scheduled',
        })
      } else if (isRoutine && addType === 'event-entry') {
        if (!routine) return
        if (!addEventId) {
          notify('Please select an event first.')
          return
        }
        const selectedEvent = (events || []).find((eventItem) => eventItem.id === addEventId)
        if (!selectedEvent) {
          notify('Selected event is no longer available. Please pick another one.')
          return
        }
        const existingEntry = (selectedEvent?.entries || []).find((entry) => entry.routineId === routine.id)
        if (existingEntry) {
          await editEventEntry(addEventId, existingEntry.id, {
            scheduledDate: addEntryDate || existingEntry.scheduledDate || '',
            scheduledTime: addEntryTime || existingEntry.scheduledTime || '',
          })
          notify('This routine was already entered, so the existing entry was updated.')
          setAddDialogOpen(false)
          return
        }

        await addEventEntry(addEventId, {
          routineId: routine.id,
          scheduledDate: addEntryDate || '',
          scheduledTime: addEntryTime || '',
          place: null,
          qualified: false,
          qualifiedForEventId: '',
          notes: '',
        })
      } else if (isRoutine && addType === 'show') {
        if (!routine) return
        if (!addDate) {
          notify('Please select a show date.')
          return
        }
        const parsedPlace = Number.parseInt(addShowPlace, 10)
        const place = Number.isFinite(parsedPlace) && parsedPlace > 0 ? parsedPlace : null
        await addShow({
          name: addShowName.trim() || `${routine.name} show`,
          date: addDate,
          venue: addShowVenue.trim(),
          place,
          routineIds: [routine.id],
          scrapbookEntries: [],
        })
      } else if (isDancer && addType === 'discipline') {
        if (!dancer?.id) return
        const nextName = addJourneyDisciplineName.trim()
        if (!nextName) {
          notify('Please enter a discipline name.')
          return
        }
        const created = await addDancerDiscipline({
          kidProfileId: dancer.id,
          name: nextName,
          icon: '💃',
        })
        if (created?.id) {
          setAddJourneyDisciplineId(created.id)
        }
      } else if (isDancer && JOURNEY_EVENT_META[addType]) {
        if (!dancer?.id) return
        if (!addDate) {
          notify('Please select a date.')
          return
        }
        if (!addJourneyDisciplineId) {
          notify('Please select a discipline first.')
          return
        }
        const nextTitle = addJourneyTitle.trim()
        if (!nextTitle) {
          notify('Please enter a title.')
          return
        }
        await addDancerJourneyEvent({
          kidProfileId: dancer.id,
          disciplineId: addJourneyDisciplineId,
          eventType: addType,
          title: nextTitle,
          details: addJourneyDetails.trim(),
          eventDate: addDate,
        })
      } else {
        return
      }

      setAddDialogOpen(false)
    } catch (err) {
      notify(err?.message || 'Could not save timeline item. Please try again.')
    }
  }

  const openSessionEditor = (session) => {
    if (!session?.id) return
    const fallbackDate = typeof session.scheduledAt === 'string' ? session.scheduledAt.slice(0, 10) : ''
    const fallbackVersionId = session.choreographyVersionId || routineVersions[routineVersions.length - 1]?.id || ''
    setEditingSessionId(session.id)
    setEditSessionDate(session.date || fallbackDate || '')
    setEditSessionStartTime(session.startTime || session.time || '')
    setEditSessionEndTime(session.endTime || '')
    setEditSessionWith(session.with || '')
    setEditSessionVersionId(fallbackVersionId)
  }

  const closeSessionEditor = () => {
    setEditingSessionId(null)
    setEditSessionDate('')
    setEditSessionStartTime('')
    setEditSessionEndTime('')
    setEditSessionWith('')
    setEditSessionVersionId('')
    setIsSessionSaving(false)
  }

  const handleSaveSessionSchedule = async () => {
    if (!editingSessionId) return
    if (!editSessionDate) {
      notify('Please select a practice date.')
      return
    }
    setIsSessionSaving(true)
    try {
      await editSession(editingSessionId, {
        scheduledAt: editSessionDate,
        startTime: editSessionStartTime,
        endTime: editSessionEndTime,
        with: editSessionWith.trim(),
        choreographyVersionId: editSessionVersionId || null,
      })
      closeSessionEditor()
    } catch (err) {
      notify(err?.message || 'Could not update session schedule.')
    } finally {
      setIsSessionSaving(false)
    }
  }

  const handleDeleteSession = async (sessionId) => {
    if (!sessionId) return
    const confirmed = window.confirm('Delete this practice session? This cannot be undone.')
    if (!confirmed) return
    try {
      await removeSession(sessionId)
      if (editingSessionId === sessionId) closeSessionEditor()
    } catch (err) {
      notify(err?.message || 'Could not delete session.')
    }
  }

  const getSessionVersion = (session) => {
    if (!isRoutine || !routine) return null
    const versions = routine.choreographyVersions || []
    const version = versions.find((versionItem) => versionItem.id === session.choreographyVersionId)
      || versions[versions.length - 1]
      || null
    if (!version) return null
    return {
      version,
      versionIndex: versions.findIndex((versionItem) => versionItem.id === version.id),
    }
  }

  const today = new Date().toISOString().split('T')[0]
  let nowInserted = false

  return (
    <div className={styles.timelinePage}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate('/')}>←</button>
        <div>
          <h1 className={styles.title}>{title}</h1>
          {isDiscipline && discipline && (
            <p className={styles.subtitle}>{discipline.currentGrade}</p>
          )}
          {isRoutine && routine && (
            <p className={styles.subtitle}>
              {routine.formation} · {routine.type}
              {isRoutineQualified && (
                <span className={styles.eventTypeTag}>
                  <span className={styles.eventTypeQualifiedTick}>✓</span>
                  AED Qualified
                </span>
              )}
            </p>
          )}
          {isDancer && dancer && (
            <p className={styles.subtitle}>Personal journey timeline</p>
          )}
        </div>
        {isAdmin && ((isRoutine && routine) || (isDancer && dancer)) && (
          <button
            className={styles.addBtn}
            onClick={openAddDialog}
            aria-label="Add timeline item"
            title="Add to timeline"
          >
            +
          </button>
        )}
      </div>

      {isAdmin && isRoutine && routine && !isSharedRecipientRoutine && (ownKidProfiles || []).length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ownAssignedKids.map((kid) => (
              <button
                key={kid.id}
                type="button"
                disabled={tagBusy}
                onClick={() => toggleOwnKidOnRoutineTop(kid.id)}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  border: '1px solid #a78bfa', background: '#ede9fe', color: '#6d28d9',
                  cursor: tagBusy ? 'wait' : 'pointer',
                }}
              >
                {kid.avatar_emoji} {kid.display_name}
              </button>
            ))}
            {ownUnassignedKids.map((kid) => (
              <button
                key={`add-own-kid-${kid.id}`}
                type="button"
                disabled={tagBusy}
                onClick={() => toggleOwnKidOnRoutineTop(kid.id)}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  border: '1px dashed #9ca3af', background: '#fff', color: '#374151',
                  cursor: tagBusy ? 'wait' : 'pointer',
                }}
              >
                + Add {kid.display_name} to this dance
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && isRoutine && routine && editingSessionId && (
        <div className={styles.addDialogBackdrop} onClick={closeSessionEditor}>
          <div
            className={styles.addDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Edit practice session"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.addDialogHeader}>
              <h3>Edit practice session</h3>
              <button className={styles.addDialogClose} onClick={closeSessionEditor} disabled={isSessionSaving}>✕</button>
            </div>

            <div className={styles.addField}>
              <label>Date</label>
              <input
                type="date"
                value={editSessionDate}
                onChange={(event) => setEditSessionDate(event.target.value)}
              />
            </div>
            <div className={styles.addField}>
              <label>Start time (optional)</label>
              <input
                type="time"
                value={editSessionStartTime}
                onChange={(event) => setEditSessionStartTime(event.target.value)}
              />
            </div>
            <div className={styles.addField}>
              <label>End time (optional)</label>
              <input
                type="time"
                value={editSessionEndTime}
                onChange={(event) => setEditSessionEndTime(event.target.value)}
              />
            </div>
            <div className={styles.addField}>
              <label>Who with? (optional)</label>
              <input
                type="text"
                value={editSessionWith}
                onChange={(event) => setEditSessionWith(event.target.value)}
                placeholder="e.g. Miss Leanne"
              />
            </div>
            <div className={styles.addField}>
              <label>Choreography version</label>
              <select
                value={editSessionVersionId}
                onChange={(event) => setEditSessionVersionId(event.target.value)}
              >
                {routineVersions.map((version, versionIndex) => (
                  <option key={version.id} value={version.id}>
                    v{versionIndex + 1}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.addDialogActions}>
              <button
                className={styles.addDialogCancel}
                onClick={() => handleDeleteSession(editingSessionId)}
                disabled={isSessionSaving}
                style={{ marginRight: 'auto', borderColor: '#fecaca', color: '#b91c1c' }}
              >
                Delete
              </button>
              <button className={styles.addDialogCancel} onClick={closeSessionEditor} disabled={isSessionSaving}>
                Cancel
              </button>
              <button className={styles.addDialogSave} onClick={handleSaveSessionSchedule} disabled={isSessionSaving}>
                {isSessionSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {isAdmin && isRoutine && routine && isSharedRecipientRoutine && (ownKidProfiles || []).length > 0 && (
        <div style={{ marginTop: 4, marginBottom: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ownerRoutineTaggedKids.map((kid) => (
              <span
                key={`owner-tagged-${kid.id}`}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  border: '1px solid #a78bfa', background: '#ede9fe', color: '#6d28d9',
                }}
              >
                {kid.avatar_emoji} {kid.display_name}
              </span>
            ))}
            {recipientTaggedProfiles.map((kid) => (
              <button
                key={kid.id}
                type="button"
                disabled={tagBusy}
                onClick={() => toggleRecipientKidTagTop(kid.id)}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  border: '1px solid #60a5fa', background: '#dbeafe', color: '#1e40af',
                  cursor: tagBusy ? 'wait' : 'pointer',
                }}
              >
                {kid.avatar_emoji} {kid.display_name}
              </button>
            ))}
            {recipientUntaggedKids.map((kid) => (
              <button
                key={`add-recipient-kid-${kid.id}`}
                type="button"
                disabled={tagBusy}
                onClick={() => toggleRecipientKidTagTop(kid.id)}
                style={{
                  padding: '2px 8px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 700,
                  border: '1px dashed #60a5fa', background: '#eff6ff', color: '#1d4ed8',
                  cursor: tagBusy ? 'wait' : 'pointer',
                }}
              >
                + Add {kid.display_name} to this dance
              </button>
            ))}
          </div>
        </div>
      )}

      {isAdmin && addDialogOpen && ((isRoutine && routine) || (isDancer && dancer)) && (
        <div className={styles.addDialogBackdrop} onClick={() => setAddDialogOpen(false)}>
          <div
            className={styles.addDialog}
            role="dialog"
            aria-modal="true"
            aria-label="Add to timeline"
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.addDialogHeader}>
              <h3>Add to timeline</h3>
              <button className={styles.addDialogClose} onClick={() => setAddDialogOpen(false)}>✕</button>
            </div>

            <div className={styles.addTypeRow}>
              {isRoutine && (
                <>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'practice' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('practice')}
                  >
                    Practice
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'event-entry' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('event-entry')}
                  >
                    Event entry
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'show' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('show')}
                  >
                    Quick show
                  </button>
                  {hasSupabaseAuth && (
                    <button
                      className={`${styles.addTypeBtn} ${addType === 'share' ? styles.activeAddTypeBtn : ''}`}
                      onClick={() => setAddType('share')}
                    >
                      Share
                    </button>
                  )}
                </>
              )}
              {isDancer && (
                <>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'discipline' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('discipline')}
                  >
                    Discipline
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'class' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('class')}
                  >
                    Class
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'private-lesson' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('private-lesson')}
                  >
                    Private lesson
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'exam-goal' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('exam-goal')}
                  >
                    Exam goal
                  </button>
                  <button
                    className={`${styles.addTypeBtn} ${addType === 'exam-result' ? styles.activeAddTypeBtn : ''}`}
                    onClick={() => setAddType('exam-result')}
                  >
                    Exam result
                  </button>
                </>
              )}
            </div>

            {addType === 'practice' ? (
              <>
                <div className={styles.addField}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(event) => setAddDate(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Start time (optional)</label>
                  <input
                    type="time"
                    value={addPracticeStartTime}
                    onChange={(event) => setAddPracticeStartTime(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>End time (optional)</label>
                  <input
                    type="time"
                    value={addPracticeEndTime}
                    onChange={(event) => setAddPracticeEndTime(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Who with? (optional)</label>
                  <input
                    type="text"
                    value={addPracticeWith}
                    onChange={(event) => setAddPracticeWith(event.target.value)}
                    placeholder="e.g. Miss Leanne"
                  />
                </div>
                <div className={styles.addField}>
                  <label>Choreography version</label>
                  <select
                    value={addVersionId}
                    onChange={(event) => setAddVersionId(event.target.value)}
                  >
                    {routineVersions.map((version, versionIndex) => (
                      <option key={version.id} value={version.id}>
                        v{versionIndex + 1}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : addType === 'event-entry' ? (
              <>
                <div className={styles.addField}>
                  <label>Select event</label>
                  {availableEvents.length === 0 ? (
                    <p className={styles.addFieldHint}>No events yet — create one on the Calendar page first.</p>
                  ) : (
                    <select
                      value={addEventId}
                      onChange={(event) => setAddEventId(event.target.value)}
                    >
                      <option value="">Select an event…</option>
                      {availableEvents.map((ev) => (
                        <option key={ev.id} value={ev.id}>
                          {getEventTypeIcon(ev.eventType)} {ev.name} ({ev.startDate || ev.date})
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.addField}>
                  <label>Performance date</label>
                  <input
                    type="date"
                    value={addEntryDate}
                    onChange={(event) => setAddEntryDate(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Scheduled time (optional)</label>
                  <input
                    type="time"
                    value={addEntryTime}
                    onChange={(event) => setAddEntryTime(event.target.value)}
                  />
                </div>
              </>
            ) : addType === 'show' ? (
              <>
                <div className={styles.addField}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(event) => setAddDate(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Show name</label>
                  <input
                    type="text"
                    value={addShowName}
                    onChange={(event) => setAddShowName(event.target.value)}
                    placeholder="Show"
                  />
                </div>
                <div className={styles.addField}>
                  <label>Venue (optional)</label>
                  <input
                    type="text"
                    value={addShowVenue}
                    onChange={(event) => setAddShowVenue(event.target.value)}
                    placeholder="Venue"
                  />
                </div>
                <div className={styles.addField}>
                  <label>Place (optional)</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={addShowPlace}
                    onChange={(event) => setAddShowPlace(event.target.value)}
                    placeholder="e.g. 1"
                  />
                </div>
              </>
            ) : addType === 'share' ? (
              <>
                {/* Invite form */}
                <div className={styles.addField}>
                  <label>Invite a dance partner's parent</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles.addDialogSave}
                      onClick={handleShareInvite}
                      disabled={shareBusy}
                      style={{ margin: 0 }}
                    >
                      {shareBusy ? '…' : '🔗 Generate Link'}
                    </button>
                  </div>
                  {shareLink && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', border: '1px solid #bbf7d0' }}>
                      <input
                        readOnly
                        value={shareLink}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#166534', outline: 'none' }}
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        type="button"
                        onClick={() => handleCopyShareLink(shareLink)}
                        style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                      >
                        Copy
                      </button>
                    </div>
                  )}
                  {shareMsg && (
                    <p style={{ fontSize: '0.78rem', color: shareMsg.type === 'error' ? '#dc2626' : '#16a34a', fontWeight: 500, marginTop: 4 }}>
                      {shareMsg.text}
                    </p>
                  )}
                </div>

                {/* Accepted shares — partner kid selection */}
                {routineShares.filter(s => s.status === 'accepted').map(share => {
                  const kids = partnerKidsMap[share.id] || []
                  return (
                    <div key={share.id} className={styles.sharePartnerCard}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#374151', marginBottom: 6 }}>
                        📧 {share.invited_email || (share.invite_token ? 'Invite link' : 'Partner')}
                        <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#16a34a', fontWeight: 700 }}>✓ Joined</span>
                      </div>
                      {kids.length > 0 ? (
                        <>
                          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginBottom: 4 }}>Which of their kids are in this dance?</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {kids.map(kid => {
                              const assigned = (share.partner_kid_ids || []).includes(kid.id)
                              return (
                                <button
                                  key={kid.id}
                                  onClick={() => handleTogglePartnerKid(share.id, kid.id)}
                                  className={styles.partnerKidChip}
                                  style={{
                                    border: assigned ? '2px solid #7c3aed' : '1px solid #d1d5db',
                                    background: assigned ? '#ede9fe' : '#f9fafb',
                                    color: assigned ? '#7c3aed' : '#6b7280',
                                  }}
                                >
                                  {kid.avatar_emoji} {kid.display_name}
                                </button>
                              )
                            })}
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '0.72rem', color: '#9ca3af', fontStyle: 'italic' }}>
                          They haven't added their dancers yet.
                        </div>
                      )}
                    </div>
                  )
                })}

                {/* Pending shares */}
                {routineShares.filter(s => s.status === 'pending').map(share => (
                  <div key={share.id} className={styles.sharePartnerCard} style={{ opacity: 0.6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280', flex: 1 }}>
                        📧 {share.invited_email || 'Invite link'}
                        <span style={{ marginLeft: 8, fontSize: '0.7rem', color: '#92400e', fontWeight: 600 }}>⏳ Pending</span>
                      </div>
                      {share.invite_token && (
                        <button
                          onClick={() => handleCopyShareLink(`${window.location.origin}${window.location.pathname}?share=${share.invite_token}`)}
                          style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Copy Link
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {routineShares.length === 0 && (
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center', margin: '8px 0' }}>
                    No shares for this dance yet.
                  </p>
                )}
              </>
            ) : addType === 'discipline' ? (
              <>
                <div className={styles.addField}>
                  <label>Discipline name</label>
                  <input
                    type="text"
                    value={addJourneyDisciplineName}
                    onChange={(event) => setAddJourneyDisciplineName(event.target.value)}
                    placeholder="e.g. Ballet"
                  />
                </div>
              </>
            ) : JOURNEY_EVENT_META[addType] ? (
              <>
                <div className={styles.addField}>
                  <label>Discipline</label>
                  {visibleDancerDisciplines.length === 0 ? (
                    <p className={styles.addFieldHint}>Add a discipline first.</p>
                  ) : (
                    <select
                      value={addJourneyDisciplineId}
                      onChange={(event) => setAddJourneyDisciplineId(event.target.value)}
                    >
                      {visibleDancerDisciplines.map((disciplineItem) => (
                        <option key={disciplineItem.id} value={disciplineItem.id}>
                          {disciplineItem.icon} {disciplineItem.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                <div className={styles.addField}>
                  <label>Date</label>
                  <input
                    type="date"
                    value={addDate}
                    onChange={(event) => setAddDate(event.target.value)}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Title</label>
                  <input
                    type="text"
                    value={addJourneyTitle}
                    onChange={(event) => setAddJourneyTitle(event.target.value)}
                    placeholder={`e.g. ${JOURNEY_EVENT_META[addType].label}`}
                  />
                </div>
                <div className={styles.addField}>
                  <label>Details (optional)</label>
                  <input
                    type="text"
                    value={addJourneyDetails}
                    onChange={(event) => setAddJourneyDetails(event.target.value)}
                    placeholder="Anything important to remember"
                  />
                </div>
              </>
            ) : null}

            {addType !== 'share' && (
            <div className={styles.addDialogActions}>
              <button className={styles.addDialogCancel} onClick={() => setAddDialogOpen(false)}>
                Cancel
              </button>
              <button className={styles.addDialogSave} onClick={handleAddTimelineItem}>
                Add
              </button>
            </div>
            )}
          </div>
        </div>
      )}

      {/* Discipline elements */}
      {isDiscipline && elements.length > 0 && (
        <div className={styles.elementsSection}>
          <h3 className={styles.sectionLabel}>Elements</h3>
          <div className={styles.elementsList}>
            {elements.map(el => (
              <div key={el.id} className={`${styles.elementItem} ${styles[el.status]}`}>
                <span className={styles.elementName}>{el.name}</span>
                <div className={styles.elementButtons}>
                  {['learning', 'confident', 'mastered'].map(s => (
                    <button
                      key={s}
                      className={`${styles.statusBtn} ${el.status === s ? styles.activeStatus : ''}`}
                      onClick={() => handleElementStatus(el.id, s)}
                    >
                      {s === 'learning' ? '📖' : s === 'confident' ? '💪' : '⭐'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className={styles.timeline}>
        {timelineItems.length === 0 && (
          <div className={styles.empty}>
            <p>{isDancer ? 'No journey events yet — add the first milestone! ✨' : 'No events yet — start practising! 💃'}</p>
          </div>
        )}

        {timelineItems.map((item, index) => {
          // Insert NOW marker between past and future items
          const isNowItem = !nowInserted && item.date <= today
          if (isNowItem) nowInserted = true

          return (
            <div key={`${item.type}-${item.data.id}`}>
              {isNowItem && index > 0 && (
                <div ref={nowRef} className={styles.nowMarker}>
                  <span className={styles.nowDot} aria-label="Current moment marker" />
                </div>
              )}

              <div className={`${styles.timelineCard} ${isPast(item.date) ? styles.past : styles.future}`}>
                <div className={styles.cardDate}>{formatDate(item.date)}</div>

                {item.type === 'session' && (() => {
                  const sessionStarted = hasSessionStarted(item.data, item.date)
                  const sessionHasVideo = Boolean(item.data.rehearsalVideoKey)
                  const timeRange = [item.data.startTime || item.data.time || '', item.data.endTime || ''].filter(Boolean).join(' - ')
                  const sessionTitle = (item.data.title || '').trim() || formatRehearsalTitle(item.date)
                  const sessionLink = item.data.routineId
                    ? `/choreography/${item.data.routineId}?live=true&sessionId=${item.data.id}${sessionStarted && !sessionHasVideo ? '&openMedia=video' : ''}`
                    : ''

                  if (!sessionStarted) {
                    return (
                      <div
                        className={styles.cardBody}
                        onClick={() => {
                          if (isAdmin) openSessionEditor(item.data)
                        }}
                        style={isAdmin ? { cursor: 'pointer' } : undefined}
                      >
                        <span className={styles.cardIcon}>{SESSION_ICONS[item.data.type] || '📝'}</span>
                        <div className={styles.cardInfo}>
                          <div className={styles.cardTitle}>
                            {sessionTitle}
                            <span className={styles.eventTypeTag}>
                              {SESSION_TYPE_LABELS[item.data.type] || 'Practice'}
                            </span>
                          </div>
                          <div className={styles.entryDetails}>
                            <span>{timeRange ? `⏰ ${timeRange}` : '⏰ Session scheduled'}</span>
                            {item.data.with && <span>👥 with {item.data.with}</span>}
                          </div>
                        </div>
                        <span className={styles.cardArrow}>→</span>
                      </div>
                    )
                  }

                  return (
                    <div
                      className={styles.sessionMediaCard}
                      onClick={() => {
                        if (sessionLink) navigate(sessionLink)
                      }}
                      style={sessionLink ? { cursor: 'pointer' } : undefined}
                    >
                      {sessionHasVideo ? (
                        <>
                          <SessionVideoPoster
                            rehearsalVideoKey={item.data.rehearsalVideoKey}
                            rehearsalVideoName={item.data.rehearsalVideoName}
                            isLoading={isLoading}
                            className={styles.sessionMediaPoster}
                            fallback={(
                              <div className={styles.sessionMediaFallback}>
                                <div className={styles.sessionMediaPrompt}>
                                  <span className={styles.sessionMediaPromptTitle}>Add practice video</span>
                                  <span className={styles.sessionMediaPromptText}>Open Live View to upload</span>
                                </div>
                              </div>
                            )}
                          />
                        </>
                      ) : (
                        <div className={styles.sessionMediaFallback}>
                          <div className={styles.sessionMediaPrompt}>
                            <span className={styles.sessionMediaPromptTitle}>Add practice video</span>
                            <span className={styles.sessionMediaPromptText}>Open Live View to upload</span>
                          </div>
                        </div>
                      )}

                      {sessionLink && (
                        <div className={styles.sessionMediaCenterAlert}>
                          <button
                            className={styles.sessionMediaCenterAlertBtn}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(sessionLink)
                            }}
                            aria-label={sessionHasVideo ? 'Play video' : 'Add video'}
                            title={sessionHasVideo ? 'Play video' : 'Add video'}
                          >
                            <span
                              className={sessionHasVideo ? styles.sessionMediaCenterAlertIconPlay : styles.sessionMediaCenterAlertIconAdd}
                              aria-hidden="true"
                            >
                              {sessionHasVideo ? '▶' : '📹'}
                            </span>
                          </button>
                        </div>
                      )}

                      <div className={styles.sessionMediaOverlay}>
                        <div className={styles.sessionMediaInfo}>
                          <div className={styles.sessionMediaTitle}>{sessionTitle}</div>
                          {(() => {
                            const versionData = getSessionVersion(item.data)
                            const practiceMeta = [
                              timeRange ? `⏰ ${timeRange}` : '',
                              item.data.with ? `with ${item.data.with}` : '',
                            ].filter(Boolean).join(' · ')
                            if (!versionData && !practiceMeta) return null
                            return (
                              <div className={styles.sessionMediaNote}>
                                {versionData ? `Choreo: v${versionData.versionIndex + 1}` : ''}
                                {versionData && practiceMeta ? ' · ' : ''}
                                {practiceMeta}
                              </div>
                            )
                          })()}
                        </div>

                        <div className={styles.sessionMediaActions}>
                          {isAdmin && (
                            <div className={styles.sessionQuickActions}>
                              <button
                                className={styles.sessionQuickBtn}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openSessionEditor(item.data)
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className={`${styles.sessionQuickBtn} ${styles.sessionQuickDeleteBtn}`}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteSession(item.data.id)
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          )}

                          {item.data.dancerReflection?.feeling && (
                            <span className={styles.feelingBadge}>
                              {item.data.dancerReflection.feeling}
                            </span>
                          )}

                          {!item.data.dancerReflection?.feeling && isPast(item.date) && sessionHasVideo && (
                            <button
                              className={`${styles.reflectBtn} ${styles.reflectBtnOverlay}`}
                              onClick={(e) => {
                                e.stopPropagation()
                                setReflectingSession(item.data.id)
                              }}
                            >
                              How was it?
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })()}

                {item.type === 'video' && (
                  <div
                    className={styles.cardBody}
                    onClick={() => routine && navigate(`/choreography/${routine.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {(() => {
                      const preview = getVideoPreviewSource(item.data)
                      return (
                        <div className={styles.cardThumbWrap}>
                          <SessionVideoPoster
                            rehearsalVideoKey={preview.key}
                            rehearsalVideoName={preview.name}
                            videoSrc={preview.src}
                            isLoading={isLoading}
                            className={styles.cardThumb}
                            fallback={(
                              <div className={styles.sessionMediaFallback}>
                                <span className={styles.sessionMediaFallbackIcon}>📹</span>
                              </div>
                            )}
                          />
                        </div>
                      )
                    })()}
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>Practice Video</div>
                      {item.data.dancerNote && (
                        <div className={styles.cardNote}>{item.data.dancerNote}</div>
                      )}
                      {item.data.dancerFeeling && (
                        <span className={styles.feelingBadge}>{item.data.dancerFeeling}</span>
                      )}
                    </div>
                  </div>
                )}

                {item.type === 'journey' && (
                  <div className={styles.cardBody}>
                    <span className={styles.cardIcon}>{JOURNEY_EVENT_META[item.data.eventType]?.icon || '📝'}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>
                        {item.data.title}
                        <span className={styles.eventTypeTag}>
                          {JOURNEY_EVENT_META[item.data.eventType]?.label || 'Journey'}
                        </span>
                      </div>
                      {item.data.details && (
                        <div className={styles.cardNote}>{item.data.details}</div>
                      )}
                      {dancerDisciplineById[item.data.disciplineId] && (
                        <div className={styles.entryDetails}>
                          <span>
                            {dancerDisciplineById[item.data.disciplineId].icon} {dancerDisciplineById[item.data.disciplineId].name}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {item.type === 'show' && (
                  <div
                    className={styles.cardBody}
                    onClick={() => {
                      if (isKidMode) return
                      const currentEntry = (item.data.entries || []).find(e => e.routineId === id)
                      if (currentEntry?.id) {
                        navigate(`/show/${item.data.id}/entry/${currentEntry.id}`)
                        return
                      }
                      navigate(`/show/${item.data.id}`)
                    }}
                    style={{ cursor: isKidMode ? 'default' : 'pointer' }}
                  >
                    <span className={styles.cardIcon}>{getEventTypeIcon(item.data.eventType)}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>
                        {item.data.name}
                        {item.data.eventType && item.data.eventType !== 'show' && (
                          (() => {
                              const entry = (item.data.entries || []).find(e => e.routineId === id)
                              const highlightEventTypes = ['qualifier', 'regional-final', 'national-final']
                              const shouldHighlightType = highlightEventTypes.includes(item.data.eventType)
                              const isQualifiedQualifier = item.data.eventType === 'qualifier' && entry?.qualified
                              const label = isQualifiedQualifier ? 'AED Qualified' : getEventTypeLabel(item.data.eventType)
                              return (
                                <span className={shouldHighlightType ? styles.eventTypeTag : styles.eventTypeTagMuted}>
                                  {isQualifiedQualifier && <span className={styles.eventTypeQualifiedTick}>✓</span>}
                                  {label}
                                </span>
                              )
                          })()
                        )}
                      </div>
                      {(() => {
                        const entry = (item.data.entries || []).find(e => e.routineId === id)
                        if (!entry) return null
                        const hasDate = Boolean(entry.scheduledDate)
                        const hasTime = Boolean(entry.scheduledTime)
                        const dateLabel = hasDate
                          ? formatDate(entry.scheduledDate)
                          : ''
                        return (
                          <div className={styles.entryDetails}>
                            {(hasDate || hasTime) && (
                              <span>
                                ⏰ {hasDate ? dateLabel : ''}{hasDate && hasTime ? ' · ' : ''}{hasTime ? entry.scheduledTime : ''}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                    {(() => {
                      // Check entry-level place first, then event-level place
                      const entry = (item.data.entries || []).find(e => e.routineId === id)
                      const placeVal = entry?.place ?? item.data.place
                      const parsedPlace = Number.parseInt(String(placeVal || ''), 10)
                      const hasPlace = Number.isFinite(parsedPlace) && parsedPlace > 0
                      if (!hasPlace) return null

                      if (parsedPlace === 1 || parsedPlace === 2 || parsedPlace === 3) {
                        const medal = parsedPlace === 1 ? '🥇' : parsedPlace === 2 ? '🥈' : '🥉'
                        return <span className={styles.showPlaceMedal}>{medal}</span>
                      }

                      return <span className={styles.showPlaceCircle}>{formatOrdinalPlace(parsedPlace)}</span>
                    })()}
                    <span className={styles.cardArrow}>→</span>
                  </div>
                )}

                {/* Media carousel for show cards */}
                {item.type === 'show' && (() => {
                  const currentEntry = (item.data.entries || []).find(e => e.routineId === id)
                  const currentEntryId = currentEntry?.id || null
                  const media = (item.data.scrapbookEntries || []).filter(
                    e => (e.type === 'photo' || e.type === 'video')
                      && currentEntryId
                      && e.eventEntryId === currentEntryId
                  )
                  if (media.length === 0) return null
                  return (
                    <div className={styles.showMediaCarousel}>
                      <div className={styles.showMediaWrap}>
                        <button
                          className={`${styles.showMediaArrow} ${styles.showMediaArrowLeft}`}
                          disabled={media.length <= 1}
                          onClick={(e) => { e.stopPropagation(); e.currentTarget.nextElementSibling.scrollBy({ left: -180, behavior: 'smooth' }) }}
                          aria-label="Scroll left"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                        </button>
                        <div className={styles.showMediaTrack}>
                          {media.map((me, idx) => (
                            <div
                              key={me.id}
                              className={styles.showMediaItem}
                              onClick={(e) => { e.stopPropagation(); setLightbox({ media, index: idx }) }}
                              style={{ cursor: 'pointer' }}
                            >
                              {me.type === 'photo' ? (
                                <img src={me.content} alt="" className={styles.showMediaImg} />
                              ) : (
                                <video src={me.content} className={styles.showMediaVid} />
                              )}
                            </div>
                          ))}
                        </div>
                        <button
                          className={`${styles.showMediaArrow} ${styles.showMediaArrowRight}`}
                          disabled={media.length <= 1}
                          onClick={(e) => { e.stopPropagation(); e.currentTarget.previousElementSibling.scrollBy({ left: 180, behavior: 'smooth' }) }}
                          aria-label="Scroll right"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>

              {/* Reflection inline modal */}
              {reflectingSession === item.data.id && item.type === 'session' && (
                <div className={styles.reflectionPanel}>
                  <div className={styles.reflectionTitle}>How did that feel?</div>
                  <div className={styles.feelingPicker}>
                    {['🔥', '😊', '🤔', '😤', '😢'].map(emoji => (
                      <button
                        key={emoji}
                        className={`${styles.feelingOption} ${feeling === emoji ? styles.selectedFeeling : ''}`}
                        onClick={() => setFeeling(emoji)}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={styles.reflectionInput}
                    placeholder="Any thoughts? (optional)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                  />
                  <div className={styles.reflectionActions}>
                    <button
                      className={styles.reflectionCancel}
                      onClick={() => { setReflectingSession(null); setFeeling(''); setNote('') }}
                    >
                      Skip
                    </button>
                    <button
                      className={styles.reflectionSave}
                      onClick={() => handleSubmitReflection(item.data.id)}
                    >
                      Save ✓
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Lightbox overlay */}
      {lightbox && lightbox.media[lightbox.index] && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          <button
            className={`${styles.lightboxArrow} ${styles.lightboxArrowLeft}`}
            disabled={lightbox.index === 0}
            onClick={(e) => { e.stopPropagation(); if (lightbox.index > 0) setLightbox({ ...lightbox, index: lightbox.index - 1 }) }}
            aria-label="Previous"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          {lightbox.media[lightbox.index].type === 'photo' ? (
            <img src={lightbox.media[lightbox.index].content} alt="" className={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          ) : (
            <video src={lightbox.media[lightbox.index].content} controls autoPlay className={styles.lightboxVideo} onClick={e => e.stopPropagation()} />
          )}
          <button
            className={`${styles.lightboxArrow} ${styles.lightboxArrowRight}`}
            disabled={lightbox.index === lightbox.media.length - 1}
            onClick={(e) => { e.stopPropagation(); if (lightbox.index < lightbox.media.length - 1) setLightbox({ ...lightbox, index: lightbox.index + 1 }) }}
            aria-label="Next"
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

