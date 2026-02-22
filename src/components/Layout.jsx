import { NavLink, useLocation } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getCurrentStreak } from '../utils/milestones'
import styles from './Layout.module.css'

const navItems = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/calendar', icon: '📅', label: 'Calendar' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function Layout({ children }) {
  const { state } = useApp()
  const location = useLocation()
  const streak = getCurrentStreak(state.practiceLog)
  const isLiveView = location.pathname.startsWith('/choreography/') && new URLSearchParams(location.search).get('live') === 'true'

  return (
    <div className={styles.layout}>
      {/* Header */}
      {!isLiveView && (
        <header className={styles.header}>
          <div className={`${styles['header-title']} sparkle-text`}>
            Isla's Dance Journey 💃
          </div>
          {streak > 0 && (
            <div className={styles['header-streak']}>
              <span className={styles.flame}>🔥</span>
              {streak} day streak
            </div>
          )}
        </header>
      )}

      {/* Page content */}
      <main className={styles['main-content']}>
        {children}
      </main>

      {/* Bottom navigation */}
      {!isLiveView && (
        <nav className={styles['bottom-nav']}>
          {navItems.map((item) => (
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
          ))}
        </nav>
      )}
    </div>
  )
}
