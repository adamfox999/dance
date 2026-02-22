import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import ProfileSwitcher, { ProfileChip, KidModeBanner } from './ProfileSwitcher'
import styles from './Layout.module.css'

const navItems = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function Layout({ children }) {
  const { state, isKidMode, hasSupabaseAuth, isAuthenticated, activeProfileName, activeProfileEmoji } = useApp()
  const location = useLocation()
  const streak = getCurrentStreak(state.practiceLog)
  const isLiveView = location.pathname.startsWith('/choreography/') && new URLSearchParams(location.search).get('live') === 'true'
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const showProfiles = hasSupabaseAuth && isAuthenticated

  // Dynamic header title: show the active person's name
  const headerTitle = showProfiles
    ? (isKidMode ? `${activeProfileName} · My Dancing 💃` : `My Dancing 💃`)
    : `${state.settings?.dancerName || 'My Dancing'} · My Dancing 💃`

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

      {/* Bottom navigation */}
      {!isLiveView && (
        <nav className={styles['bottom-nav']}>
          {navItems.map((item) => {
            // In kid mode, hide Settings
            if (isKidMode && item.to === '/settings') return null
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `${styles['nav-item']} ${isActive ? styles.active : ''}`
                }
                end={item.to === '/'}
              >
                <span className={styles['nav-icon']}>{item.icon}</span>
                <span className={styles['nav-label']}>{item.label}</span>
              </NavLink>
            )
          })}
        </nav>
      )}

      {/* Profile switcher modal */}
      {showProfiles && (
        <ProfileSwitcher open={switcherOpen} onClose={() => setSwitcherOpen(false)} />
      )}
    </div>
  )
}
