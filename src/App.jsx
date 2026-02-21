import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { useApp } from './context/AppContext'
import Dashboard from './pages/Dashboard'
import Timeline from './pages/Timeline'
import Choreography from './pages/Choreography'
import Scrapbook from './pages/Scrapbook'
import TrophyShelf from './pages/TrophyShelf'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'

export default function App() {
  const { isLoading } = useApp()

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return (
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
  )
}
