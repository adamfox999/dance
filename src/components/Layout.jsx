import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import ProfileSwitcher, { ProfileChip } from './ProfileSwitcher'
import styles from './Layout.module.css'

export default function Layout({ children }) {
  const { practiceLog, settings, hasSupabaseAuth, isAuthenticated, isOnline, isUsingCachedData, lastSyncedAt } = useApp()
  const location = useLocation()
  const streak = getCurrentStreak(practiceLog)
  const isLiveView = location.pathname.startsWith('/choreography/') && new URLSearchParams(location.search).get('live') === 'true'
  const isTimelineView = location.pathname.startsWith('/timeline/')
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const showProfiles = hasSupabaseAuth && isAuthenticated

  // Dynamic header title: show the active person's name
  const headerTitle = showProfiles
    ? `My Dancing 💃`
    : `${settings?.dancerName || 'My Dancing'} · My Dancing 💃`

  const syncState = !isOnline
    ? 'offline'
    : (isUsingCachedData ? 'syncing' : 'online')
  const syncTitle = !isOnline
    ? 'Offline · showing cached data'
    : (isUsingCachedData
      ? `Syncing latest data${lastSyncedAt ? ` · Last sync ${new Date(lastSyncedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`
      : 'Online · all synced')

  return (
    <div className={styles.layout}>
      {/* Header */}
      {!isLiveView && (
        <header className={styles.header}>
          <div className={`${styles['header-title']} sparkle-text`}>
            {headerTitle}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {streak > 0 && (
              <div className={styles['header-streak']}>
                <span className={styles.flame}>🔥</span>
                {streak} day streak
              </div>
            )}
            {showProfiles && (
              <ProfileChip onClick={() => setSwitcherOpen(true)} syncState={syncState} syncTitle={syncTitle} />
            )}
          </div>
        </header>
      )}

      {/* Page content */}
      <main className={`${styles['main-content']} ${isTimelineView ? styles['main-content-no-scroll'] : ''}`}>
        {children}
      </main>

      {/* Profile switcher modal */}
      {showProfiles && (
        <ProfileSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      )}
    </div>
  )
}
