import { useState, useRef, useEffect, useMemo } from 'react'
import { useApp } from '../context/AppContext'
import { formatDate, isPast, isFuture, isToday, daysUntil, getSessionIcon, generateId } from '../utils/helpers'
import PopoutCard from '../components/PopoutCard'
import AddSessionModal from '../components/AddSessionModal'
import styles from './Timeline.module.css'

export default function Timeline() {
  const { state, dispatch } = useApp()
  const [selectedSession, setSelectedSession] = useState(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const scrollRef = useRef(null)
  const nowRef = useRef(null)

  // Sort sessions by date
  const sortedSessions = useMemo(
    () => [...state.sessions].sort((a, b) => new Date(a.date) - new Date(b.date)),
    [state.sessions]
  )

  // Find the next upcoming competition
  const nextCompetition = useMemo(
    () => sortedSessions.find((s) => s.type === 'competition' && isFuture(s.date)),
    [sortedSessions]
  )

  // Get latest chunk ratings from the most recent rated session
  const latestRatings = useMemo(() => {
    const rated = sortedSessions
      .filter((s) => s.chunkRatings && Object.keys(s.chunkRatings).length > 0)
      .reverse()
    return rated.length > 0 ? rated[0].chunkRatings : {}
  }, [sortedSessions])

  // Scroll to "now" on mount
  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth' })
    }
  }, [])

  const scrollToNow = () => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ inline: 'center', behavior: 'smooth' })
    }
  }

  const getZone = (dateStr) => {
    if (isToday(dateStr)) return 'now'
    if (isPast(dateStr)) return 'past'
    return 'future'
  }

  // Find the node closest to "now"
  const findNowIndex = () => {
    const today = new Date().toISOString().split('T')[0]
    let closest = 0
    let minDiff = Infinity
    sortedSessions.forEach((s, i) => {
      const diff = Math.abs(new Date(s.date) - new Date(today))
      if (diff < minDiff) {
        minDiff = diff
        closest = i
      }
    })
    return closest
  }

  const nowIndex = findNowIndex()

  const getConfidenceLevel = (chunkRatings) => {
    if (!chunkRatings || Object.keys(chunkRatings).length === 0) return null
    const values = Object.values(chunkRatings)
    const greens = values.filter((v) => v === 'green').length
    const reds = values.filter((v) => v === 'red').length
    if (greens >= values.length * 0.6) return 'mostly-green'
    if (reds >= values.length * 0.4) return 'mostly-red'
    return 'mostly-yellow'
  }

  return (
    <div className={styles['timeline-page']}>
      {/* Header */}
      <div className={styles['timeline-header']}>
        <div>
          <h1>Journey ✨</h1>
          <span className={styles.dancers}>
            {state.settings.dancers.join(' & ')}
          </span>
        </div>
        <button className={styles['jump-today-btn']} onClick={scrollToNow}>
          Jump to Now
        </button>
      </div>

      {/* Next competition countdown */}
      {nextCompetition && (
        <div className={styles['countdown-banner']}>
          <span className={styles['trophy-icon']}>🏆</span>
          <div className={styles['countdown-text']}>
            <span className={styles['countdown-days']}>
              {daysUntil(nextCompetition.date)} days
            </span>{' '}
            until {nextCompetition.title}
          </div>
        </div>
      )}

      {/* Chunk overview pills */}
      <div className={styles['chunk-overview']}>
        <h3>Dance Sections</h3>
        <div className={styles['chunk-pills']}>
          {state.chunks.map((chunk) => {
            const rating = latestRatings[chunk.id] || null
            return (
              <div
                key={chunk.id}
                className={`${styles['chunk-pill']} ${rating ? styles[rating] : ''}`}
              >
                <span>{chunk.emoji}</span>
                <span>{chunk.name}</span>
                {rating && (
                  <span>
                    {rating === 'green' ? '🟢' : rating === 'yellow' ? '🟡' : '🔴'}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Timeline scroll area */}
      <div className={styles['timeline-scroll-container']} ref={scrollRef}>
        <div className={styles['timeline-track']}>
          {sortedSessions.map((session, index) => {
            const zone = getZone(session.date)
            const isNow = index === nowIndex
            const conf = getConfidenceLevel(session.chunkRatings)

            return (
              <div
                key={session.id}
                ref={isNow ? nowRef : null}
                className={`${styles['timeline-node']} ${styles[zone]}`}
                onClick={() => setSelectedSession(session)}
              >
                <div className={styles['node-circle']}>
                  {conf && (
                    <div className={`${styles['confidence-ring']} ${styles[conf]}`} />
                  )}
                  <span>{getSessionIcon(session.type)}</span>
                  {session.type === 'competition' && (
                    <span className={styles['node-badge']}>⭐</span>
                  )}
                </div>
                <span className={styles['node-date']}>
                  {formatDate(session.date)}
                </span>
                <span className={styles['node-title']}>{session.title}</span>
                {isNow && <span className={styles['now-marker']}>Now</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* FAB to add session */}
      <button
        className={styles['add-session-btn']}
        onClick={() => setShowAddModal(true)}
        title="Add session"
      >
        +
      </button>

      {/* Popout card modal */}
      {selectedSession && (
        <PopoutCard
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
        />
      )}

      {/* Add session modal */}
      {showAddModal && (
        <AddSessionModal onClose={() => setShowAddModal(false)} />
      )}
    </div>
  )
}
