import { useState, useRef } from 'react'
import ReactPlayer from 'react-player'
import { useApp } from '../context/AppContext'
import { formatDate } from '../utils/helpers'
import styles from './CompareView.module.css'

export default function CompareView({ session, onClose }) {
  const { state } = useApp()
  const [compareSessionId, setCompareSessionId] = useState('')
  const [playbackRate, setPlaybackRate] = useState(1)
  const [playing, setPlaying] = useState(false)
  const player1Ref = useRef(null)
  const player2Ref = useRef(null)

  const sessionsWithVideo = state.sessions.filter(
    (s) => s.videoUrl && s.id !== session.id
  )

  const compareSession = state.sessions.find((s) => s.id === compareSessionId)

  const handlePlayPause = () => {
    setPlaying(!playing)
  }

  return (
    <div className={styles.overlay}>
      <div className={styles['compare-header']}>
        <h2>📊 Side by Side Compare</h2>
        <button className={styles['close-btn']} onClick={onClose}>
          ✕
        </button>
      </div>

      <div className={styles['compare-body']}>
        {/* Left: current session */}
        <div className={styles['video-panel']}>
          <div className={styles['video-panel-label']}>
            {session.title} — {formatDate(session.date)}
          </div>
          <div className={styles['video-panel-content']}>
            {session.videoUrl ? (
              <ReactPlayer
                ref={player1Ref}
                url={session.videoUrl}
                playing={playing}
                playbackRate={playbackRate}
                width="100%"
                height="100%"
                controls
              />
            ) : (
              <div className={styles['no-video-text']}>No video uploaded</div>
            )}
          </div>
        </div>

        {/* Right: comparison session */}
        <div className={styles['video-panel']}>
          <div className={styles['video-panel-label']}>
            {compareSession
              ? `${compareSession.title} — ${formatDate(compareSession.date)}`
              : 'Pick a session to compare'}
          </div>
          <div className={styles['video-panel-content']}>
            {compareSession?.videoUrl ? (
              <ReactPlayer
                ref={player2Ref}
                url={compareSession.videoUrl}
                playing={playing}
                playbackRate={playbackRate}
                width="100%"
                height="100%"
                controls
              />
            ) : (
              <div className={styles['no-video-text']}>
                {sessionsWithVideo.length === 0
                  ? 'No other sessions have video yet'
                  : 'Select a session below ↓'}
              </div>
            )}
          </div>
          <div className={styles['session-picker']}>
            <select
              value={compareSessionId}
              onChange={(e) => setCompareSessionId(e.target.value)}
            >
              <option value="">Choose a session...</option>
              {sessionsWithVideo.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({formatDate(s.date)})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className={styles['compare-controls']}>
        <button className={styles['control-btn']} onClick={handlePlayPause}>
          {playing ? '⏸ Pause' : '▶ Play Both'}
        </button>
        {[0.5, 0.75, 1].map((rate) => (
          <button
            key={rate}
            className={`${styles['control-btn']} ${playbackRate === rate ? styles.active : ''}`}
            onClick={() => setPlaybackRate(rate)}
          >
            {rate}x
          </button>
        ))}
      </div>

      {compareSession && (
        <div className={styles['praise-banner']}>
          ✨ Look how much better you've got! Keep it up! ✨
        </div>
      )}
    </div>
  )
}
