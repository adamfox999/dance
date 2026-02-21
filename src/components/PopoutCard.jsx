import { useState, useRef, useEffect, useCallback } from 'react'
import ReactPlayer from 'react-player'
import { useApp } from '../context/AppContext'
import { formatDateLong } from '../utils/helpers'
import { formatTimestamp } from '../utils/audioSync'
import { loadFile, findFirstExistingMediaUrl } from '../utils/fileStorage'
import CompareView from './CompareView'
import VisualiseMode from './VisualiseMode'
import styles from './PopoutCard.module.css'

const EMOJIS = ['⭐', '🦋', '💃', '🔥', '👏', '💪']

const REPO_MUSIC_CANDIDATES = [
  '/media/choreo-music.mp3',
  '/media/choreo-music.wav',
  '/media/choreo-music.m4a',
  '/media/Mia & Isla Modern Duet 2025_26.mp3',
]

export default function PopoutCard({ session, onClose }) {
  const { state, dispatch } = useApp()
  const [playbackRate, setPlaybackRate] = useState(1)
  const [mirrored, setMirrored] = useState(false)
  const [showCompare, setShowCompare] = useState(false)
  const [showVisualise, setShowVisualise] = useState(false)
  const [praiseInput, setPraiseInput] = useState('')
  const [workOnInput, setWorkOnInput] = useState('')
  const fileInputRef = useRef(null)
  const [localVideoUrl, setLocalVideoUrl] = useState(session.videoUrl || '')

  // Choreography cue overlay
  const [showCues, setShowCues] = useState(false)
  const [videoTime, setVideoTime] = useState(0)
  const playerRef = useRef(null)
  const cueAnimRef = useRef(null)

  // Audio mode: 'video' = use video's own audio, 'music' = mute video + play original music track in sync
  const [audioMode, setAudioMode] = useState('video')
  const musicAudioRef = useRef(null)

  const cues = state.choreography?.cues || []
  const syncOffset = (state.choreography?.videoSyncOffset || 0) / 1000 // convert ms → s
  const [musicUrl, setMusicUrl] = useState('')

  // Load music from IndexedDB on mount (persisted file, not stale blob URL)
  useEffect(() => {
    let cancelled = false

    const restoreMusic = async () => {
      try {
        const result = await loadFile('choreo-music')
        if (result && !cancelled) {
          setMusicUrl(URL.createObjectURL(result.blob))
          return
        }

        const bundledMusicUrl = await findFirstExistingMediaUrl(REPO_MUSIC_CANDIDATES)
        if (bundledMusicUrl && !cancelled) {
          setMusicUrl(bundledMusicUrl)
        }
      } catch {
        // ignore
      }
    }

    restoreMusic()
    return () => { cancelled = true }
  }, [])

  // Seek the music audio element to match the current video position (accounting for sync offset)
  const seekMusicToVideo = useCallback((videoSec) => {
    const audio = musicAudioRef.current
    if (!audio) return
    const target = videoSec - syncOffset
    if (target >= 0 && target <= audio.duration) {
      audio.currentTime = target
    } else if (target < 0) {
      // music hasn't started yet — cue it to 0 but keep paused until target time passes
      audio.currentTime = 0
    }
  }, [syncOffset])

  // When audio mode changes while video is playing, (un)mute and sync immediately
  useEffect(() => {
    const audio = musicAudioRef.current
    if (!audio) return
    if (audioMode === 'music') {
      seekMusicToVideo(videoTime)
      audio.play().catch(() => {})
    } else {
      audio.pause()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioMode])

  const handleVideoPlay = useCallback(() => {
    const audio = musicAudioRef.current
    if (!audio || audioMode !== 'music') return
    seekMusicToVideo(videoTime)
    audio.play().catch(() => {})
  }, [audioMode, videoTime, seekMusicToVideo])

  const handleVideoPause = useCallback(() => {
    musicAudioRef.current?.pause()
  }, [])

  const handleVideoSeek = useCallback((seconds) => {
    if (audioMode === 'music') seekMusicToVideo(seconds)
  }, [audioMode, seekMusicToVideo])

  // Track video time + drift-correct music audio every 300 ms
  const handleVideoProgress = useCallback(({ playedSeconds }) => {
    setVideoTime(playedSeconds)
    const audio = musicAudioRef.current
    if (!audio || audioMode !== 'music' || audio.paused) return
    const target = playedSeconds - syncOffset
    if (target >= 0 && Math.abs(audio.currentTime - target) > 0.3) {
      audio.currentTime = target
    }
  }, [audioMode, syncOffset])

  // Find the current cue based on adjusted video time
  const adjustedTime = videoTime - syncOffset
  const currentCueIdx = cues.reduce((acc, cue, i) => (adjustedTime >= cue.time ? i : acc), -1)
  const activeCue = currentCueIdx >= 0 ? cues[currentCueIdx] : null
  const nextCue = currentCueIdx + 1 < cues.length ? cues[currentCueIdx + 1] : null

  const handleVideoUpload = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      const url = URL.createObjectURL(file)
      setLocalVideoUrl(url)
      dispatch({
        type: 'UPDATE_SESSION',
        payload: { id: session.id, videoUrl: url },
      })
    }
  }

  const handleRatingClick = (chunkId, rating) => {
    dispatch({
      type: 'SET_CHUNK_RATING',
      payload: { sessionId: session.id, chunkId, rating },
    })
  }

  const handleAddEmoji = (emoji) => {
    dispatch({
      type: 'ADD_EMOJI_REACTION',
      payload: { sessionId: session.id, emoji },
    })
  }

  const handleAddPraise = () => {
    if (!praiseInput.trim()) return
    dispatch({
      type: 'ADD_PRAISE',
      payload: { sessionId: session.id, text: praiseInput.trim() },
    })
    setPraiseInput('')
  }

  const handleAddWorkOn = () => {
    if (!workOnInput.trim()) return
    dispatch({
      type: 'ADD_WORK_ON',
      payload: { sessionId: session.id, text: workOnInput.trim() },
    })
    setWorkOnInput('')
  }

  // Refresh session from state (to see live updates)
  const currentSession = state.sessions.find((s) => s.id === session.id) || session

  if (showCompare) {
    return (
      <CompareView
        session={currentSession}
        onClose={() => setShowCompare(false)}
      />
    )
  }

  if (showVisualise) {
    return (
      <VisualiseMode
        chunks={state.chunks}
        onClose={() => setShowVisualise(false)}
      />
    )
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles['card-header']}>
          <div className={styles['card-header-info']}>
            <h2>{currentSession.title}</h2>
            <div className={styles.date}>{formatDateLong(currentSession.date)}</div>
            <span
              className={`${styles['type-badge']} ${styles[`type-${currentSession.type}`]}`}
            >
              {currentSession.type}
              {currentSession.subType ? ` · ${currentSession.subType}` : ''}
            </span>
          </div>
          <button className={styles['close-btn']} onClick={onClose}>
            ✕
          </button>
        </div>

        <div className={styles['card-body']}>
          {/* Video */}
          <div className={styles.section}>
            <div className={styles['section-title']}>🎬 Video</div>
            <div
              className={styles['video-container']}
              style={mirrored ? { transform: 'scaleX(-1)' } : {}}
            >
              {localVideoUrl ? (
                <>
                  {/* Hidden audio element for original music track */}
                  {musicUrl && (
                    <audio
                      ref={musicAudioRef}
                      src={musicUrl}
                      style={{ display: 'none' }}
                    />
                  )}
                  <ReactPlayer
                    ref={playerRef}
                    url={localVideoUrl}
                    controls
                    playbackRate={playbackRate}
                    width="100%"
                    height="100%"
                    volume={audioMode === 'music' ? 0 : 1}
                    muted={audioMode === 'music'}
                    onProgress={handleVideoProgress}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onSeek={handleVideoSeek}
                    progressInterval={150}
                  />
                  {/* Cue overlay */}
                  {showCues && activeCue && (
                    <div className={styles['cue-overlay']}>
                      <span className={styles['cue-overlay-emoji']}>{activeCue.emoji}</span>
                      <span className={styles['cue-overlay-label']}>{activeCue.label}</span>
                      {nextCue && (
                        <span className={styles['cue-overlay-next']}>
                          Next: {nextCue.emoji} {nextCue.label}
                        </span>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className={styles['video-placeholder']}>
                  <span className={styles['upload-icon']}>📹</span>
                  <span>No video yet</span>
                  <button
                    className={styles['add-btn']}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Upload Video
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*"
                    style={{ display: 'none' }}
                    onChange={handleVideoUpload}
                  />
                </div>
              )}
            </div>

            {localVideoUrl && (
              <div className={styles['video-controls']}>
                {[0.5, 0.75, 1].map((rate) => (
                  <button
                    key={rate}
                    className={`${styles['video-control-btn']} ${playbackRate === rate ? styles.active : ''}`}
                    onClick={() => setPlaybackRate(rate)}
                  >
                    {rate}x {rate === 0.5 ? '🐢' : rate === 0.75 ? '🚶' : '🏃'}
                  </button>
                ))}
                <button
                  className={`${styles['video-control-btn']} ${mirrored ? styles.active : ''}`}
                  onClick={() => setMirrored(!mirrored)}
                >
                  🪞 Mirror
                </button>
                {cues.length > 0 && (
                  <button
                    className={`${styles['video-control-btn']} ${showCues ? styles.active : ''}`}
                    onClick={() => setShowCues(!showCues)}
                  >
                    🎶 Cues
                  </button>
                )}
                {musicUrl && (
                  <div className={styles['audio-mode-toggle']}>
                    <button
                      className={`${styles['audio-mode-btn']} ${audioMode === 'video' ? styles.active : ''}`}
                      onClick={() => setAudioMode('video')}
                      title="Use the video's own audio"
                    >
                      🎬 Video
                    </button>
                    <button
                      className={`${styles['audio-mode-btn']} ${audioMode === 'music' ? styles.active : ''}`}
                      onClick={() => setAudioMode('music')}
                      title="Play original music track, synced to video"
                    >
                      🎵 Music
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Side-by-side compare */}
          {localVideoUrl && (
            <button
              className={styles['compare-btn']}
              onClick={() => setShowCompare(true)}
            >
              📊 Compare with another session
            </button>
          )}

          {/* Visualise */}
          <button
            className={styles['visualise-btn']}
            onClick={() => setShowVisualise(true)}
          >
            🧘 Visualise the dance
          </button>

          {/* Chunk ratings (traffic lights) */}
          <div className={styles.section}>
            <div className={styles['section-title']}>🚦 How did each section go?</div>
            <div className={styles['chunk-ratings']}>
              {state.chunks.map((chunk) => {
                const current = currentSession.chunkRatings?.[chunk.id] || null
                return (
                  <div key={chunk.id} className={styles['chunk-rating-row']}>
                    <div className={styles['chunk-rating-label']}>
                      <span>{chunk.emoji}</span>
                      <span>{chunk.name}</span>
                    </div>
                    <div className={styles['traffic-lights']}>
                      {['green', 'yellow', 'red'].map((rating) => (
                        <button
                          key={rating}
                          className={`${styles['traffic-light']} ${styles[`tl-${rating}`]} ${current === rating ? styles.selected : ''}`}
                          onClick={() => handleRatingClick(chunk.id, rating)}
                          title={rating === 'green' ? 'Nailed it!' : rating === 'yellow' ? 'Getting there' : 'Needs work'}
                        >
                          {rating === 'green' ? '🟢' : rating === 'yellow' ? '🟡' : '🔴'}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Story beat */}
          {state.chunks.some((c) => c.story) && (
            <div className={styles.section}>
              <div className={styles['section-title']}>📖 The Story</div>
              {state.chunks.map((chunk) =>
                chunk.story ? (
                  <div key={chunk.id} className={styles['story-text']}>
                    <strong>{chunk.emoji} {chunk.name}:</strong> {chunk.story}
                  </div>
                ) : null
              )}
            </div>
          )}

          {/* Praise */}
          <div className={styles.section}>
            <div className={styles['section-title']}>🌟 Praise</div>
            <div className={styles['praise-list']}>
              {currentSession.praise.length > 0 ? (
                currentSession.praise.map((p, i) => (
                  <div key={i} className={styles['praise-item']}>
                    {p}
                  </div>
                ))
              ) : (
                <div className={styles['empty-state']}>
                  No praise yet — add some! 💜
                </div>
              )}
            </div>
            <div className={styles['add-input-row']}>
              <input
                className={styles['add-input']}
                placeholder="Add praise..."
                value={praiseInput}
                onChange={(e) => setPraiseInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddPraise()}
              />
              <button className={styles['add-btn']} onClick={handleAddPraise}>
                Add
              </button>
            </div>
          </div>

          {/* Work on */}
          <div className={styles.section}>
            <div className={styles['section-title']}>📝 Work On</div>
            <div className={styles['workon-list']}>
              {currentSession.workOn.length > 0 ? (
                currentSession.workOn.map((w, i) => (
                  <div key={i} className={styles['workon-item']}>
                    {w}
                  </div>
                ))
              ) : (
                <div className={styles['empty-state']}>
                  Nothing to work on — amazing! 🎉
                </div>
              )}
            </div>
            <div className={styles['add-input-row']}>
              <input
                className={styles['add-input']}
                placeholder="Add something to work on..."
                value={workOnInput}
                onChange={(e) => setWorkOnInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddWorkOn()}
              />
              <button className={styles['add-btn']} onClick={handleAddWorkOn}>
                Add
              </button>
            </div>
          </div>

          {/* Emoji reactions */}
          <div className={styles.section}>
            <div className={styles['section-title']}>😊 Reactions</div>
            <div className={styles['emoji-section']}>
              {currentSession.emojiReactions.map((emoji, i) => (
                <span key={i} className={styles['emoji-existing']}>
                  {emoji}
                </span>
              ))}
              <div className={styles['emoji-picker']}>
                {EMOJIS.map((emoji) => (
                  <button
                    key={emoji}
                    className={styles['emoji-btn']}
                    onClick={() => handleAddEmoji(emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
