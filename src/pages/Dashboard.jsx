import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import styles from './Dashboard.module.css'

export default function Dashboard() {
  const { state, dispatch } = useApp()
  const navigate = useNavigate()
  const streak = getCurrentStreak(state.practiceLog)
  const today = new Date().toISOString().split('T')[0]
  const hasLoggedToday = state.practiceLog.includes(today)

  // Find current focus
  const currentFocus = state.islaProfile?.currentFocus
  const focusItem = currentFocus?.type === 'routine'
    ? state.routines.find(r => r.id === currentFocus.id)
    : currentFocus?.type === 'discipline'
      ? state.disciplines.find(d => d.id === currentFocus.id)
      : null

  // Find next upcoming show
  const upcomingShows = (state.shows || [])
    .filter(s => s.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
  const nextShow = upcomingShows[0]

  // Days until next show
  const daysUntilShow = nextShow
    ? Math.ceil((new Date(nextShow.date) - new Date(today)) / (1000 * 60 * 60 * 24))
    : null

  // Latest sticker
  const latestSticker = [...(state.stickers || [])]
    .sort((a, b) => (b.earnedDate || '').localeCompare(a.earnedDate || ''))
    .at(0)

  // Active goals (not completed)
  const activeGoals = (state.islaProfile?.goals || []).filter(g => !g.completedDate)

  const handleLogPractice = () => {
    dispatch({ type: 'LOG_PRACTICE', payload: today })
  }

  const handleGoalToggle = (goalId) => {
    dispatch({ type: 'COMPLETE_GOAL', payload: goalId })
  }

  return (
    <div className={styles.dashboard}>
      {/* Greeting */}
      <div className={styles.greeting}>
        <h1>Hey {state.islaProfile?.name || 'Isla'}! 👋</h1>
        <p className={styles.date}>{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Practice button */}
      <button
        className={`${styles.practiceBtn} ${hasLoggedToday ? styles.practiceDone : ''}`}
        onClick={handleLogPractice}
        disabled={hasLoggedToday}
      >
        {hasLoggedToday ? '✅ Practised Today!' : '💪 I Practised Today!'}
        {streak > 0 && <span className={styles.streakBadge}>🔥 {streak}</span>}
      </button>

      {/* Current Focus */}
      {focusItem && (
        <div
          className={styles.focusCard}
          onClick={() => {
            if (currentFocus.type === 'routine') navigate(`/choreography/${currentFocus.id}`)
            else navigate(`/timeline/discipline/${currentFocus.id}`)
          }}
        >
          <div className={styles.focusLabel}>Current Focus</div>
          <div className={styles.focusName}>
            {currentFocus.type === 'routine' ? '🎵' : focusItem.icon} {focusItem.name}
          </div>
          <div className={styles.focusAction}>Let's Go →</div>
        </div>
      )}

      {/* Upcoming show */}
      {nextShow && (
        <div className={styles.upcomingCard} onClick={() => navigate(`/show/${nextShow.id}`)}>
          <div className={styles.upcomingIcon}>🎭</div>
          <div className={styles.upcomingInfo}>
            <div className={styles.upcomingName}>{nextShow.name}</div>
            <div className={styles.upcomingDate}>
              {daysUntilShow === 0 ? 'Today!' : daysUntilShow === 1 ? 'Tomorrow!' : `${daysUntilShow} days to go`}
            </div>
          </div>
        </div>
      )}

      {/* My Dances (Routines) */}
      {state.routines.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Dances</h2>
          <div className={styles.cardGrid}>
            {state.routines.map(routine => {
              const videoCount = (routine.practiceVideos || []).length
              const formationEmoji = { solo: '👤', duet: '👥', trio: '👥', group: '👥👥' }[routine.formation] || '👤'
              return (
                routine.coverPhoto ? (
                  <div
                    key={routine.id}
                    className={styles.routineCardCover}
                    onClick={() => navigate(`/timeline/routine/${routine.id}`)}
                  >
                    <img src={routine.coverPhoto} alt={`${routine.name} cover`} className={styles.routineCoverImg} />
                    <div className={styles.routineCoverOverlay}>
                      <div className={styles.routineCoverName}>{routine.name}</div>
                      <div className={styles.routineCoverMeta}>
                        <span>{formationEmoji} {routine.formation}</span>
                        {videoCount > 0 && <span>📹 {videoCount}</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    key={routine.id}
                    className={styles.routineCard}
                    onClick={() => navigate(`/timeline/routine/${routine.id}`)}
                  >
                    <div className={styles.routineEmoji}>🎵</div>
                    <div className={styles.routineName}>{routine.name}</div>
                    <div className={styles.routineMeta}>
                      <span>{formationEmoji} {routine.formation}</span>
                      {videoCount > 0 && <span>📹 {videoCount}</span>}
                    </div>
                  </div>
                )
              )
            })}
          </div>
        </section>
      )}

      {/* My Disciplines */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>My Disciplines</h2>
        <div className={styles.cardGrid}>
          {state.disciplines.map(disc => {
            const totalElements = (disc.elements || []).length
            const masteredElements = (disc.elements || []).filter(e => e.status === 'mastered').length
            return (
              <div
                key={disc.id}
                className={styles.disciplineCard}
                onClick={() => navigate(`/timeline/discipline/${disc.id}`)}
              >
                <div className={styles.disciplineIcon}>{disc.icon}</div>
                <div className={styles.disciplineName}>{disc.name}</div>
                <div className={styles.disciplineGrade}>{disc.currentGrade}</div>
                {totalElements > 0 && (
                  <div className={styles.progressBar}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${(masteredElements / totalElements) * 100}%` }}
                    />
                    <span className={styles.progressText}>{masteredElements}/{totalElements}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* My Goals */}
      {activeGoals.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Goals 🎯</h2>
          <div className={styles.goalsList}>
            {activeGoals.map(goal => (
              <div key={goal.id} className={styles.goalItem}>
                <button
                  className={styles.goalCheck}
                  onClick={() => handleGoalToggle(goal.id)}
                >
                  ○
                </button>
                <span className={styles.goalText}>{goal.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Latest achievement */}
      {latestSticker && (
        <div className={styles.achievementCard} onClick={() => navigate('/trophies')}>
          <span className={styles.achievementIcon}>{latestSticker.icon}</span>
          <div>
            <div className={styles.achievementLabel}>Latest Achievement</div>
            <div className={styles.achievementName}>{latestSticker.label}</div>
          </div>
          <span className={styles.achievementArrow}>→</span>
        </div>
      )}

      {/* Empty state */}
      {state.routines.length === 0 && state.sessions.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyEmoji}>💃</div>
          <h3>Welcome to your Dance Journey!</h3>
          <p>Ask a grown-up to set up your first routine in Settings ⚙️</p>
        </div>
      )}
    </div>
  )
}
