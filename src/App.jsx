import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import { useApp } from './context/AppContext'
import Timeline from './pages/Timeline'
import KidTimeline from './pages/KidTimeline'
import Choreography from './pages/Choreography'
import RhythmGame from './pages/RhythmGame'
import TrophyShelf from './pages/TrophyShelf'
import Calendar from './pages/Calendar'
import Settings from './pages/Settings'

export default function App() {
  const { state, isLoading } = useApp()
  const isKidView = state.settings?.viewMode === 'kid'

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={isKidView ? <KidTimeline /> : <Timeline />} />
        <Route path="/choreography" element={isKidView ? <Navigate to="/" replace /> : <Choreography />} />
        <Route path="/rhythm" element={isKidView ? <Navigate to="/" replace /> : <RhythmGame />} />
        <Route path="/trophies" element={isKidView ? <Navigate to="/" replace /> : <TrophyShelf />} />
        <Route path="/calendar" element={isKidView ? <Navigate to="/" replace /> : <Calendar />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
