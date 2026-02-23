import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import ProfileSwitcher, { ProfileChip, KidModeBanner } from './ProfileSwitcher'
import styles from './Layout.module.css'

export default function Layout({ children }) {
  const { practiceLog, settings, isKidMode, hasSupabaseAuth, isAuthenticated, activeProfileName } = useApp()
  const location = useLocation()
  const streak = getCurrentStreak(practiceLog)
  const isLiveView = location.pathname.startsWith('/choreography/') && new URLSearchParams(location.search).get('live') === 'true'
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const showProfiles = hasSupabaseAuth && isAuthenticated

  // Dynamic header title: show the active person's name
  const headerTitle = showProfiles
    ? (isKidMode ? `${activeProfileName} · My Dancing 💃` : `My Dancing 💃`)
    : `${settings?.dancerName || 'My Dancing'} · My Dancing 💃`

  return (
    <div className={styles.layout}>
      {/* Kid mode banner */}
      {!isLiveView && isKidMode && showProfiles && (
        <KidModeBanner onClick={() => setSwitcherOpen(true)} />
      )}

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
              <ProfileChip onClick={() => setSwitcherOpen(true)} />
            )}
          </div>
        </header>
      )}

      {/* Page content */}
      <main className={styles['main-content']}>
        {children}
      </main>

      {/* Profile switcher modal */}
      {showProfiles && (
        <ProfileSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      )}
    </div>
  )
}
