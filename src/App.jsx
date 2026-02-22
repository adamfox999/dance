import { Routes, Route, Navigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Layout from './components/Layout'
import { useApp } from './context/AppContext'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Timeline from './pages/Timeline'
import Choreography from './pages/Choreography'
import Scrapbook from './pages/Scrapbook'
import TrophyShelf from './pages/TrophyShelf'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'

export default function App() {
  const { isLoading, authLoading, isAuthenticated, hasSupabaseAuth } = useApp()
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // While checking auth session, show a loading spinner
  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.2rem', color: '#a855f7' }}>
        Loading…
      </div>
    )
  }

  // If Supabase auth is configured but user isn't signed in, show auth page
  if (hasSupabaseAuth && !isAuthenticated) {
    return <Auth />
  }

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return (
    <>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/timeline/:type/:id" element={<Timeline />} />
          <Route path="/choreography/:routineId" element={<Choreography />} />
          <Route path="/show/:showId" element={<Scrapbook />} />
          <Route path="/trophies" element={<TrophyShelf />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>

      {needRefresh && (
        <div className="update-banner" role="status" aria-live="polite">
          <span>Update available</span>
          <button type="button" onClick={() => updateServiceWorker(true)}>
            Refresh
          </button>
        </div>
      )}
    </>
  )
}
