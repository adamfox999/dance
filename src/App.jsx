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
import LiveViewSelect from './pages/LiveViewSelect'

export default function App() {
  const { isLoading } = useApp()

  if (isLoading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>Loading...</div>
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<LiveViewSelect />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/kid-timeline" element={<KidTimeline />} />
        <Route path="/choreography" element={<Choreography />} />
        <Route path="/rhythm" element={<RhythmGame />} />
        <Route path="/trophies" element={<TrophyShelf />} />
        <Route path="/calendar" element={<Calendar />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  )
}
