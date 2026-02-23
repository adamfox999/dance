import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { loadFile } from '../utils/fileStorage'
import { getEventTypeIcon, getEventTypeLabel } from '../data/aedEvents'
import { fetchStateFromBackend } from '../utils/backendApi'
import styles from './Timeline.module.css'

function formatDate(dateStr) {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return 'Rehearsal'

  const day = date.getDate()
  const month = date.toLocaleDateString('en-GB', { month: 'long' })
  const mod100 = day % 100
  const suffix = (mod100 >= 11 && mod100 <= 13)
    ? 'th'
    : day % 10 === 1
      ? 'st'
      : day % 10 === 2
        ? 'nd'
        : day % 10 === 3
          ? 'rd'
          : 'th'

  return `${day}${suffix} ${month} rehearsal`
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

function SessionVideoPoster({ rehearsalVideoKey, rehearsalVideoName, videoSrc, className, fallback = null }) {
  const [videoUrl, setVideoUrl] = useState('')

  useEffect(() => {
    let mounted = true
    let objectUrl = ''

    if (videoSrc) {
      setVideoUrl(videoSrc)
      return () => {}
    }

    const loadPoster = async () => {
      if (!rehearsalVideoKey) {
        setVideoUrl('')
        return
      }

      try {
        const file = await loadFile(rehearsalVideoKey)
        if (!mounted || !file?.blob) {
          if (mounted) setVideoUrl('')
          return
        }

        objectUrl = URL.createObjectURL(file.blob)
        setVideoUrl(objectUrl)
      } catch {
        if (mounted) setVideoUrl('')
      }
    }

    loadPoster()

    return () => {
      mounted = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [rehearsalVideoKey, videoSrc])

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
      title={rehearsalVideoName || 'Practice video'}
    />
  )
}

function getVideoPreviewSource(video = {}) {
  const firstValid = (...values) => values.find((value) => typeof value === 'string' && value.trim()) || ''
  return {
    key: firstValid(video.rehearsalVideoKey, video.videoKey, video.key),
    src: firstValid(video.content, video.videoUrl, video.url, video.src),
    name: firstValid(video.rehearsalVideoName, video.videoName, video.fileName, video.name),
  }
}

export default function Timeline() {
  const { type, id } = useParams()
  const {
    disciplines, routines, sessions, events,
    setSessionReflection, setElementStatus, scheduleRehearsal, addEventEntry, addShow,
    editRoutine,
    isAdmin,
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
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [addType, setAddType] = useState('practice')
  const [addDate, setAddDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [addVersionId, setAddVersionId] = useState('')
  const [addShowName, setAddShowName] = useState('')
  const [addShowVenue, setAddShowVenue] = useState('')
  const [addShowPlace, setAddShowPlace] = useState('')
  const [addEventId, setAddEventId] = useState('')
  const [addEntryDate, setAddEntryDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [addEntryTime, setAddEntryTime] = useState('')
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

  const discipline = isDiscipline ? disciplines.find(d => d.id === id) : null
  const routine = isRoutine ? routines.find(r => r.id === id) : null
  const routineVersions = useMemo(
    () => routine?.choreographyVersions || [],
    [routine]
  )

  const title = isDiscipline
    ? `${discipline?.icon || ''} ${discipline?.name || 'Discipline'}`
    : `🎵 ${routine?.name || 'Routine'}`

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

  // All events available to link an entry to (for the add dialog)
  const availableEvents = useMemo(() => {
    return (events || [])
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
    if (!isRoutine || !routine) return
    setAddType('practice')
    setAddDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setAddVersionId(routineVersions[routineVersions.length - 1]?.id || '')
    setAddShowName(`${routine.name} show`)
    setAddShowVenue('')
    setAddShowPlace('')
    setAddEventId(availableEvents[0]?.id || '')
    setAddEntryDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setAddEntryTime('')
    setShareMsg(null)
    setShareLink(null)
    setAddDialogOpen(true)
    // Load partner kids for accepted shares of this routine
    loadPartnerKidsForRoutine()
  }

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
      alert(err?.message || 'Could not update dancers for this routine.')
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
      alert(err?.message || 'Could not tag your child on this shared dance.')
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

  const handleAddTimelineItem = () => {
    if (!isRoutine || !routine || !addDate) return

    if (addType === 'practice') {
      const versionId = addVersionId || routineVersions[routineVersions.length - 1]?.id || null
      scheduleRehearsal({
        date: addDate,
        scheduledAt: addDate,
        title: `${routine.name} rehearsal`,
        routineId: routine.id,
        disciplineId: routine.disciplineId || null,
        choreographyVersionId: versionId,
        status: 'scheduled',
      })
    } else if (addType === 'event-entry' && addEventId) {
      // Add an entry (this routine) to an existing event
      addEventEntry(addEventId, {
        routineId: routine.id,
        scheduledDate: addEntryDate || '',
        scheduledTime: addEntryTime || '',
        place: null,
        qualified: false,
        qualifiedForEventId: '',
        notes: '',
      })
    } else {
      // Legacy: create a new quick show directly
      const parsedPlace = Number.parseInt(addShowPlace, 10)
      const place = Number.isFinite(parsedPlace) && parsedPlace > 0 ? parsedPlace : null
      addShow({
        name: addShowName.trim() || `${routine.name} show`,
        date: addDate,
        venue: addShowVenue.trim(),
        place,
        routineIds: [routine.id],
        scrapbookEntries: [],
      })
    }

    setAddDialogOpen(false)
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
            <p className={styles.subtitle}>{routine.formation} · {routine.type}</p>
          )}
        </div>
        {isAdmin && isRoutine && routine && (
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

      {isAdmin && addDialogOpen && isRoutine && routine && (
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
            <p>No events yet — start practising! 💃</p>
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
                  <span className={styles.nowPill}>NOW</span>
                </div>
              )}

              <div className={`${styles.timelineCard} ${isPast(item.date) ? styles.past : styles.future}`}>
                <div className={styles.cardDate}>{formatDate(item.date)}</div>

                {item.type === 'session' && (
                  <div
                    className={styles.sessionMediaCard}
                    onClick={() => {
                      if (item.data.routineId) {
                        navigate(`/choreography/${item.data.routineId}?live=true&sessionId=${item.data.id}`)
                      }
                    }}
                    style={item.data.routineId ? { cursor: 'pointer' } : undefined}
                  >
                    {item.data.rehearsalVideoKey ? (
                      <>
                        <SessionVideoPoster
                          rehearsalVideoKey={item.data.rehearsalVideoKey}
                          rehearsalVideoName={item.data.rehearsalVideoName}
                          className={styles.sessionMediaPoster}
                          fallback={(
                            <div className={styles.sessionMediaFallback}>
                              <span className={styles.sessionMediaFallbackIcon}>
                                {SESSION_ICONS[item.data.type] || '📝'}
                              </span>
                            </div>
                          )}
                        />
                        <div className={styles.sessionMediaPlayOverlay} aria-hidden="true">
                          <span className={styles.sessionMediaPlayIcon}>▶</span>
                        </div>
                      </>
                    ) : (
                      <div className={styles.sessionMediaFallback}>
                        <span className={styles.sessionMediaFallbackIcon}>
                          {SESSION_ICONS[item.data.type] || '📝'}
                        </span>
                      </div>
                    )}

                    <div className={styles.sessionMediaOverlay}>
                      <div className={styles.sessionMediaInfo}>
                        <div className={styles.sessionMediaTitle}>{(item.data.title || '').trim() || formatRehearsalTitle(item.date)}</div>
                        {(() => {
                          const versionData = getSessionVersion(item.data)
                          if (!versionData) return null
                          return (
                            <div className={styles.sessionMediaNote}>
                              Choreo: v{versionData.versionIndex + 1}
                            </div>
                          )
                        })()}
                      </div>

                      <div className={styles.sessionMediaActions}>
                        {item.data.dancerReflection?.feeling && (
                          <span className={styles.feelingBadge}>
                            {item.data.dancerReflection.feeling}
                          </span>
                        )}

                        {!item.data.dancerReflection?.feeling && isPast(item.date) && (
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
                )}

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

                {item.type === 'show' && (
                  <div
                    className={styles.cardBody}
                    onClick={() => navigate(`/show/${item.data.id}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    <span className={styles.cardIcon}>{getEventTypeIcon(item.data.eventType)}</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>
                        {item.data.name}
                        {item.data.eventType && item.data.eventType !== 'show' && (
                          <span className={styles.eventTypeTag}>
                            {(() => {
                              const entry = (item.data.entries || []).find(e => e.routineId === id)
                              const isQualifiedQualifier = item.data.eventType === 'qualifier' && entry?.qualified
                              return (
                                <>
                                  {isQualifiedQualifier && <span className={styles.eventTypeQualifiedTick}>✓</span>}
                                  {isQualifiedQualifier ? 'AED Qualified' : getEventTypeLabel(item.data.eventType)}
                                </>
                              )
                            })()}
                          </span>
                        )}
                      </div>
                      {(() => {
                        const entry = (item.data.entries || []).find(e => e.routineId === id)
                        if (!entry) return null
                        const hasDate = Boolean(entry.scheduledDate)
                        const hasTime = Boolean(entry.scheduledTime)
                        const dateLabel = hasDate
                          ? new Date(entry.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
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
                  const media = (item.data.scrapbookEntries || []).filter(
                    e => e.type === 'photo' || e.type === 'video'
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

