import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import { getDaysInMonth, getFirstDayOfMonth, formatDate, daysUntil, isFuture, getSessionIcon, generateId } from '../utils/helpers'
import styles from './Calendar.module.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Calendar() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [scheduleDate, setScheduleDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [scheduleRoutineId, setScheduleRoutineId] = useState(() => state.routines?.[0]?.id || '')
  const [scheduleVersionId, setScheduleVersionId] = useState('')

  const selectedRoutine = useMemo(
    () => state.routines.find((routine) => routine.id === scheduleRoutineId) || null,
    [state.routines, scheduleRoutineId]
  )
  const selectedRoutineVersions = selectedRoutine?.choreographyVersions || []

  useEffect(() => {
    if (!selectedRoutineVersions.length) return
    if (!scheduleVersionId || !selectedRoutineVersions.find((version) => version.id === scheduleVersionId)) {
      setScheduleVersionId(selectedRoutineVersions[selectedRoutineVersions.length - 1].id)
    }
  }, [selectedRoutineVersions, scheduleVersionId])

  const streak = getCurrentStreak(state.practiceLog)
  const todayStr = today.toISOString().split('T')[0]
  const loggedToday = state.practiceLog.includes(todayStr)

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Sessions in this month
  const monthSessions = useMemo(() => {
    return state.sessions.filter((s) => {
      const d = new Date(s.date)
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth
    })
  }, [state.sessions, viewYear, viewMonth])

  // Upcoming sessions
  const upcoming = useMemo(() => {
    return state.sessions
      .filter((s) => isFuture(s.date))
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(0, 5)
  }, [state.sessions])

  const getSessionsForDay = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return monthSessions.filter((s) => s.date === dateStr)
  }

  const getRoutineVersion = (session) => {
    const routine = state.routines.find((routineItem) => routineItem.id === session.routineId)
    if (!routine) return null
    const versions = routine.choreographyVersions || []
    const version = versions.find((versionItem) => versionItem.id === session.choreographyVersionId)
      || versions[versions.length - 1]
      || null
    return { routine, version, versionIndex: version ? versions.findIndex((versionItem) => versionItem.id === version.id) : -1 }
  }

  const handleSchedulePractice = () => {
    if (!scheduleRoutineId || !scheduleDate) return
    const routine = state.routines.find((routineItem) => routineItem.id === scheduleRoutineId)
    if (!routine) return
    const versions = routine.choreographyVersions || []
    const selectedVersion = versions.find((version) => version.id === scheduleVersionId)
      || versions[versions.length - 1]
      || null

    dispatch({
      type: 'SCHEDULE_REHEARSAL',
      payload: {
        id: generateId('session'),
        date: scheduleDate,
        scheduledAt: scheduleDate,
        title: `${routine.name} rehearsal`,
        routineId: routine.id,
        disciplineId: routine.disciplineId || null,
        choreographyVersionId: selectedVersion?.id || null,
        status: 'scheduled',
      },
    })
  }

  const isPracticeLogged = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return state.practiceLog.includes(dateStr)
  }

  const isTodayCell = (day) => {
    return (
      viewYear === today.getFullYear() &&
      viewMonth === today.getMonth() &&
      day === today.getDate()
    )
  }

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear(viewYear - 1)
    } else {
      setViewMonth(viewMonth - 1)
    }
  }

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear(viewYear + 1)
    } else {
      setViewMonth(viewMonth + 1)
    }
  }

  const handleLogToday = () => {
    dispatch({ type: 'LOG_PRACTICE', payload: todayStr })
  }

  return (
    <div className={styles['calendar-page']}>
      <h1>Calendar 📅</h1>

      {/* Streak */}
      <div className={styles['streak-display']}>
        <span className={styles['streak-flame']}>🔥</span>
        <div className={styles['streak-info']}>
          <div className={styles['streak-number']}>{streak} day streak</div>
          <div className={styles['streak-text']}>Keep it going!</div>
        </div>
        {loggedToday ? (
          <span className={styles['already-logged']}>✅ Logged today</span>
        ) : (
          <button className={styles['log-today-btn']} onClick={handleLogToday}>
            Log Today 🎵
          </button>
        )}
      </div>

      {/* Month navigation */}
      <div className={styles['schedule-box']}>
        <h3>Schedule Practice</h3>
        {state.routines.length === 0 ? (
          <p className={styles['schedule-empty']}>Add a routine in Settings first.</p>
        ) : (
          <div className={styles['schedule-controls']}>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
            />
            <select
              value={scheduleRoutineId}
              onChange={(e) => {
                setScheduleRoutineId(e.target.value)
                const nextRoutine = state.routines.find((routine) => routine.id === e.target.value)
                const nextVersions = nextRoutine?.choreographyVersions || []
                setScheduleVersionId(nextVersions[nextVersions.length - 1]?.id || '')
              }}
            >
              {state.routines.map((routine) => (
                <option key={routine.id} value={routine.id}>{routine.name}</option>
              ))}
            </select>
            <select
              value={scheduleVersionId}
              onChange={(e) => setScheduleVersionId(e.target.value)}
            >
              {selectedRoutineVersions.map((version, versionIndex) => (
                <option key={version.id} value={version.id}>
                  v{versionIndex + 1}{version.label ? ` — ${version.label}` : ''}
                </option>
              ))}
            </select>
            <button onClick={handleSchedulePractice}>+ Schedule</button>
          </div>
        )}
      </div>

      <div className={styles['month-nav']}>
        <button onClick={prevMonth}>←</button>
        <span className={styles['month-label']}>
          {MONTH_NAMES[viewMonth]} {viewYear}
        </span>
        <button onClick={nextMonth}>→</button>
      </div>

      {/* Calendar grid */}
      <div className={styles['calendar-grid']}>
        <div className={styles['weekday-row']}>
          {WEEKDAYS.map((wd) => (
            <div key={wd} className={styles['weekday-label']}>
              {wd}
            </div>
          ))}
        </div>

        <div className={styles['days-grid']}>
          {/* Empty cells before first day */}
          {Array.from({ length: firstDay }, (_, i) => (
            <div key={`empty-${i}`} className={`${styles['day-cell']} ${styles.empty}`} />
          ))}

          {/* Day cells */}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day = i + 1
            const sessions = getSessionsForDay(day)
            const logged = isPracticeLogged(day)
            const isToday = isTodayCell(day)

            return (
              <div
                key={day}
                className={`${styles['day-cell']} ${isToday ? styles.today : ''}`}
              >
                {day}
                {logged && <div className={styles['practice-logged']} />}
                {sessions.length > 0 && (
                  <div className={styles['session-dots']}>
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`${styles['session-dot']} ${styles[`dot-${s.type}`]}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming events */}
      {upcoming.length > 0 && (
        <div className={styles['upcoming-section']}>
          <h3>Coming Up</h3>
          <div className={styles['upcoming-list']}>
            {upcoming.map((s) => {
              const days = daysUntil(s.date)
              const linked = getRoutineVersion(s)
              return (
                <div key={s.id} className={styles['upcoming-item']}>
                  <span className={styles['upcoming-icon']}>
                    {getSessionIcon(s.type)}
                  </span>
                  <div className={styles['upcoming-info']}>
                    <div className={styles['upcoming-title']}>{s.title}</div>
                    <div className={styles['upcoming-date']}>
                      {formatDate(s.date)}
                    </div>
                    {linked?.version && (
                      <div className={styles['upcoming-date']}>
                        Choreo: v{linked.versionIndex + 1} {linked.version.label ? `— ${linked.version.label}` : ''}
                      </div>
                    )}
                  </div>
                  {s.routineId && (
                    <button
                      className={styles['upcoming-live-btn']}
                      onClick={() => navigate(`/choreography/${s.routineId}?live=true&sessionId=${s.id}`)}
                    >
                      ▶ Live
                    </button>
                  )}
                  <span
                    className={`${styles['upcoming-countdown']} ${days <= 14 ? styles.soon : ''}`}
                  >
                    {days} day{days !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
