import { useState, useRef, useEffect, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import styles from './RhythmGame.module.css'

const LANES = ['←', '↓', '↑', '→']
const KEYS = ['ArrowLeft', 'ArrowDown', 'ArrowUp', 'ArrowRight']
const LANE_COLORS = ['#a855f7', '#ec4899', '#3b82f6', '#22c55e']

// Timing windows (ms)
const PERFECT_WINDOW = 80
const GOOD_WINDOW = 160

export default function RhythmGame() {
  const { state, dispatch } = useApp()
  const promptLeadMs = Math.max(0, Math.min(600, Number(state.settings?.promptLeadMs ?? 200)))
  const [gameState, setGameState] = useState('setup') // setup | playing | ended
  const [bpm, setBpm] = useState(120)
  const [musicFile, setMusicFile] = useState(null)
  const [musicUrl, setMusicUrl] = useState('')

  // Game stats
  const [score, setScore] = useState(0)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [perfects, setPerfects] = useState(0)
  const [goods, setGoods] = useState(0)
  const [misses, setMisses] = useState(0)
  const [hitFeedback, setHitFeedback] = useState(null)

  // Game internals
  const canvasRef = useRef(null)
  const notesRef = useRef([])
  const audioRef = useRef(null)
  const gameLoopRef = useRef(null)
  const startTimeRef = useRef(0)
  const scoreRef = useRef(0)
  const comboRef = useRef(0)

  // Tap BPM detection
  const [tapTimes, setTapTimes] = useState([])

  const handleTapBPM = () => {
    const now = Date.now()
    setTapTimes((prev) => {
      const recent = [...prev, now].filter((t) => now - t < 5000)
      if (recent.length > 1) {
        const intervals = []
        for (let i = 1; i < recent.length; i++) {
          intervals.push(recent[i] - recent[i - 1])
        }
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
        const detectedBPM = Math.round(60000 / avgInterval)
        setBpm(Math.max(60, Math.min(250, detectedBPM)))
      }
      return recent
    })
  }

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setMusicFile(file)
      setMusicUrl(URL.createObjectURL(file))
    }
  }

  // Generate random notes based on BPM
  const generateNotes = useCallback(() => {
    const beatInterval = 60000 / bpm
    const notes = []
    const totalBeats = 64 // ~32 seconds at 120bpm
    for (let i = 4; i < totalBeats; i++) {
      // Random lane, skip some beats for variety
      if (Math.random() > 0.35) {
        notes.push({
          lane: Math.floor(Math.random() * 4),
          time: i * beatInterval,
          hit: false,
          missed: false,
        })
      }
    }
    return notes
  }, [bpm])

  const startGame = () => {
    setScore(0)
    setCombo(0)
    setMaxCombo(0)
    setPerfects(0)
    setGoods(0)
    setMisses(0)
    scoreRef.current = 0
    comboRef.current = 0

    notesRef.current = generateNotes()
    startTimeRef.current = Date.now()
    setGameState('playing')

    // Play music if available
    if (musicUrl && audioRef.current) {
      audioRef.current.currentTime = 0
      audioRef.current.play().catch(() => {})
    }
  }

  function endGame() {
    if (audioRef.current) {
      audioRef.current.pause()
    }
    cancelAnimationFrame(gameLoopRef.current)
    setGameState('ended')

    const totalNotes = notesRef.current.length
    const accuracy = totalNotes > 0 ? Math.round(((perfects + goods) / totalNotes) * 100) : 0

    dispatch({
      type: 'ADD_RHYTHM_SCORE',
      payload: {
        id: `score-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        score: Math.round(scoreRef.current),
        accuracy,
        perfects,
        goods,
        misses,
        maxCombo,
        bpm,
      },
    })
  }

  // Key handler
  useEffect(() => {
    if (gameState !== 'playing') return

    const handleKey = (e) => {
      const laneIndex = KEYS.indexOf(e.key)
      if (laneIndex === -1) return
      e.preventDefault()

      const now = Date.now() - startTimeRef.current

      // Find closest unhit note in this lane
      let closest = null
      let closestDiff = Infinity

      for (const note of notesRef.current) {
        if (note.hit || note.missed || note.lane !== laneIndex) continue
        const diff = Math.abs(note.time - now)
        if (diff < closestDiff) {
          closestDiff = diff
          closest = note
        }
      }

      if (closest && closestDiff < GOOD_WINDOW) {
        closest.hit = true
        if (closestDiff < PERFECT_WINDOW) {
          scoreRef.current += 100 * (1 + comboRef.current * 0.1)
          comboRef.current++
          setPerfects((p) => p + 1)
          setHitFeedback({ text: 'Perfect!', color: '#22c55e' })
        } else {
          scoreRef.current += 50 * (1 + comboRef.current * 0.05)
          comboRef.current++
          setGoods((g) => g + 1)
          setHitFeedback({ text: 'Good!', color: '#facc15' })
        }
        setScore(Math.round(scoreRef.current))
        setCombo(comboRef.current)
        setMaxCombo((m) => Math.max(m, comboRef.current))
      } else {
        comboRef.current = 0
        setCombo(0)
        setMisses((m) => m + 1)
        setHitFeedback({ text: 'Miss', color: '#ef4444' })
      }

      // Clear feedback after 500ms
      setTimeout(() => setHitFeedback(null), 500)
    }

    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [gameState])

  // Game loop — canvas rendering
  useEffect(() => {
    if (gameState !== 'playing') return

    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const render = () => {
      const now = Date.now() - startTimeRef.current
      const w = canvas.width
      const h = canvas.height
      const laneWidth = w / 4
      const noteTravelTime = 2000 + promptLeadMs
      const scrollSpeed = h / noteTravelTime // pixels per ms

      // Clear
      ctx.clearRect(0, 0, w, h)

      // Draw lanes
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.04)'
        ctx.fillRect(i * laneWidth, 0, laneWidth, h)

        // Lane dividers
        ctx.strokeStyle = 'rgba(255,255,255,0.08)'
        ctx.beginPath()
        ctx.moveTo(i * laneWidth, 0)
        ctx.lineTo(i * laneWidth, h)
        ctx.stroke()
      }

      // Target line
      const targetY = h - 80
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)'
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.moveTo(0, targetY)
      ctx.lineTo(w, targetY)
      ctx.stroke()

      // Target zone labels
      ctx.font = '24px Fredoka'
      ctx.textAlign = 'center'
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)'
        ctx.fillText(LANES[i], i * laneWidth + laneWidth / 2, targetY + 30)
      }

      // Draw notes
      let allDone = true
      for (const note of notesRef.current) {
        if (note.hit) continue

        const y = targetY - (note.time - now) * scrollSpeed

        // Mark as missed if past target
        if (y > targetY + 100 && !note.missed) {
          note.missed = true
          comboRef.current = 0
          setCombo(0)
          setMisses((m) => m + 1)
        }

        if (note.missed) continue

        // Only render notes that are on screen
        if (y > -60 && y < h + 60) {
          allDone = false
          const x = note.lane * laneWidth + laneWidth / 2
          const radius = 22

          // Glow
          const gradient = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 1.5)
          gradient.addColorStop(0, LANE_COLORS[note.lane])
          gradient.addColorStop(1, 'transparent')
          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.arc(x, y, radius * 1.5, 0, Math.PI * 2)
          ctx.fill()

          // Note circle
          ctx.fillStyle = LANE_COLORS[note.lane]
          ctx.beginPath()
          ctx.arc(x, y, radius, 0, Math.PI * 2)
          ctx.fill()

          // Arrow
          ctx.fillStyle = 'white'
          ctx.font = '16px Fredoka'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(LANES[note.lane], x, y)
        } else if (y <= -60) {
          allDone = false
        }
      }

      // Hit feedback
      if (hitFeedback) {
        ctx.font = 'bold 28px Fredoka'
        ctx.fillStyle = hitFeedback.color
        ctx.textAlign = 'center'
        ctx.fillText(hitFeedback.text, w / 2, targetY - 40)
      }

      // Check game end
      if (allDone || now > notesRef.current[notesRef.current.length - 1]?.time + 3000) {
        endGame()
        return
      }

      gameLoopRef.current = requestAnimationFrame(render)
    }

    // Set canvas size
    const resize = () => {
      const container = canvas.parentElement
      canvas.width = container.clientWidth
      canvas.height = container.clientHeight
    }
    resize()
    window.addEventListener('resize', resize)

    gameLoopRef.current = requestAnimationFrame(render)

    return () => {
      cancelAnimationFrame(gameLoopRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [gameState, hitFeedback, promptLeadMs])

  const topScores = [...state.rhythmScores]
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)

  return (
    <div className={styles['rhythm-page']}>
      {gameState === 'setup' && (
        <>
          <h1>Rhythm Game 🎮</h1>
          <p className={styles.subtitle}>
            Use arrow keys or your dance mat to hit the notes!
          </p>

          <div className={styles['game-setup']}>
            {/* Music upload */}
            <div className={styles['setup-card']}>
              <h3>🎵 Music</h3>
              <button
                className={styles['file-upload-btn']}
                onClick={() => document.getElementById('music-input').click()}
              >
                {musicFile ? '✅ Change Music' : 'Upload Music'}
              </button>
              <input
                id="music-input"
                type="file"
                accept="audio/*"
                style={{ display: 'none' }}
                onChange={handleFileUpload}
              />
              {musicFile && (
                <div className={styles['file-name']}>{musicFile.name}</div>
              )}
            </div>

            {/* BPM */}
            <div className={styles['setup-card']}>
              <h3>🥁 BPM (Beats Per Minute)</h3>
              <div className={styles['bpm-input']}>
                <input
                  type="number"
                  value={bpm}
                  onChange={(e) => setBpm(Number(e.target.value))}
                  min={60}
                  max={250}
                />
                <span className={styles['bpm-label']}>BPM</span>
                <button className={styles['tap-btn']} onClick={handleTapBPM}>
                  Tap to detect
                </button>
              </div>
            </div>

            <button className={styles['start-btn']} onClick={startGame}>
              Start Game! 🚀
            </button>
          </div>

          {/* High scores */}
          {topScores.length > 0 && (
            <div className={styles['high-scores']}>
              <h3>🏅 High Scores</h3>
              <div className={styles['score-list']}>
                {topScores.map((s, i) => (
                  <div key={s.id} className={styles['score-entry']}>
                    <span className={styles.rank}>#{i + 1}</span>
                    <span>{s.score.toLocaleString()} pts</span>
                    <span>{s.accuracy}%</span>
                    <span>{s.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {gameState === 'playing' && (
        <>
          {musicUrl && <audio ref={audioRef} src={musicUrl} />}

          <div className={styles['game-hud']}>
            <div className={styles['hud-item']}>
              <span className={styles['hud-label']}>Score</span>
              <span className={styles['hud-value']}>{score.toLocaleString()}</span>
            </div>
            <div className={styles['hud-item']}>
              <span className={styles['hud-label']}>Combo</span>
              <span className={`${styles['hud-value']} ${styles.combo}`}>
                {combo}x
              </span>
            </div>
            <div className={styles['hud-item']}>
              <span className={styles['hud-label']}>Perfect</span>
              <span className={styles['hud-value']}>{perfects}</span>
            </div>
          </div>

          <div className={styles['game-canvas-container']}>
            <canvas ref={canvasRef} className={styles['game-canvas']} />
          </div>
        </>
      )}

      {gameState === 'ended' && (
        <div className={styles['game-end']}>
          <span className={styles['result-emoji']}>
            {perfects > goods + misses ? '🌟' : perfects + goods > misses ? '💃' : '💪'}
          </span>
          <h2>
            {perfects > goods + misses
              ? 'Amazing!'
              : perfects + goods > misses
                ? 'Great Job!'
                : 'Keep Practising!'}
          </h2>
          <div className={styles['score-display']}>
            {score.toLocaleString()}
          </div>

          <div className={styles['stats-grid']}>
            <div className={styles['stat-box']}>
              <div className={`${styles['stat-value']} ${styles['stat-perfect']}`}>
                {perfects}
              </div>
              <div className={styles['stat-label']}>Perfect</div>
            </div>
            <div className={styles['stat-box']}>
              <div className={`${styles['stat-value']} ${styles['stat-good']}`}>
                {goods}
              </div>
              <div className={styles['stat-label']}>Good</div>
            </div>
            <div className={styles['stat-box']}>
              <div className={`${styles['stat-value']} ${styles['stat-miss']}`}>
                {misses}
              </div>
              <div className={styles['stat-label']}>Miss</div>
            </div>
          </div>

          <p>Max Combo: {maxCombo}x 🔥</p>

          <button className={styles['play-again-btn']} onClick={startGame}>
            Play Again! 🎮
          </button>
          <button
            className={styles['back-btn']}
            onClick={() => setGameState('setup')}
          >
            Back to Setup
          </button>
        </div>
      )}
    </div>
  )
}
