import { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import { getDaysInMonth, getFirstDayOfMonth, formatDate, daysUntil, isFuture, getSessionIcon } from '../utils/helpers'
import { AED_TEMPLATES, EVENT_TYPES, getEventTypeIcon } from '../data/aedEvents'
import styles from './Calendar.module.css'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export default function Calendar() {
  const { routines, sessions, events, practiceLog, scheduleRehearsal, addShow, logPracticeDay } = useApp()
  const navigate = useNavigate()
  const today = new Date()
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [scheduleDate, setScheduleDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [scheduleStartTime, setScheduleStartTime] = useState('')
  const [scheduleEndTime, setScheduleEndTime] = useState('')
  const [scheduleWith, setScheduleWith] = useState('')
  const [scheduleRoutineId, setScheduleRoutineId] = useState(() => routines?.[0]?.id || '')
  const [scheduleVersionId, setScheduleVersionId] = useState('')
  const [addMode, setAddMode] = useState('practice') // 'practice' | 'event'
  const [eventName, setEventName] = useState('')
  const [eventVenue, setEventVenue] = useState('')
  const [eventType, setEventType] = useState('show')
  const [eventStartDate, setEventStartDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [eventEndDate, setEventEndDate] = useState('')
  const [eventCompOrg, setEventCompOrg] = useState('')
  const [eventRegion, setEventRegion] = useState('')

  const selectedRoutine = useMemo(
    () => routines.find((routine) => routine.id === scheduleRoutineId) || null,
    [routines, scheduleRoutineId]
  )

  const getSessionDate = useCallback((session) => {
    if (session?.date) return session.date
    const source = session?.scheduledAt || session?.completedAt || ''
    return typeof source === 'string' && source.length >= 10 ? source.slice(0, 10) : ''
  }, [])
  const selectedRoutineVersions = useMemo(
    () => selectedRoutine?.choreographyVersions || [],
    [selectedRoutine]
  )

  useEffect(() => {
    if (!selectedRoutineVersions.length) return
    if (!scheduleVersionId || !selectedRoutineVersions.find((version) => version.id === scheduleVersionId)) {
      setScheduleVersionId(selectedRoutineVersions[selectedRoutineVersions.length - 1].id)
    }
  }, [selectedRoutineVersions, scheduleVersionId])

  const streak = getCurrentStreak(practiceLog)
  const todayStr = today.toISOString().split('T')[0]
  const loggedToday = practiceLog.includes(todayStr)

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)

  // Sessions in this month
  const monthSessions = useMemo(() => {
    return sessions.filter((s) => {
      const d = new Date(getSessionDate(s))
      return d.getFullYear() === viewYear && d.getMonth() === viewMonth
    })
  }, [sessions, viewYear, viewMonth, getSessionDate])

  // Shows/events in this month (dot display)
  const monthShows = useMemo(() => {
    return (events || []).filter((s) => {
      const start = s.startDate || s.date
      const end = s.endDate || start
      if (!start) return false
      const monthStart = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-01`
      const daysCount = getDaysInMonth(viewYear, viewMonth)
      const monthEnd = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(daysCount).padStart(2, '0')}`
      return start <= monthEnd && end >= monthStart
    })
  }, [events, viewYear, viewMonth])

  // Upcoming sessions
  const upcoming = useMemo(() => {
    return sessions
      .filter((s) => isFuture(getSessionDate(s)))
      .sort((a, b) => new Date(getSessionDate(a)) - new Date(getSessionDate(b)))
      .slice(0, 5)
  }, [sessions, getSessionDate])

  // Upcoming shows/events
  const upcomingShows = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0]
    return (events || [])
      .filter((s) => (s.startDate || s.date) >= todayStr)
      .sort((a, b) => new Date(a.startDate || a.date) - new Date(b.startDate || b.date))
      .slice(0, 3)
  }, [events])

  const getSessionsForDay = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return monthSessions.filter((s) => getSessionDate(s) === dateStr)
  }

  const getShowsForDay = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return monthShows.filter((s) => {
      const start = s.startDate || s.date
      const end = s.endDate || start
      return dateStr >= start && dateStr <= end
    })
  }

  const getRoutineVersion = (session) => {
    const routine = routines.find((routineItem) => routineItem.id === session.routineId)
    if (!routine) return null
    const versions = routine.choreographyVersions || []
    const version = versions.find((versionItem) => versionItem.id === session.choreographyVersionId)
      || versions[versions.length - 1]
      || null
    return { routine, version, versionIndex: version ? versions.findIndex((versionItem) => versionItem.id === version.id) : -1 }
  }

  const handleSchedulePractice = () => {
    if (!scheduleRoutineId || !scheduleDate) return
    const routine = routines.find((routineItem) => routineItem.id === scheduleRoutineId)
    if (!routine) return
    const versions = routine.choreographyVersions || []
    const selectedVersion = versions.find((version) => version.id === scheduleVersionId)
      || versions[versions.length - 1]
      || null

    scheduleRehearsal({
      date: scheduleDate,
      scheduledAt: scheduleDate,
      startTime: scheduleStartTime,
      endTime: scheduleEndTime,
      with: scheduleWith.trim(),
      title: `${routine.name} rehearsal`,
      routineId: routine.id,
      disciplineId: routine.disciplineId || null,
      choreographyVersionId: selectedVersion?.id || null,
      status: 'scheduled',
    })
  }

  const handleCreateEvent = () => {
    if (!eventName.trim()) return
    const startDate = eventStartDate || new Date(Date.now() + 86400000).toISOString().split('T')[0]
    addShow({
      name: eventName.trim(),
      date: startDate,
      startDate,
      endDate: eventEndDate || startDate,
      venue: eventVenue.trim(),
      eventType,
      competitionOrg: eventCompOrg,
      region: eventRegion,
      routineIds: [],
      entries: [],
      scrapbookEntries: [],
    })
    // Reset
    setEventName('')
    setEventVenue('')
    setEventType('show')
    setEventStartDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setEventEndDate('')
    setEventCompOrg('')
    setEventRegion('')
  }

  const handlePickAedTemplate = (template) => {
    setEventName(template.name)
    setEventVenue(template.venue)
    setEventType(template.eventType)
    setEventStartDate(template.startDate)
    setEventEndDate(template.endDate)
    setEventCompOrg(template.competitionOrg)
    setEventRegion(template.region)
  }

  const isPracticeLogged = (day) => {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    return practiceLog.includes(dateStr)
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
    logPracticeDay(todayStr)
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

      {/* Add to Calendar — dual mode */}
      <div className={styles['schedule-box']}>
        <div className={styles['add-mode-tabs']}>
          <button
            className={`${styles['add-mode-tab']} ${addMode === 'practice' ? styles['add-mode-tab-active'] : ''}`}
            onClick={() => setAddMode('practice')}
          >
            Practice
          </button>
          <button
            className={`${styles['add-mode-tab']} ${addMode === 'event' ? styles['add-mode-tab-active'] : ''}`}
            onClick={() => setAddMode('event')}
          >
            Event
          </button>
        </div>

        {addMode === 'practice' && (
          <>
            {routines.length === 0 ? (
              <p className={styles['schedule-empty']}>Add a routine in Settings first.</p>
            ) : (
              <div className={styles['schedule-controls']}>
                <input
                  type="date"
                  value={scheduleDate}
                  onChange={(e) => setScheduleDate(e.target.value)}
                />
                <input
                  type="time"
                  value={scheduleStartTime}
                  onChange={(e) => setScheduleStartTime(e.target.value)}
                />
                <input
                  type="time"
                  value={scheduleEndTime}
                  onChange={(e) => setScheduleEndTime(e.target.value)}
                />
                <input
                  type="text"
                  value={scheduleWith}
                  onChange={(e) => setScheduleWith(e.target.value)}
                  placeholder="Who with? (optional)"
                />
                <select
                  value={scheduleRoutineId}
                  onChange={(e) => {
                    setScheduleRoutineId(e.target.value)
                    const nextRoutine = routines.find((routine) => routine.id === e.target.value)
                    const nextVersions = nextRoutine?.choreographyVersions || []
                    setScheduleVersionId(nextVersions[nextVersions.length - 1]?.id || '')
                  }}
                >
                  {routines.map((routine) => (
                    <option key={routine.id} value={routine.id}>{routine.name}</option>
                  ))}
                </select>
                <select
                  value={scheduleVersionId}
                  onChange={(e) => setScheduleVersionId(e.target.value)}
                >
                  {selectedRoutineVersions.map((version, versionIndex) => (
                    <option key={version.id} value={version.id}>
                      v{versionIndex + 1}
                    </option>
                  ))}
                </select>
                <button onClick={handleSchedulePractice}>+ Schedule</button>
              </div>
            )}
          </>
        )}

        {addMode === 'event' && (
          <div className={styles['schedule-controls']}>
            {/* AED Quick-pick */}
            <div className={styles['aed-quick-pick']}>
              <label className={styles['field-label']}>AED Quick-pick</label>
              <div className={styles['aed-chips']}>
                {AED_TEMPLATES.map((t) => (
                  <button
                    key={t.name}
                    className={`${styles['aed-chip']} ${eventName === t.name ? styles['aed-chip-active'] : ''}`}
                    onClick={() => handlePickAedTemplate(t)}
                    title={`${t.venue} — ${t.startDate}`}
                  >
                    {getEventTypeIcon(t.eventType)} {t.region === 'national' ? 'National' : t.region.charAt(0).toUpperCase() + t.region.slice(1).replace('-', ' ')}
                  </button>
                ))}
              </div>
            </div>

            <div className={styles['event-form-row']}>
              <label className={styles['field-label']}>Type</label>
              <select value={eventType} onChange={(e) => setEventType(e.target.value)}>
                {EVENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.icon} {t.label}</option>
                ))}
              </select>
            </div>

            <input
              type="text"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              placeholder="Event name"
            />
            <input
              type="text"
              value={eventVenue}
              onChange={(e) => setEventVenue(e.target.value)}
              placeholder="Venue (optional)"
            />

            <div className={styles['event-date-row']}>
              <div>
                <label className={styles['field-label']}>Start</label>
                <input
                  type="date"
                  value={eventStartDate}
                  onChange={(e) => setEventStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className={styles['field-label']}>End</label>
                <input
                  type="date"
                  value={eventEndDate}
                  onChange={(e) => setEventEndDate(e.target.value)}
                />
              </div>
            </div>

            <button onClick={handleCreateEvent} disabled={!eventName.trim()}>
              + Create Event
            </button>
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
            const shows = getShowsForDay(day)
            const logged = isPracticeLogged(day)
            const isToday = isTodayCell(day)

            return (
              <div
                key={day}
                className={`${styles['day-cell']} ${isToday ? styles.today : ''}`}
              >
                {day}
                {logged && <div className={styles['practice-logged']} />}
                {(sessions.length > 0 || shows.length > 0) && (
                  <div className={styles['session-dots']}>
                    {sessions.map((s) => (
                      <div
                        key={s.id}
                        className={`${styles['session-dot']} ${styles[`dot-${s.type}`]}`}
                      />
                    ))}
                    {shows.map((s) => (
                      <div
                        key={s.id}
                        className={`${styles['session-dot']} ${styles['dot-event']}`}
                        title={s.name}
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
      {(upcoming.length > 0 || upcomingShows.length > 0) && (
        <div className={styles['upcoming-section']}>
          <h3>Coming Up</h3>
          <div className={styles['upcoming-list']}>
            {/* Upcoming shows/events */}
            {upcomingShows.map((s) => {
              const days = daysUntil(s.startDate || s.date)
              return (
                <div
                  key={s.id}
                  className={styles['upcoming-item']}
                  onClick={() => navigate(`/show/${s.id}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <span className={styles['upcoming-icon']}>
                    {getEventTypeIcon(s.eventType)}
                  </span>
                  <div className={styles['upcoming-info']}>
                    <div className={styles['upcoming-title']}>{s.name}</div>
                    <div className={styles['upcoming-date']}>
                      {formatDate(s.startDate || s.date)}
                      {s.venue && ` · ${s.venue}`}
                    </div>
                    {(s.entries || []).length > 0 && (
                      <div className={styles['upcoming-date']}>
                        {s.entries.length} entr{s.entries.length === 1 ? 'y' : 'ies'}
                      </div>
                    )}
                  </div>
                  <span className={`${styles['upcoming-countdown']} ${days <= 14 ? styles.soon : ''}`}>
                    {days} day{days !== 1 ? 's' : ''}
                  </span>
                </div>
              )
            })}

            {/* Upcoming sessions */}
            {upcoming.map((s) => {
              const sessionDate = getSessionDate(s)
              const days = daysUntil(sessionDate)
              const linked = getRoutineVersion(s)
              const timeRange = [s.startTime || s.time || '', s.endTime || ''].filter(Boolean).join(' - ')
              return (
                <div key={s.id} className={styles['upcoming-item']}>
                  <span className={styles['upcoming-icon']}>
                    {getSessionIcon(s.type)}
                  </span>
                  <div className={styles['upcoming-info']}>
                    <div className={styles['upcoming-title']}>
                      {s.with ? `Practice with ${s.with}` : (s.title || 'Practice')}
                    </div>
                    <div className={styles['upcoming-date']}>
                      {formatDate(sessionDate)}{timeRange ? ` · ${timeRange}` : ''}
                    </div>
                    {linked?.version && (
                      <div className={styles['upcoming-date']}>
                        Choreo: v{linked.versionIndex + 1}
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
