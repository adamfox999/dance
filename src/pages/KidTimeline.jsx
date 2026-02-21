import { useMemo, useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { formatDateLong, getSessionIcon, isFuture, isToday, daysUntil } from '../utils/helpers'
import styles from './KidTimeline.module.css'

function dateOnly(value) {
  return new Date(value).toISOString().split('T')[0]
}

export default function KidTimeline() {
  const { state } = useApp()
  const nowRef = useRef(null)

  const timelineItems = useMemo(() => {
    const sessionItems = state.sessions.map((session) => ({
      id: `session-${session.id}`,
      date: dateOnly(session.date),
      title: session.title,
      subtitle: session.type === 'competition' ? 'Competition day' : session.type,
      icon: getSessionIcon(session.type),
      kind: 'session',
    }))

    const achievementItems = state.stickers.map((sticker) => ({
      id: `sticker-${sticker.id}`,
      date: dateOnly(sticker.earnedDate),
      title: sticker.label,
      subtitle: 'Achievement unlocked',
      icon: sticker.icon || '⭐',
      kind: 'achievement',
    }))

    return [...sessionItems, ...achievementItems].sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    )
  }, [state.sessions, state.stickers])

  const today = new Date().toISOString().split('T')[0]

  const nowIndex = useMemo(() => {
    if (timelineItems.length === 0) return -1
    const firstFutureOrToday = timelineItems.findIndex((item) => item.date >= today)
    return firstFutureOrToday === -1 ? timelineItems.length - 1 : firstFutureOrToday
  }, [timelineItems, today])

  const todayFocus = useMemo(() => {
    const todaysSession = state.sessions.find((session) => isToday(session.date))
    if (todaysSession) return todaysSession
    return state.sessions
      .filter((session) => isFuture(session.date))
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null
  }, [state.sessions])

  useEffect(() => {
    if (nowRef.current) {
      nowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Isla&apos;s Timeline ✨</h1>
        <p>Starts at now and shows your dance journey.</p>
      </div>

      <div className={styles['focus-card']}>
        <div className={styles['focus-label']}>Today&apos;s focus</div>
        {todayFocus ? (
          <>
            <div className={styles['focus-title']}>{todayFocus.title}</div>
            <div className={styles['focus-date']}>
              {isToday(todayFocus.date)
                ? 'Happening today 🎉'
                : `${daysUntil(todayFocus.date)} days to go`}
            </div>
          </>
        ) : (
          <>
            <div className={styles['focus-title']}>No dance event set yet</div>
            <div className={styles['focus-date']}>Ask an adult to add one in Adult View</div>
          </>
        )}
      </div>

      <div className={styles.timeline}>
        {timelineItems.map((item, index) => {
          const isNow = index === nowIndex
          return (
            <div
              key={item.id}
              ref={isNow ? nowRef : null}
              className={`${styles.item} ${isNow ? styles.now : ''}`}
            >
              <div className={styles.marker}>{item.icon}</div>
              <div className={styles.card}>
                <div className={styles['item-date']}>{formatDateLong(item.date)}</div>
                <div className={styles['item-title']}>{item.title}</div>
                <div className={styles['item-subtitle']}>{item.subtitle}</div>
              </div>
              {isNow && <div className={styles['now-pill']}>NOW</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
