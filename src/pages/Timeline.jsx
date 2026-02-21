import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import styles from './Timeline.module.css'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
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

export default function Timeline() {
  const { type, id } = useParams()
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const nowRef = useRef(null)
  const [reflectingSession, setReflectingSession] = useState(null)
  const [feeling, setFeeling] = useState('')
  const [note, setNote] = useState('')

  // Determine what we're showing a timeline for
  const isDiscipline = type === 'discipline'
  const isRoutine = type === 'routine'

  const discipline = isDiscipline ? state.disciplines.find(d => d.id === id) : null
  const routine = isRoutine ? state.routines.find(r => r.id === id) : null

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
  const practiceVideos = useMemo(() => {
    if (!isRoutine || !routine) return []
    return [...(routine.practiceVideos || [])]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [routine, isRoutine])

  // Related shows (for routines)
  const relatedShows = useMemo(() => {
    if (!isRoutine) return []
    return (state.shows || [])
      .filter(s => (s.routineIds || []).includes(id))
      .sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [state.shows, id, isRoutine])

  // Related stickers
  const relatedStickers = useMemo(() => {
    return [...(state.stickers || [])]
      .sort((a, b) => new Date(b.earnedDate) - new Date(a.earnedDate))
  }, [state.stickers])

  // Merge all events into a single timeline
  const timelineItems = useMemo(() => {
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
  }, [filteredSessions, practiceVideos, relatedShows])

  // Discipline elements (for discipline view)
  const elements = isDiscipline ? (discipline?.elements || []) : []

  // Scroll to NOW on mount
  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

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

  const today = new Date().toISOString().split('T')[0]
  const nowInserted = useRef(false)

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
          const isNowItem = !nowInserted.current && item.date <= today
          if (isNowItem) nowInserted.current = true

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
                  <div className={styles.cardBody} onClick={() => {
                    if (item.data.videoUrl) {
                      // If session has video, could open player
                    }
                  }}>
                    <span className={styles.cardIcon}>
                      {SESSION_ICONS[item.data.type] || '📝'}
                    </span>
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>{item.data.title}</div>
                      {item.data.islaReflection?.feeling && (
                        <span className={styles.feelingBadge}>
                          {item.data.islaReflection.feeling}
                        </span>
                      )}
                    </div>
                    {!item.data.islaReflection?.feeling && isPast(item.date) && (
                      <button
                        className={styles.reflectBtn}
                        onClick={(e) => {
                          e.stopPropagation()
                          setReflectingSession(item.data.id)
                        }}
                      >
                        How was it?
                      </button>
                    )}
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

