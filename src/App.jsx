import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useRegisterSW } from 'virtual:pwa-register/react'
import Layout from './components/Layout'
import { useApp } from './context/AppContext'

const Auth = lazy(() => import('./pages/Auth'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Timeline = lazy(() => import('./pages/Timeline'))
const Choreography = lazy(() => import('./pages/Choreography'))
const Scrapbook = lazy(() => import('./pages/Scrapbook'))
const TrophyShelf = lazy(() => import('./pages/TrophyShelf'))
const Settings = lazy(() => import('./pages/Settings'))

const fullscreenCenterStyle = { display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }

function AppLoading({ text = 'Loading...' }) {
  return <div style={fullscreenCenterStyle}>{text}</div>
}

export default function App() {
  const { isLoading, authLoading, isAuthenticated, hasSupabaseAuth, isKidMode } = useApp()
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
    return (
      <Suspense fallback={<AppLoading />}>
        <Auth />
      </Suspense>
    )
  }

  if (isLoading) {
    return <AppLoading />
  }

  return (
    <>
      <Layout>
        <Suspense fallback={<AppLoading />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/timeline/:type/:id" element={<Timeline />} />
            <Route path="/choreography/:routineId" element={<Choreography />} />
            <Route path="/show/:showId/entry/:entryId" element={isKidMode ? <Navigate to="/" replace /> : <Scrapbook />} />
            <Route path="/show/:showId" element={isKidMode ? <Navigate to="/" replace /> : <Scrapbook />} />
            <Route path="/trophies" element={<TrophyShelf />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
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
