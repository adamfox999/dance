import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import { getEventTypeIcon } from '../data/aedEvents'
import styles from './Dashboard.module.css'

const AVATAR_EMOJIS = ['💃', '🩰', '👧', '👦', '🧒', '🌟', '✨', '🦋', '🎀', '🕺', '🤸']

export default function Dashboard() {
  const {
    state, dispatch, isKidMode, activeKidProfile, userProfile, sharedDances,
    hasSupabaseAuth, kidProfiles, addKidProfile, isAdmin,
    guardianFamilies,
  } = useApp()
  const navigate = useNavigate()
  const [setupKidName, setSetupKidName] = useState('')
  const [setupKidEmoji, setSetupKidEmoji] = useState('💃')
  const [setupBusy, setSetupBusy] = useState(false)
  const streak = getCurrentStreak(state.practiceLog)
  const today = new Date().toISOString().split('T')[0]
  const hasLoggedToday = state.practiceLog.includes(today)

  // Find current focus
  const currentFocus = state.dancerProfile?.currentFocus
  const focusItem = currentFocus?.type === 'routine'
    ? state.routines.find(r => r.id === currentFocus.id)
    : currentFocus?.type === 'discipline'
      ? state.disciplines.find(d => d.id === currentFocus.id)
      : null

  // Find next upcoming show
  const upcomingShows = (state.shows || [])
    .filter(s => (s.startDate || s.date) >= today)
    .sort((a, b) => (a.startDate || a.date).localeCompare(b.startDate || b.date))
  const nextShow = upcomingShows[0]

  // Days until next show
  const daysUntilShow = nextShow
    ? Math.ceil((new Date(nextShow.startDate || nextShow.date) - new Date(today)) / (1000 * 60 * 60 * 24))
    : null

  // Latest sticker
  const latestSticker = [...(state.stickers || [])]
    .sort((a, b) => (b.earnedDate || '').localeCompare(a.earnedDate || ''))
    .at(0)

  // Active goals (not completed)
  const activeGoals = (state.dancerProfile?.goals || []).filter(g => !g.completedDate)

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
        <h1>Hey {isKidMode ? (activeKidProfile?.display_name || 'Dancer') : (userProfile?.display_name || state.dancerProfile?.name || 'there')}! 👋</h1>
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

      {/* Kid setup prompt for new users */}
      {hasSupabaseAuth && !isKidMode && kidProfiles.length === 0 && isAdmin && (
        <div className={styles.setupCard}>
          <div style={{ fontSize: '1.3rem', marginBottom: 4 }}>🎉</div>
          <h3 style={{ margin: '0 0 4px', fontSize: '1rem' }}>Add your dancers</h3>
          <p style={{ fontSize: '0.82rem', color: '#6b7280', margin: '0 0 10px' }}>
            Add your children so you can assign dances to them, share with other parents, and let them switch to their own view.
          </p>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              value={setupKidEmoji}
              onChange={(e) => setSetupKidEmoji(e.target.value)}
              style={{ width: 46, fontSize: '1.2rem', textAlign: 'center', border: 'none', background: 'transparent' }}
            >
              {AVATAR_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
            <input
              type="text"
              placeholder="Child's name"
              value={setupKidName}
              onChange={(e) => setSetupKidName(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
            />
            <button
              style={{ padding: '8px 14px', borderRadius: 8, background: '#a855f7', color: '#fff', fontWeight: 700, fontSize: '0.85rem', border: 'none', cursor: 'pointer', whiteSpace: 'nowrap' }}
              disabled={setupBusy || !setupKidName.trim()}
              onClick={async () => {
                setSetupBusy(true)
                try {
                  await addKidProfile({ displayName: setupKidName.trim(), avatarEmoji: setupKidEmoji })
                  setSetupKidName('')
                  setSetupKidEmoji('💃')
                } catch (err) {
                  alert(err?.message || 'Could not add child')
                } finally {
                  setSetupBusy(false)
                }
              }}
            >
              + Add
            </button>
          </div>
          {kidProfiles.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {kidProfiles.map(kid => (
                <span key={kid.id} style={{ padding: '3px 10px', borderRadius: 20, background: '#ede9fe', color: '#7c3aed', fontWeight: 600, fontSize: '0.8rem' }}>
                  {kid.avatar_emoji} {kid.display_name}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

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
          <div className={styles.upcomingIcon}>{getEventTypeIcon(nextShow.eventType)}</div>
          <div className={styles.upcomingInfo}>
            <div className={styles.upcomingName}>{nextShow.name}</div>
            <div className={styles.upcomingDate}>
              {daysUntilShow === 0 ? 'Today!' : daysUntilShow === 1 ? 'Tomorrow!' : `${daysUntilShow} days to go`}
            </div>
            {(nextShow.entries || []).length > 0 && (
              <div className={styles.upcomingEntries}>
                {nextShow.entries.map((entry) => {
                  const r = state.routines.find((rt) => rt.id === entry.routineId)
                  return r ? (
                    <span key={entry.id} className={styles.upcomingEntryChip}>
                      🎵 {r.name}
                    </span>
                  ) : null
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* My Dances (Routines) */}
      {(() => {
        const visibleRoutines = isKidMode && activeKidProfile
          ? state.routines.filter(r => {
              const kids = r.kidProfileIds || []
              return kids.length === 0 || kids.includes(activeKidProfile.id)
            })
          : state.routines
        return visibleRoutines.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Dances</h2>
          <div className={styles.cardGrid}>
            {visibleRoutines.map(routine => {
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
        )
      })()}

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

      {/* Shared with me */}
      {!isKidMode && sharedDances.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Shared With Me</h2>
          <div className={styles.cardGrid}>
            {sharedDances.map(({ share, dance, ownerProfile }) => {
              if (!dance) return null
              const stateData = dance.state_data || {}
              const routines = stateData.routines || []
              const sharedRoutines = share.routine_id
                ? routines.filter(r => r.id === share.routine_id)
                : routines

              return sharedRoutines.map(routine => (
                <div
                  key={`${share.id}-${routine.id}`}
                  className={styles.routineCard}
                  style={{ opacity: 0.85, borderLeft: '3px solid #3b82f6' }}
                >
                  <div className={styles.routineEmoji}>👥</div>
                  <div className={styles.routineName}>{routine.name}</div>
                  <div className={styles.routineMeta}>
                    <span style={{ fontSize: '0.75rem', color: '#3b82f6' }}>
                      From {ownerProfile?.display_name || dance.name || 'a dancer'}
                    </span>
                  </div>
                </div>
              ))
            })}
          </div>
        </section>
      )}

      {/* Guardian families (I'm a guardian for another parent's kids) */}
      {!isKidMode && guardianFamilies && guardianFamilies.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>My Guardian Families 👨‍👩‍👧‍👦</h2>
          {guardianFamilies.map(({ guardian, ownerProfile, kids }) => (
            <div
              key={guardian.id}
              style={{
                background: '#f0f9ff', borderRadius: 14, padding: 14, marginBottom: 12,
                border: '1px solid #bae6fd',
              }}
            >
              <div style={{ fontSize: '0.88rem', fontWeight: 600, marginBottom: 8, color: '#0369a1' }}>
                {ownerProfile?.display_name || 'Family'}'s children
                <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 6 }}>
                  ({guardian.role})
                </span>
              </div>
              {kids.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {kids.map(kid => (
                    <div
                      key={kid.id}
                      style={{
                        background: '#fff', borderRadius: 10, padding: '8px 14px',
                        display: 'flex', alignItems: 'center', gap: 6,
                        border: '1px solid #e0e7ff', fontSize: '0.88rem',
                      }}
                    >
                      <span style={{ fontSize: '1.1rem' }}>{kid.avatar_emoji}</span>
                      <span style={{ fontWeight: 600 }}>{kid.display_name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>No children assigned yet</div>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Empty state */}
      {state.routines.length === 0 && state.sessions.length === 0 && (
        <div className={styles.emptyState}>
          <div className={styles.emptyEmoji}>💃</div>
          <h3>Welcome to My Dancing!</h3>
          <p>Ask a grown-up to set up your first routine in Settings ⚙️</p>
        </div>
      )}
    </div>
  )
}
