import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import { loadFile } from '../utils/fileStorage'
import styles from './Timeline.module.css'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

function isPast(dateStr) {
  return new Date(dateStr) < new Date(new Date().toISOString().split('T')[0])
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

function SessionVideoPoster({ rehearsalVideoKey, rehearsalVideoName, className }) {
  const [videoUrl, setVideoUrl] = useState('')

  useEffect(() => {
    let mounted = true
    let objectUrl = ''

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
  }, [rehearsalVideoKey])

  if (!videoUrl) return null

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

export default function Timeline() {
  const { type, id } = useParams()
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const nowRef = useRef(null)
  const [reflectingSession, setReflectingSession] = useState(null)
  const [feeling, setFeeling] = useState('')
  const [note, setNote] = useState('')
  const [scheduleDate, setScheduleDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [scheduleVersionId, setScheduleVersionId] = useState('')

  // Determine what we're showing a timeline for
  const isDiscipline = type === 'discipline'
  const isRoutine = type === 'routine'

  const discipline = isDiscipline ? state.disciplines.find(d => d.id === id) : null
  const routine = isRoutine ? state.routines.find(r => r.id === id) : null
  const routineVersions = useMemo(
    () => routine?.choreographyVersions || [],
    [routine]
  )

  const title = isDiscipline
    ? `${discipline?.icon || ''} ${discipline?.name || 'Discipline'}`
    : `🎵 ${routine?.name || 'Routine'}`

  // Filter sessions for this context
  const filteredSessions = useMemo(() => {
    return [...(state.sessions || [])]
      .filter(s => {
        if (isDiscipline) return s.disciplineId === id
        if (isRoutine) return s.routineId === id
        return false
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date)) // newest first
  }, [state.sessions, id, isDiscipline, isRoutine])

  // For routines, also get practice videos
  const practiceVideos = !isRoutine || !routine
    ? []
    : [...(routine.practiceVideos || [])]
        .sort((a, b) => new Date(b.date) - new Date(a.date))

  // Related shows (for routines)
  const relatedShows = useMemo(() => {
    if (!isRoutine) return []
    return (state.shows || [])
      .filter(s => (s.routineIds || []).includes(id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [state.shows, id, isRoutine])

  // Merge all events into a single timeline
  const timelineItems = (() => {
    const items = []

    filteredSessions.forEach(s => {
      items.push({ type: 'session', date: s.date, data: s })
    })

    practiceVideos.forEach(v => {
      items.push({ type: 'video', date: v.date, data: v })
    })

    relatedShows.forEach(s => {
      items.push({ type: 'show', date: s.date, data: s })
    })

    // Sort newest first
    items.sort((a, b) => new Date(b.date) - new Date(a.date))
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
    if (!scheduleVersionId && routineVersions.length) {
      setScheduleVersionId(routineVersions[routineVersions.length - 1].id)
    }
  }, [isRoutine, scheduleVersionId, routineVersions])

  const handleSubmitReflection = (sessionId) => {
    if (!feeling && !note) return
    dispatch({
      type: 'SET_SESSION_REFLECTION',
      payload: {
        sessionId,
        reflection: { feeling, note },
      },
    })
    setReflectingSession(null)
    setFeeling('')
    setNote('')
  }

  const handleElementStatus = (elementId, status) => {
    dispatch({
      type: 'SET_ELEMENT_STATUS',
      payload: { disciplineId: id, elementId, status },
    })
  }

  const handleScheduleRehearsal = () => {
    if (!isRoutine || !routine || !scheduleDate) return
    const versionId = scheduleVersionId || routineVersions[routineVersions.length - 1]?.id || null

    dispatch({
      type: 'SCHEDULE_REHEARSAL',
      payload: {
        id: generateId('session'),
        date: scheduleDate,
        scheduledAt: scheduleDate,
        title: `${routine.name} rehearsal`,
        routineId: routine.id,
        disciplineId: routine.disciplineId || null,
        choreographyVersionId: versionId,
        status: 'scheduled',
      },
    })
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
        {isRoutine && routine && (
          <button
            className={styles.liveBtn}
            onClick={() => navigate(`/choreography/${routine.id}`)}
          >
            ▶ Live
          </button>
        )}
      </div>

      {isRoutine && routine && (
        <div className={styles.scheduleCard}>
          <h3 className={styles.sectionLabel}>Schedule Practice</h3>
          <div className={styles.scheduleRow}>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <select
              value={scheduleVersionId}
              onChange={(e) => setScheduleVersionId(e.target.value)}
            >
              {routineVersions.map((version, versionIndex) => (
                <option key={version.id} value={version.id}>
                  v{versionIndex + 1}{version.label ? ` — ${version.label}` : ''}
                </option>
              ))}
            </select>
            <button onClick={handleScheduleRehearsal}>+ Schedule</button>
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
                      <SessionVideoPoster
                        rehearsalVideoKey={item.data.rehearsalVideoKey}
                        rehearsalVideoName={item.data.rehearsalVideoName}
                        className={styles.sessionMediaPoster}
                      />
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
                              Choreo: v{versionData.versionIndex + 1}{versionData.version.label ? ` — ${versionData.version.label}` : ''}
                            </div>
                          )
                        })()}
                        {item.data.rehearsalVideoName && (
                          <div className={styles.sessionMediaNote}>🎥 {item.data.rehearsalVideoName}</div>
                        )}
                      </div>

                      <div className={styles.sessionMediaActions}>
                        {item.data.islaReflection?.feeling && (
                          <span className={styles.feelingBadge}>
                            {item.data.islaReflection.feeling}
                          </span>
                        )}

                        {!item.data.islaReflection?.feeling && isPast(item.date) && (
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
                    <span className={styles.cardIcon}>📹</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>Practice Video</div>
                      {item.data.islaNote && (
                        <div className={styles.cardNote}>{item.data.islaNote}</div>
                      )}
                      {item.data.islaFeeling && (
                        <span className={styles.feelingBadge}>{item.data.islaFeeling}</span>
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
                    <span className={styles.cardIcon}>🎭</span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>{item.data.name}</div>
                      {item.data.venue && (
                        <div className={styles.cardNote}>📍 {item.data.venue}</div>
                      )}
                    </div>
                    <span className={styles.cardArrow}>→</span>
                  </div>
                )}
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
    </div>
  )
}

