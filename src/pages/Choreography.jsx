import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import { decodeAudioFile, extractWaveform, crossCorrelateSync, formatTimestamp } from '../utils/audioSync'
import { detectBeats, getCurrentBeatInfo } from '../utils/beatDetection'
import { saveFile, saveLocalFile, loadFile, loadLocalFile } from '../utils/fileStorage'
import { saveStateToBackend, listMediaFromBackend } from '../utils/backendApi'
import styles from './Choreography.module.css'
import VideoAnnotationLayer from '../components/VideoAnnotationLayer'
import annotationStyles from '../components/VideoAnnotationLayer.module.css'

function toDisplayFileName(name, maxLength = 34) {
  if (!name) return 'Not loaded'
  if (name.length <= maxLength) return name
  const dotIdx = name.lastIndexOf('.')
  if (dotIdx <= 0) return `${name.slice(0, maxLength - 1)}…`
  const ext = name.slice(dotIdx)
  const base = name.slice(0, dotIdx)
  const maxBase = Math.max(6, maxLength - ext.length - 1)
  return `${base.slice(0, maxBase)}…${ext}`
}

function formatFileSize(size) {
  const bytes = Number(size || 0)
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Keyword → emoji map for instruction auto-suggestions
const INSTRUCTION_EMOJI_MAP = [
  [/\b(spin|turn|pivot|pirouette)\b/i, '🌀'],
  [/\b(jump|leap|hop)\b/i, '🦘'],
  [/\b(kick|punt)\b/i, '🦵'],
  [/\b(slide|glide)\b/i, '🛝'],
  [/\b(wave|roll|ripple)\b/i, '🌊'],
  [/\b(clap|snap)\b/i, '👏'],
  [/\b(stomp|stamp|step)\b/i, '👣'],
  [/\b(shimmy|shake|vibrate)\b/i, '💫'],
  [/\b(pop|hit|lock)\b/i, '⚡'],
  [/\b(drop|floor|ground|down)\b/i, '⬇️'],
  [/\b(rise|up|stand|lift)\b/i, '⬆️'],
  [/\b(walk|march|strut)\b/i, '🚶'],
  [/\b(run|dash|sprint)\b/i, '🏃'],
  [/\b(pose|freeze|hold|stop)\b/i, '🧊'],
  [/\b(sway|rock|groove)\b/i, '🎶'],
  [/\b(reach|stretch|extend)\b/i, '🤸'],
  [/\b(point|finger)\b/i, '👉'],
  [/\b(hair|head|nod)\b/i, '💇'],
  [/\b(hip|hips|body.?roll)\b/i, '💃'],
  [/\b(arm|arms)\b/i, '💪'],
  [/\b(chest)\b/i, '🫁'],
  [/\b(slow|smooth|flow)\b/i, '🌙'],
  [/\b(fast|quick|sharp)\b/i, '⚡'],
  [/\b(circle|round)\b/i, '🔄'],
  [/\b(cross|switch)\b/i, '✖️'],
  [/\b(slide.*left|left)\b/i, '⬅️'],
  [/\b(slide.*right|right)\b/i, '➡️'],
  [/\b(back|backward)\b/i, '↩️'],
  [/\b(forward|front)\b/i, '↪️'],
  [/\b(roar)\b/i, '🦁'],
]

function suggestEmoji(text) {
  if (!text) return null
  for (const [pattern, emoji] of INSTRUCTION_EMOJI_MAP) {
    if (pattern.test(text)) return emoji
  }
  return null
}

// Generate slot arrays for beat counter
const BEAT_SLOTS = [1, 2, 3, 4, 5, 6, 7, 8]

export default function Choreography() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { routineId } = useParams()
  const { state, dispatch, isAdmin } = useApp()

  // Find the routine from the new data model
  const routine = state.routines?.find(r => r.id === routineId)
  const versions = routine?.choreographyVersions || []
  const [selectedVersionId, setSelectedVersionId] = useState(() => versions[versions.length - 1]?.id || null)
  const selectedVersion = versions.find(v => v.id === selectedVersionId) || versions[versions.length - 1] || {}
  // Alias so all existing code that reads `choreography.*` still works
  const choreography = selectedVersion

  const promptLeadMs = Math.max(0, Math.min(600, Number(state.settings?.promptLeadMs ?? 200)))
  const requestedView = searchParams.get('view') === 'kid' ? 'kid' : 'adult'
  const isKidLiveView = requestedView === 'kid'
  const isLiveOnly = searchParams.get('live') === 'true'
  const sessionId = searchParams.get('sessionId')
  const activeSession = sessionId ? (state.sessions || []).find((session) => session.id === sessionId) : null
  const liveVideoStorageKey = sessionId ? `rehearsal-video-${sessionId}` : 'choreo-video'

  // Modes: 'edit' | 'live'
  const [mode, setMode] = useState((isKidLiveView || isLiveOnly) ? 'live' : 'edit')

  // Keep selectedVersionId in sync when versions change
  useEffect(() => {
    const preferredVersionId = activeSession?.choreographyVersionId || versions[versions.length - 1]?.id || null
    if (!selectedVersionId && preferredVersionId) {
      setSelectedVersionId(preferredVersionId)
      return
    }
    if (versions.length && !versions.find(v => v.id === selectedVersionId)) {
      setSelectedVersionId(preferredVersionId)
    }
  }, [versions, selectedVersionId, activeSession?.choreographyVersionId])

  useEffect(() => {
    if (isKidLiveView || isLiveOnly) {
      setMode('live')
      setLiveEditOpen(false)
    }
  }, [isKidLiveView, isLiveOnly])

  useEffect(() => {
    if (!sessionId || !selectedVersionId) return
    if (activeSession?.choreographyVersionId) return
    dispatch({
      type: 'SET_REHEARSAL_VERSION',
      payload: {
        sessionId,
        choreographyVersionId: selectedVersionId,
      },
    })
  }, [sessionId, selectedVersionId, activeSession?.choreographyVersionId, dispatch])

  // Guard: if routine not found, redirect home
  useEffect(() => {
    if (!routine && state.routines?.length >= 0) {
      // Routine was deleted or ID is invalid
      if (routineId) navigate('/', { replace: true })
    }
  }, [routine, routineId, navigate, state.routines])

  // Audio state
  const audioRef = useRef(null)
  const [audioUrl, setAudioUrl] = useState(choreography.musicUrl || '')
  const [musicFileName, setMusicFileName] = useState(choreography.musicFileName || '')
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(choreography.duration || 0)
  const [playbackRate, setPlaybackRate] = useState(1)

  // Waveform
  const canvasRef = useRef(null)
  const [waveformData, setWaveformData] = useState(null)
  const animFrameRef = useRef(null)

  // Add cue form
  const [liveEditOpen, setLiveEditOpen] = useState(false) // edit panel in live mode

  // Song-level instruction editor
  const [showOffBeats, setShowOffBeats] = useState(false)
  const [editingInstId, setEditingInstId] = useState(null)
  const timelineContainerRef = useRef(null)
  const BEAT_ROW_HEIGHT = 28

  // Use refs for drag state so handlers always see fresh values
  const rangeStartRef = useRef(null)      // first-click beat position
  const dragEndRef = useRef(null)         // current drag end position
  const isDraggingRef = useRef(false)
  const dragStartYRef = useRef(0)         // pixel Y at pointer-down for threshold
  const DRAG_PX_THRESHOLD = 8            // must drag 8px to count as drag
  const didDragRef = useRef(false)        // true if last gesture was drag (skip click)
  // Mirror to state for re-render (UI highlight)
  const [rangeStartPos, setRangeStartPos] = useState(null)
  const [dragEndPos, setDragEndPos] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  // Resize-drag state for extending/shrinking existing instructions
  const resizingRef = useRef(null)        // { instId, edge: 'top'|'bottom', originalPos }
  const [resizingInstId, setResizingInstId] = useState(null)
  const [resizePreview, setResizePreview] = useState(null) // { instId, startPos, endPos }

  // Sync
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [manualSyncing, setManualSyncing] = useState(false)
  const [manualSyncMessage, setManualSyncMessage] = useState('')

  // Live mode video
  const [liveVideoUrl, setLiveVideoUrl] = useState('')
  const [videoFileName, setVideoFileName] = useState(choreography.videoFileName || '')
  const liveVideoRef = useRef(null)
  const [liveIsPlaying, setLiveIsPlaying] = useState(false)
  const [liveTime, setLiveTime] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const syncOffset = (choreography.videoSyncOffset || 0) / 1000 // ms → s
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [liveAudioMode, setLiveAudioMode] = useState(isKidLiveView ? 'video' : 'music') // 'music' | 'video'
  const [isLiveSeeking, setIsLiveSeeking] = useState(false)
  const [seekPreviewTime, setSeekPreviewTime] = useState(null)
  const [videoDownloadProgress, setVideoDownloadProgress] = useState(null)
  const [isVideoDownloading, setIsVideoDownloading] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaPickerType, setMediaPickerType] = useState('audio')
  const [mediaPickerItems, setMediaPickerItems] = useState([])
  const [mediaPickerLoading, setMediaPickerLoading] = useState(false)
  const [mediaPickerError, setMediaPickerError] = useState('')
  const [mediaPickerSelectingId, setMediaPickerSelectingId] = useState('')
  const musicPickerInputRef = useRef(null)
  const videoPickerInputRef = useRef(null)
  const isLiveVideoPlayback = !!liveVideoUrl

  // Feedback annotation mode
  const [feedbackMode, setFeedbackMode] = useState(false)
  const videoAnnotations = choreography.videoAnnotations || []

  useEffect(() => {
    if (isKidLiveView && liveVideoUrl) {
      setLiveAudioMode('video')
    }
  }, [isKidLiveView, liveVideoUrl])

  const getSafeSyncOffset = useCallback(() => {
    const total = liveVideoRef.current?.duration || liveDuration || duration || 0
    if (!Number.isFinite(total) || total <= 0) return syncOffset
    const maxPositive = Math.max(0, total - 0.2)
    return Math.max(-20, Math.min(syncOffset, maxPositive))
  }, [syncOffset, liveDuration, duration])

  const runSyncAnalysis = useCallback(async (musicFile, videoFile) => {
    if (!musicFile || !videoFile) return
    setSyncing(true)
    setSyncResult(null)
    try {
      const [musicBuf, videoBuf] = await Promise.all([
        decodeAudioFile(musicFile),
        decodeAudioFile(videoFile),
      ])
      const result = crossCorrelateSync(musicBuf, videoBuf)
      setSyncResult(result)
      if (routineId && selectedVersion?.id) {
        dispatch({
          type: 'UPDATE_CHOREOGRAPHY_VERSION',
          payload: {
            routineId,
            versionId: selectedVersion.id,
            updates: {
              videoSyncOffset: result.offsetMs,
              videoSyncConfidence: result.confidence,
            },
          },
        })
      }
    } catch (err) {
      console.warn('Sync failed:', err)
      setSyncResult({ offsetMs: 0, confidence: 0, error: true })
    } finally {
      setSyncing(false)
    }
  }, [dispatch])

  const closeMediaPicker = useCallback(() => {
    setMediaPickerOpen(false)
    setMediaPickerError('')
    setMediaPickerSelectingId('')
  }, [])

  const openMediaPicker = useCallback(async (type) => {
    const normalizedType = type === 'video' ? 'video' : 'audio'
    setMediaPickerType(normalizedType)
    setMediaPickerOpen(true)
    setMediaPickerError('')
    setMediaPickerItems([])
    setMediaPickerLoading(true)
    try {
      const items = await listMediaFromBackend(normalizedType)
      setMediaPickerItems(items)
    } catch (err) {
      setMediaPickerError(err?.message || 'Could not load media list')
    } finally {
      setMediaPickerLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!mediaPickerOpen) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeMediaPicker()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mediaPickerOpen, closeMediaPicker])

  // Beat detection
  const [beatData, setBeatData] = useState(null) // { bpm, firstBeat, beats[], eightCounts[] }
  const [showBeats, setShowBeats] = useState(true)
  const liveAnimRef = useRef(null)

  // ========== LOAD PERSISTED FILES ON MOUNT ==========
  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      try {
        const applyMusicBlob = async (blob, fileName = 'choreo-music.mp3', durationFromMeta = 0) => {
          const url = URL.createObjectURL(blob)
          setAudioUrl(url)
          setMusicFileName(fileName)
          if (durationFromMeta) setDuration(durationFromMeta)

          try {
            const audioBuffer = await decodeAudioFile(new File([blob], fileName || 'music.mp3', {
              type: blob.type || 'audio/mpeg',
            }))
            const peaks = extractWaveform(audioBuffer, 800)
            setWaveformData(peaks)
            setDuration(audioBuffer.duration)
            localStorage.setItem('choreo-waveform', JSON.stringify(peaks))

            try {
              const bd = detectBeats(audioBuffer)
              setBeatData(bd)
              localStorage.setItem('choreo-beats', JSON.stringify(bd))
            } catch (err) {
              console.warn('Could not detect beats for music:', err)
            }
          } catch (err) {
            console.warn('Could not decode music:', err)
          }
        }

        let resolvedMusic = false
        const localMusic = await loadLocalFile('choreo-music')
        if (localMusic?.blob && !cancelled) {
          await applyMusicBlob(localMusic.blob, localMusic.meta?.fileName || 'choreo-music.mp3', localMusic.meta?.duration || 0)
          resolvedMusic = true
        } else {
          // Final fallback: load from Supabase and cache locally for next run.
          if (!cancelled && !resolvedMusic) {
            const music = await loadFile('choreo-music')
            if (music?.blob) {
              try {
                await saveLocalFile('choreo-music', music.blob, music.meta || {})
              } catch (cacheErr) {
                console.warn('Could not cache fetched music locally:', cacheErr)
              }
              if (!cancelled) {
                await applyMusicBlob(music.blob, music.meta?.fileName || 'choreo-music.mp3', music.meta?.duration || 0)
                resolvedMusic = true
              }
            }
          }
        }

        // Video restore is local-first to avoid network lag during playback.
        let resolvedVideo = false
        const localVideo = await loadLocalFile(liveVideoStorageKey)
        if (localVideo?.blob && !cancelled) {
          setLiveVideoUrl(URL.createObjectURL(localVideo.blob))
          setVideoFileName(localVideo.meta?.fileName || activeSession?.rehearsalVideoName || '')
          resolvedVideo = true
        } else {
          // For rehearsal-linked playback, only use the rehearsal video key.
          if (sessionId) {
            const sessionVideo = await loadFile(liveVideoStorageKey)
            if (sessionVideo?.blob && !cancelled) {
              try {
                await saveLocalFile(liveVideoStorageKey, sessionVideo.blob, sessionVideo.meta || {})
              } catch (cacheErr) {
                console.warn('Could not cache rehearsal video locally:', cacheErr)
              }
              setLiveVideoUrl(URL.createObjectURL(sessionVideo.blob))
              setVideoFileName(sessionVideo.meta?.fileName || activeSession?.rehearsalVideoName || '')
              resolvedVideo = true
            }
          } else {
            // Final fallback: load from Supabase and cache locally for next run.
            if (!cancelled && !resolvedVideo) {
              setIsVideoDownloading(true)
              setVideoDownloadProgress(null)
              const video = await loadFile(liveVideoStorageKey)
              if (video?.blob) {
                try {
                  await saveLocalFile(liveVideoStorageKey, video.blob, video.meta || {})
                } catch (cacheErr) {
                  console.warn('Could not cache fetched video locally:', cacheErr)
                }
                if (!cancelled) {
                  setLiveVideoUrl(URL.createObjectURL(video.blob))
                  setVideoFileName(video.meta?.fileName || '')
                  resolvedVideo = true
                }
              }
              if (!cancelled) {
                setIsVideoDownloading(false)
              }
            }
          }
        }
      } catch (err) {
        console.warn('Could not restore files:', err)
      } finally {
        if (!cancelled) {
          setIsVideoDownloading(false)
        }
      }
      if (!cancelled) setFilesLoaded(true)
    }
    restore()
    return () => { cancelled = true }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const applyMusicFile = useCallback(async (file) => {
    if (!file) return

    try {
      const url = URL.createObjectURL(file)
      const audioBuffer = await decodeAudioFile(file)
      await saveFile('choreo-music', file, {
        fileName: file.name,
        type: file.type,
        size: file.size,
        duration: audioBuffer.duration,
      })

      setAudioUrl(url)
      setMusicFileName(file.name)
      const peaks = extractWaveform(audioBuffer, 800)
      setWaveformData(peaks)
      setDuration(audioBuffer.duration)

      try {
        const bd = detectBeats(audioBuffer)
        setBeatData(bd)
        localStorage.setItem('choreo-beats', JSON.stringify(bd))
      } catch (err) {
        console.warn('Beat detection failed:', err)
      }

      localStorage.setItem('choreo-waveform', JSON.stringify(peaks))

      dispatch({
        type: 'UPDATE_CHOREOGRAPHY_VERSION',
        payload: { routineId, versionId: selectedVersion?.id, updates: { musicUrl: url, musicFileName: file.name, duration: audioBuffer.duration } },
      })

      if (liveVideoUrl) {
        try {
          const videoResp = await fetch(liveVideoUrl)
          const videoBlob = await videoResp.blob()
          const videoFile = new File([videoBlob], 'video.mp4', { type: videoBlob.type || 'video/mp4' })
          await runSyncAnalysis(file, videoFile)
        } catch (syncErr) {
          console.warn('Could not run sync after music upload:', syncErr)
        }
      }
    } catch (err) {
      console.warn('Could not apply music change:', err)
      throw err
    }
  }, [dispatch, liveVideoUrl, routineId, runSyncAnalysis, selectedVersion?.id])

  // ========== MUSIC FILE UPLOAD ==========
  const handleMusicUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await applyMusicFile(file)
    } catch (err) {
      alert(err?.message || 'Could not save song. Check connection and try again.')
    }
    if (e.target) e.target.value = ''
  }

  // ========== WAVEFORM DRAWING ==========
  const drawWaveform = useCallback((time) => {
    const canvas = canvasRef.current
    if (!canvas || !waveformData) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const barWidth = W / waveformData.length
    const playedIndex = duration > 0 ? (time / duration) * waveformData.length : 0

    // Draw bars
    waveformData.forEach((peak, i) => {
      const h = peak * (H * 0.8)
      const x = i * barWidth
      const y = (H - h) / 2

      if (i < playedIndex) {
        ctx.fillStyle = 'rgba(168, 85, 247, 0.85)'
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.25)'
      }
      ctx.fillRect(x, y, Math.max(barWidth - 1, 1), h)
    })

    // Draw beat markers on waveform
    if (showBeats && beatData && duration > 0) {
      beatData.beats.forEach((beatTime, i) => {
        const xPos = (beatTime / duration) * W
        const countInGroup = (i % 8) + 1
        const isDownbeat = countInGroup === 1

        // Beat tick line
        ctx.strokeStyle = isDownbeat
          ? 'rgba(251, 191, 36, 0.7)'   // gold for count 1
          : 'rgba(251, 191, 36, 0.2)'   // faint for others
        ctx.lineWidth = isDownbeat ? 1.5 : 0.5
        ctx.beginPath()
        ctx.moveTo(xPos, isDownbeat ? 0 : H * 0.7)
        ctx.lineTo(xPos, H)
        ctx.stroke()

        // Count number on downbeats
        if (isDownbeat) {
          const group = Math.floor(i / 8) + 1
          ctx.fillStyle = 'rgba(251, 191, 36, 0.85)'
          ctx.font = 'bold 8px sans-serif'
          ctx.fillText(group, xPos + 2, H - 2)
        }
      })
    }

  }, [waveformData, duration, beatData, showBeats])

  // Animation loop for playback
  useEffect(() => {
    if (!isPlaying) return

    const tick = () => {
      if (audioRef.current) {
        const t = audioRef.current.currentTime
        setCurrentTime(t)
        drawWaveform(t)
      }
      animFrameRef.current = requestAnimationFrame(tick)
    }
    animFrameRef.current = requestAnimationFrame(tick)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying, drawWaveform])

  // Redraw waveform when data changes
  useEffect(() => {
    drawWaveform(currentTime)
  }, [waveformData, currentTime, drawWaveform])

  // ========== PLAYBACK CONTROLS ==========
  const togglePlay = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
    setIsPlaying(!isPlaying)
  }

  const handleAudioEnded = () => {
    setIsPlaying(false)
    if (!isLiveVideoPlayback) {
      setLiveIsPlaying(false)
    }
    const endTime = audioRef.current?.duration || duration || 0
    setCurrentTime(endTime)
    drawWaveform(endTime)
  }

  const handleLiveVideoEnded = () => {
    const video = liveVideoRef.current
    const audio = audioRef.current
    const endTime = video?.duration || liveDuration || 0

    if (video) {
      video.currentTime = endTime
    }
    setLiveTime(endTime)
    setLiveIsPlaying(false)

    if (liveAudioMode === 'music' && audio) {
      audio.pause()
      const musicEnd = audio.duration || duration || 0
      audio.currentTime = musicEnd
      setCurrentTime(musicEnd)
      setIsPlaying(false)
    }
  }

  const handleCanvasClick = (e) => {
    if (!audioRef.current || !duration) return
    const rect = canvasRef.current.getBoundingClientRect()
    const fraction = (e.clientX - rect.left) / rect.width
    const seekTime = fraction * duration
    audioRef.current.currentTime = seekTime
    setCurrentTime(seekTime)
    drawWaveform(seekTime)
  }

  const changeSpeed = (rate) => {
    setPlaybackRate(rate)
    if (audioRef.current) audioRef.current.playbackRate = rate
  }

  const applyVideoFile = useCallback(async (file) => {
    if (!file) return

    await saveFile(liveVideoStorageKey, file, {
      fileName: file.name,
      type: file.type,
      size: file.size,
    })

    const url = URL.createObjectURL(file)
    setLiveVideoUrl(url)
    setVideoFileName(file.name)
    setLiveTime(0)
    setLiveIsPlaying(false)

    if (sessionId) {
      dispatch({
        type: 'ATTACH_REHEARSAL_VIDEO',
        payload: {
          sessionId,
          rehearsalVideoKey: liveVideoStorageKey,
          rehearsalVideoName: file.name,
        },
      })
    } else {
      dispatch({
        type: 'UPDATE_CHOREOGRAPHY_VERSION',
        payload: { routineId, versionId: selectedVersion?.id, updates: { videoFileName: file.name } },
      })
    }

    if (audioUrl) {
      try {
        const musicResp = await fetch(audioUrl)
        const musicBlob = await musicResp.blob()
        const musicFile = new File([musicBlob], 'music.mp3', { type: musicBlob.type || 'audio/mpeg' })
        await runSyncAnalysis(musicFile, file)
      } catch (err) {
        console.warn('Sync failed:', err)
      }
    }
  }, [audioUrl, dispatch, liveVideoStorageKey, routineId, runSyncAnalysis, selectedVersion?.id, sessionId])

  // ========== LIVE MODE VIDEO ==========
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await applyVideoFile(file)
    } catch (err) {
      alert(err?.message || 'Could not save video. Check connection and try again.')
    }
    if (e.target) e.target.value = ''
  }

  const handlePickerUploadClick = () => {
    if (mediaPickerType === 'video') {
      videoPickerInputRef.current?.click()
    } else {
      musicPickerInputRef.current?.click()
    }
    closeMediaPicker()
  }

  const handlePickExistingMedia = async (item) => {
    if (!item?.id && !item?.key) return
    setMediaPickerError('')
    setMediaPickerSelectingId(item.id || item.key)
    try {
      const candidateKeys = Array.from(new Set([
        item.key,
        item.id,
        item.id ? String(item.id).replace(/^files\//, '') : '',
        item.storagePath ? String(item.storagePath).replace(/^files\//, '') : '',
      ].filter(Boolean)))

      let stored = null
      for (const key of candidateKeys) {
        stored = await loadFile(key)
        if (stored?.blob) break
      }

      if (!stored?.blob) {
        throw new Error('Could not load selected file')
      }

      const fileName = item.fileName || stored.meta?.fileName || item.id || item.key
      const fileType = item.type || stored.meta?.type || stored.meta?.contentType || stored.blob.type || (mediaPickerType === 'video' ? 'video/mp4' : 'audio/mpeg')
      const pickedFile = new File([stored.blob], fileName, { type: fileType })

      if (mediaPickerType === 'video') {
        await applyVideoFile(pickedFile)
      } else {
        await applyMusicFile(pickedFile)
      }

      closeMediaPicker()
    } catch (err) {
      setMediaPickerError(err?.message || 'Could not use selected media')
    } finally {
      setMediaPickerSelectingId('')
    }
  }

  // Keep music audio in sync with the live video (drift-correct every frame)
  const syncLiveAudio = useCallback((videoT) => {
    if (liveAudioMode !== 'music') return // only sync when playing separate music track
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    const target = videoT - syncOffset
    if (target < 0) {
      // Music hasn't reached its start point yet — keep it paused
      if (!audio.paused) audio.pause()
      return
    }
    // Music should be playing — auto-start if the video is playing but audio is paused
    if (audio.paused) {
      const video = liveVideoRef.current
      if (video && !video.paused) {
        audio.currentTime = target
        audio.play().catch(() => {
          setLiveAudioMode('video')
          video.muted = false
        })
      }
    } else if (Math.abs(audio.currentTime - target) > 0.25) {
      audio.currentTime = target
    }
  }, [audioUrl, syncOffset, liveAudioMode])

  const toggleLivePlay = () => {
    const video = liveVideoRef.current
    const audio = audioRef.current
    if (isLiveVideoPlayback && video) {
      if (liveIsPlaying) {
        video.pause()
        if (liveAudioMode === 'music') audio?.pause()
      } else {
        if (liveAudioMode === 'music' && audio && audioUrl) {
          const musicTarget = video.currentTime - syncOffset
          if (musicTarget >= 0) {
            // Music should already be playing at this video position
            audio.currentTime = musicTarget
            audio.play().catch(() => {
              setLiveAudioMode('video')
              video.muted = false
            })
          }
          // If musicTarget < 0, music hasn't started yet — syncLiveAudio will auto-start it
        }
        video.play().catch(() => {})
      }
    } else {
      // music-only fallback
      if (isPlaying) {
        audio?.pause()
        setIsPlaying(false)
        setLiveIsPlaying(false)
      } else {
        audio?.play()
        setIsPlaying(true)
        setLiveIsPlaying(true)
      }
    }
  }

  // Handle audio mode switch mid-playback
  useEffect(() => {
    if (!liveVideoUrl || !liveVideoRef.current) return
    const video = liveVideoRef.current
    const audio = audioRef.current
    if (liveAudioMode === 'music') {
      // Mute video, start music in sync
      video.muted = true
      if (liveIsPlaying && audio && audioUrl) {
        const musicTarget = video.currentTime - syncOffset
        if (musicTarget >= 0) {
          audio.currentTime = musicTarget
          audio.playbackRate = playbackRate
          audio.play().catch(() => {
            setLiveAudioMode('video')
            video.muted = false
          })
        }
        // If musicTarget < 0, syncLiveAudio will auto-start when the time comes
      }
    } else {
      // Unmute video, stop music
      video.muted = false
      if (audio) audio.pause()
    }
  }, [liveAudioMode, liveVideoUrl, audioUrl]) // re-run whenever video/audio URL changes so mute state is always correct

  // Seek live mode to a specific time
  const seekLive = (time) => {
    const video = liveVideoRef.current
    const audio = audioRef.current
    if (isLiveVideoPlayback && video) {
      video.currentTime = time
      setLiveTime(time)
      if (liveAudioMode === 'music' && audio && audioUrl) {
        const musicTarget = time - syncOffset
        if (musicTarget >= 0) {
          audio.currentTime = musicTarget
        } else {
          audio.pause()
        }
      }
    } else if (audio) {
      audio.currentTime = time
      setCurrentTime(time)
    }
  }

  const handleProgressClick = (e) => {
    if (liveTotalDuration <= 0) return
    const rect = e.currentTarget.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    seekLive(fraction * liveTotalDuration)
  }

  const getSeekTimeFromClientX = useCallback((clientX, element) => {
    const totalDuration = liveDuration || duration
    if (!element || totalDuration <= 0) return 0
    const rect = element.getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return fraction * totalDuration
  }, [liveDuration, duration])

  const handleProgressPointerDown = (e) => {
    if (liveTotalDuration <= 0) return
    const time = getSeekTimeFromClientX(e.clientX, e.currentTarget)
    setIsLiveSeeking(true)
    setSeekPreviewTime(time)
    seekLive(time)
  }

  useEffect(() => {
    if (!isLiveSeeking) return

    const onMove = (e) => {
      const track = document.getElementById('live-progress-track')
      if (!track) return
      const time = getSeekTimeFromClientX(e.clientX, track)
      setSeekPreviewTime(time)
      seekLive(time)
    }

    const onUp = () => {
      setIsLiveSeeking(false)
      setSeekPreviewTime(null)
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
  }, [isLiveSeeking, getSeekTimeFromClientX])

  const restartLive = () => {
    seekLive(0)
  }

  const changeLiveSpeed = (r) => {
    setPlaybackRate(r)
    if (liveVideoRef.current) liveVideoRef.current.playbackRate = r
    if (audioRef.current) audioRef.current.playbackRate = r
  }

  const handleLiveResync = async () => {
    if (!audioUrl || !liveVideoUrl || syncing) return
    try {
      const [musicResp, videoResp] = await Promise.all([
        fetch(audioUrl),
        fetch(liveVideoUrl),
      ])
      const [musicBlob, videoBlob] = await Promise.all([
        musicResp.blob(),
        videoResp.blob(),
      ])
      const musicFile = new File([musicBlob], 'music.mp3', { type: musicBlob.type || 'audio/mpeg' })
      const videoFile = new File([videoBlob], 'video.mp4', { type: videoBlob.type || 'video/mp4' })
      await runSyncAnalysis(musicFile, videoFile)
    } catch (err) {
      console.warn('Manual sync failed:', err)
      setSyncResult({ offsetMs: 0, confidence: 0, error: true })
      setSyncing(false)
    }
  }

  const handleManualSync = async () => {
    setManualSyncing(true)
    setManualSyncMessage('Syncing local data...')

    try {
      let localState = state
      const savedState = localStorage.getItem('dance-tracker-state')
      if (savedState) {
        try {
          localState = JSON.parse(savedState)
        } catch {
          localState = state
        }
      }

      await saveStateToBackend(localState)

      const localFileKeys = ['choreo-music', liveVideoStorageKey]
      let uploadedCount = 0

      for (const key of localFileKeys) {
        const localFile = await loadLocalFile(key)
        if (!localFile?.blob) continue
        await saveFile(key, localFile.blob, localFile.meta || {})
        uploadedCount += 1
      }

      if (uploadedCount === 0) {
        setManualSyncMessage('Synced state. 0 browser-local files found to upload.')
      } else {
        setManualSyncMessage(`Synced state and ${uploadedCount} local file${uploadedCount === 1 ? '' : 's'} to backend storage.`)
      }
    } catch (err) {
      console.error('Manual local sync failed:', err)
      setManualSyncMessage('Sync failed. Check backend env vars/policies and try again.')
    } finally {
      setManualSyncing(false)
    }
  }

  const handleCreateVersion = (mode = 'clone') => {
    if (!routineId) return
    const nextVersionNumber = versions.length + 1
    const clonedInstructions = mode === 'clone' ? JSON.parse(JSON.stringify(selectedVersion?.songInstructions || [])) : []
    const clonedCues = mode === 'clone' ? JSON.parse(JSON.stringify(selectedVersion?.cues || [])) : []

    const version = {
      id: generateId('cv'),
      label: mode === 'clone' ? `v${nextVersionNumber} amendment` : `v${nextVersionNumber} blank`,
      createdAt: new Date().toISOString(),
      musicUrl: mode === 'clone' ? (selectedVersion?.musicUrl || '') : '',
      musicFileName: mode === 'clone' ? (selectedVersion?.musicFileName || '') : '',
      duration: mode === 'clone' ? (selectedVersion?.duration || 0) : 0,
      songInstructions: clonedInstructions,
      cues: clonedCues,
      videoSyncOffset: mode === 'clone' ? (selectedVersion?.videoSyncOffset || 0) : 0,
      videoSyncConfidence: null,
      videoFileName: '',
    }

    dispatch({
      type: 'ADD_CHOREOGRAPHY_VERSION',
      payload: { routineId, version },
    })
    setSelectedVersionId(version.id)

    if (sessionId) {
      dispatch({
        type: 'SET_REHEARSAL_VERSION',
        payload: {
          sessionId,
          choreographyVersionId: version.id,
        },
      })
    }
  }

  // Derived time for live mode
  const effectiveLiveTime = isLiveVideoPlayback ? (liveTime - syncOffset) : currentTime
  const liveTotalDuration = liveDuration || duration

  // Derived beat info for live mode
  const liveBeatInfo = beatData ? getCurrentBeatInfo(effectiveLiveTime, beatData) : null

  // ========== SONG-LEVEL INSTRUCTIONS ==========
  const songInstructions = choreography.songInstructions || []
  const cues = choreography.cues || []
  const songInstructionsRef = useRef(songInstructions)
  songInstructionsRef.current = songInstructions

  const addSongInstruction = (startPos, endPos, text = '') => {
    const newId = generateId('sinst')
    const minPos = Math.min(startPos, endPos)
    const maxPos = Math.max(startPos, endPos)
    const updated = [...songInstructions, { id: newId, text, startPos: minPos, endPos: maxPos }]
    dispatch({ type: 'UPDATE_CHOREOGRAPHY_VERSION', payload: { routineId, versionId: selectedVersion?.id, updates: { songInstructions: updated } } })
    return newId
  }

  const updateSongInstruction = (id, patch) => {
    const updated = songInstructions.map(inst => inst.id === id ? { ...inst, ...patch } : inst)
    dispatch({ type: 'UPDATE_CHOREOGRAPHY_VERSION', payload: { routineId, versionId: selectedVersion?.id, updates: { songInstructions: updated } } })
  }

  const deleteSongInstruction = (id) => {
    dispatch({ type: 'UPDATE_CHOREOGRAPHY_VERSION', payload: { routineId, versionId: selectedVersion?.id, updates: { songInstructions: songInstructions.filter(i => i.id !== id) } } })
    if (editingInstId === id) setEditingInstId(null)
  }

  // Build visible timeline rows from beatData
  const timelineRows = useMemo(() => {
    if (!beatData?.beats) return []
    const rows = []
    beatData.beats.forEach((time, i) => {
      const countInGroup = (i % 8) + 1
      const groupNumber = Math.floor(i / 8) + 1
      const isDownbeat = countInGroup === 1 && i > 0
      rows.push({ pos: i, beatIndex: i, isOffBeat: false, time, count: countInGroup, group: groupNumber, isDownbeat })
      if (showOffBeats && i < beatData.beats.length - 1) {
        const midTime = (time + beatData.beats[i + 1]) / 2
        rows.push({ pos: i + 0.5, beatIndex: i, isOffBeat: true, time: midTime, count: countInGroup, group: groupNumber })
      }
    })
    return rows
  }, [beatData, showOffBeats])

  // Map a position (beat index or beat+0.5) to a row pixel offset
  const posToRowY = useCallback((pos) => {
    const idx = timelineRows.findIndex(r => r.pos >= pos)
    if (idx === -1) return timelineRows.length * BEAT_ROW_HEIGHT
    return idx * BEAT_ROW_HEIGHT
  }, [timelineRows])

  // Click handler for two-click range creation (on each beat row)
  const handleBeatClick = (pos) => {
    // Skip if this click is the tail end of a drag gesture
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    if (rangeStartRef.current === null) {
      // First click — mark start
      rangeStartRef.current = pos
      setRangeStartPos(pos)
      setDragEndPos(null)
      setIsDragging(false)
    } else {
      // Second click — complete range
      const startPos = rangeStartRef.current
      const newId = addSongInstruction(startPos, pos)
      setEditingInstId(newId)
      rangeStartRef.current = null
      dragEndRef.current = null
      isDraggingRef.current = false
      setRangeStartPos(null)
      setDragEndPos(null)
      setIsDragging(false)
    }
  }

  // ─── Resize handlers for instruction edge drag ───
  const resizeFinalRef = useRef(null) // stores final {instId, startPos, endPos} for commit

  const handleResizePointerDown = (e, instId, edge) => {
    e.stopPropagation()
    e.preventDefault()
    const inst = songInstructions.find(i => i.id === instId)
    if (!inst) return
    resizingRef.current = { instId, edge, originalPos: edge === 'top' ? inst.startPos : inst.endPos }
    resizeFinalRef.current = { instId, startPos: inst.startPos, endPos: inst.endPos }
    setResizingInstId(instId)
    setResizePreview({ instId, startPos: inst.startPos, endPos: inst.endPos })

    const onMove = (ev) => {
      const container = timelineContainerRef.current
      if (!container || !resizingRef.current) return
      const rect = container.getBoundingClientRect()
      const y = ev.clientY - rect.top + container.scrollTop
      const rowIdx = Math.min(Math.max(Math.floor(y / BEAT_ROW_HEIGHT), 0), timelineRows.length - 1)
      if (!timelineRows[rowIdx]) return
      const newPos = timelineRows[rowIdx].pos

      setResizePreview(prev => {
        if (!prev) return prev
        let updated
        if (resizingRef.current.edge === 'top') {
          const clamped = Math.min(newPos, prev.endPos)
          updated = { ...prev, startPos: clamped }
        } else {
          const clamped = Math.max(newPos, prev.startPos)
          updated = { ...prev, endPos: clamped }
        }
        // Keep ref in sync so onUp always has the latest
        resizeFinalRef.current = updated
        return updated
      })
    }

    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // Commit from the ref (always has latest dragged positions)
      const final = resizeFinalRef.current
      if (final) {
        const latest = songInstructionsRef.current
        const updated = latest.map(inst => inst.id === final.instId ? { ...inst, startPos: final.startPos, endPos: final.endPos } : inst)
        dispatch({ type: 'UPDATE_CHOREOGRAPHY_VERSION', payload: { routineId, versionId: selectedVersion?.id, updates: { songInstructions: updated } } })
        resizeFinalRef.current = null
      }
      setResizePreview(null)
      setResizingInstId(null)
      resizingRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  // Pointer handlers on the container for drag-to-select
  const handleTimelinePointerDown = (e) => {
    const container = timelineContainerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const y = e.clientY - rect.top + container.scrollTop
    const rowIdx = Math.min(Math.max(Math.floor(y / BEAT_ROW_HEIGHT), 0), timelineRows.length - 1)
    if (!timelineRows[rowIdx]) return
    dragStartYRef.current = e.clientY
    dragEndRef.current = timelineRows[rowIdx].pos
    isDraggingRef.current = false
    didDragRef.current = false
  }

  const handleTimelinePointerMove = (e) => {
    if (dragStartYRef.current === 0 && rangeStartRef.current === null) return
    const container = timelineContainerRef.current
    if (!container) return
    const pixelDist = Math.abs(e.clientY - dragStartYRef.current)
    if (pixelDist < DRAG_PX_THRESHOLD) return // not a drag yet

    // Entered drag mode
    const rect = container.getBoundingClientRect()
    const y = e.clientY - rect.top + container.scrollTop
    const rowIdx = Math.min(Math.max(Math.floor(y / BEAT_ROW_HEIGHT), 0), timelineRows.length - 1)
    if (!timelineRows[rowIdx]) return
    const newPos = timelineRows[rowIdx].pos

    if (!isDraggingRef.current) {
      // First time crossing threshold — start drag
      isDraggingRef.current = true
      // If we had a pending two-click start, use that as the drag start
      if (rangeStartRef.current === null) {
        // Fresh drag from pointerDown position
        const startRowIdx = Math.min(Math.max(Math.floor((dragStartYRef.current - rect.top + container.scrollTop) / BEAT_ROW_HEIGHT), 0), timelineRows.length - 1)
        rangeStartRef.current = timelineRows[startRowIdx]?.pos ?? newPos
        setRangeStartPos(rangeStartRef.current)
      }
      setIsDragging(true)
    }

    dragEndRef.current = newPos
    setDragEndPos(newPos)
  }

  const handleTimelinePointerUp = () => {
    if (isDraggingRef.current && rangeStartRef.current !== null && dragEndRef.current !== null) {
      // Drag completed — create range
      const newId = addSongInstruction(rangeStartRef.current, dragEndRef.current)
      setEditingInstId(newId)
      rangeStartRef.current = null
      dragEndRef.current = null
      isDraggingRef.current = false
      didDragRef.current = true  // tell the click handler to skip
      setRangeStartPos(null)
      setDragEndPos(null)
      setIsDragging(false)
    }
    dragStartYRef.current = 0
  }

  // Active song instruction for live display (returns { text, id, emoji } or null)
  // Triggers PEAK_OFFSET seconds early so the spring animation peaks ON the beat
  const liveSongInstruction = useMemo(() => {
    if (!beatData?.beats?.length || !songInstructions.length) {
      if (!cues.length) return null
      const sortedCues = [...cues].sort((a, b) => a.time - b.time)
      const time = effectiveLiveTime

      for (let i = 0; i < sortedCues.length; i++) {
        const cue = sortedCues[i]
        const nextCue = sortedCues[i + 1]
        const startTime = cue.time
        const endTime = nextCue ? nextCue.time : cue.time + 2
        if (time >= startTime && time < endTime) {
          return {
            text: cue.label,
            id: cue.id,
            emoji: cue.emoji || suggestEmoji(cue.label),
          }
        }
      }
      return null
    }
    const time = effectiveLiveTime
    const beatInterval = 60 / beatData.bpm
    // cue-slam is 0.25s; text reaches full scale at 40% = 0.1s
    const PEAK_OFFSET = 0.1

    // Convert a beat position (e.g. 3 or 3.5) to an absolute time in seconds
    const getBeatTime = (pos) => {
      const beatIdx = Math.floor(pos)
      if (beatIdx < 0 || beatIdx >= beatData.beats.length) return null
      let t = beatData.beats[beatIdx]
      if (pos % 1 !== 0) t += beatInterval * 0.5 // off-beat
      return t
    }

    const matches = []
    for (const inst of songInstructions) {
      if (!String(inst.text || '').trim()) continue
      const startTime = getBeatTime(inst.startPos)
      if (startTime == null) continue
      const endTime = getBeatTime(inst.endPos)
      // Show early by PEAK_OFFSET so animation peak lands on the beat
      const triggerTime = startTime - PEAK_OFFSET
      // Stay visible until half a beat after the last position
      const hideTime = endTime != null ? endTime + beatInterval * 0.5 : startTime + beatInterval
      if (time >= triggerTime && time < hideTime) {
        matches.push(inst)
      }
    }
    if (matches.length === 0) return null
    // Prefer narrower (more specific) instructions
    matches.sort((a, b) => (a.endPos - a.startPos) - (b.endPos - b.startPos))
    const best = matches[0]
    return { text: best.text, id: best.id, emoji: best.emoji || suggestEmoji(best.text) }
  }, [effectiveLiveTime, beatData, songInstructions, cues])

  // Next upcoming instruction for preview
  const nextSongInstruction = useMemo(() => {
    if (!beatData?.beats?.length || !songInstructions.length) {
      if (!cues.length) return null
      const time = effectiveLiveTime
      const nextCue = [...cues]
        .sort((a, b) => a.time - b.time)
        .find((cue) => cue.time > time)

      if (!nextCue) return null
      return {
        text: nextCue.label,
        id: nextCue.id,
        emoji: nextCue.emoji || suggestEmoji(nextCue.label),
      }
    }
    const time = effectiveLiveTime
    const beatInterval = 60 / beatData.bpm

    const getBeatTime = (pos) => {
      const beatIdx = Math.floor(pos)
      if (beatIdx < 0 || beatIdx >= beatData.beats.length) return null
      let t = beatData.beats[beatIdx]
      if (pos % 1 !== 0) t += beatInterval * 0.5
      return t
    }

    // Find instructions that haven't started yet
    const upcoming = songInstructions
      .filter(inst => {
        if (!String(inst.text || '').trim()) return false
        const startTime = getBeatTime(inst.startPos)
        if (startTime == null) return false
        // Exclude the currently active instruction
        if (liveSongInstruction && inst.id === liveSongInstruction.id) return false
        return startTime > time
      })
      .sort((a, b) => a.startPos - b.startPos)

    if (upcoming.length === 0) return null
    const next = upcoming[0]
    return { text: next.text, id: next.id, emoji: next.emoji || suggestEmoji(next.text) }
  }, [effectiveLiveTime, beatData, songInstructions, liveSongInstruction, cues])

  // ESC key handler: cancel beat range selection
  useEffect(() => {
    if (!liveEditOpen) return
    const handleEsc = (e) => {
      if (e.key === 'Escape' && rangeStartRef.current !== null && !editingInstId) {
        e.preventDefault()
        rangeStartRef.current = null
        dragEndRef.current = null
        isDraggingRef.current = false
        didDragRef.current = false
        setRangeStartPos(null)
        setDragEndPos(null)
        setIsDragging(false)
      }
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [liveEditOpen, editingInstId])

  // Auto-scroll timeline to current beat during playback
  useEffect(() => {
    if (!liveEditOpen || !timelineContainerRef.current || !liveBeatInfo || !timelineRows.length) return
    const currentRowIdx = timelineRows.findIndex(r =>
      r.beatIndex === liveBeatInfo.beatIndex && !r.isOffBeat
    )
    if (currentRowIdx === -1) return
    const targetScroll = currentRowIdx * BEAT_ROW_HEIGHT - timelineContainerRef.current.clientHeight / 2
    timelineContainerRef.current.scrollTo({ top: Math.max(0, targetScroll), behavior: 'smooth' })
  }, [liveBeatInfo?.beatIndex, liveEditOpen])

  // High-frequency update loop for live mode (beat counter needs 60fps)
  useEffect(() => {
    if (mode !== 'live' || !liveIsPlaying) {
      if (liveAnimRef.current) cancelAnimationFrame(liveAnimRef.current)
      return
    }
    const tick = () => {
      if (liveVideoRef.current) {
        setLiveTime(liveVideoRef.current.currentTime)
      }
      liveAnimRef.current = requestAnimationFrame(tick)
    }
    liveAnimRef.current = requestAnimationFrame(tick)
    return () => {
      if (liveAnimRef.current) cancelAnimationFrame(liveAnimRef.current)
    }
  }, [mode, liveIsPlaying])

  // ========== VIDEO SYNC ==========

  const nudgeOffset = (delta) => {
    const newOffset = (choreography.videoSyncOffset || 0) + delta
    if (routineId && selectedVersion?.id) {
      dispatch({
        type: 'UPDATE_CHOREOGRAPHY_VERSION',
        payload: {
          routineId,
          versionId: selectedVersion.id,
          updates: {
            videoSyncOffset: newOffset,
            videoSyncConfidence: null,
          },
        },
      })
    }
  }

  // ========== KEYBOARD SHORTCUTS ==========
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // ========== RENDER ==========
  const playheadLeft = duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
  const liveProgressTime = isLiveVideoPlayback ? liveTime : currentTime
  const liveProgressLeft = liveTotalDuration > 0
    ? `${(liveProgressTime / liveTotalDuration) * 100}%`
    : '0%'
  const displayMusicName = toDisplayFileName(musicFileName)
  const displayVideoName = toDisplayFileName(videoFileName)
  const hasSyncResult = Number.isFinite(Number(choreography.videoSyncOffset)) || (!!syncResult && !syncResult.error)
  const syncOffsetMs = Math.round(syncResult?.offsetMs ?? choreography.videoSyncOffset ?? 0)
  const syncConfidence = syncResult?.error
    ? null
    : (Number.isFinite(syncResult?.confidence)
      ? syncResult.confidence
      : (Number.isFinite(choreography.videoSyncConfidence) ? choreography.videoSyncConfidence : null))
  const syncLabel = syncing
    ? '⏳ Syncing...'
    : (hasSyncResult
      ? `✅ Synced • ${syncOffsetMs}ms${syncConfidence != null ? ` • ${(syncConfidence * 100).toFixed(0)}%` : ''}`
      : '🔗 Tap to Sync')

  return (
    <div className={styles['choreo-page']}>
      {/* Hidden audio element */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onEnded={handleAudioEnded}
          onLoadedMetadata={(e) => {
            e.target.muted = false
            e.target.volume = 1
            if (!duration) setDuration(e.target.duration)
          }}
        />
      )}

      {!isKidLiveView && !isLiveOnly && (
        <>
          {/* Header */}
          <div className={styles['choreo-header']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', padding: 0 }}>←</button>
              <h1>🎶 {routine?.name || 'Choreography'}</h1>
              {versions.length > 0 && (
                <>
                  <select
                    value={selectedVersionId || ''}
                    onChange={(e) => {
                      const nextVersionId = e.target.value
                      setSelectedVersionId(nextVersionId)
                      if (sessionId) {
                        dispatch({
                          type: 'SET_REHEARSAL_VERSION',
                          payload: {
                            sessionId,
                            choreographyVersionId: nextVersionId,
                          },
                        })
                      }
                    }}
                    style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: 6 }}
                  >
                    {versions.map((v, i) => (
                      <option key={v.id} value={v.id}>
                        v{i + 1}{v.label ? ` — ${v.label}` : ''} {v.createdAt ? `(${new Date(v.createdAt).toLocaleDateString()})` : ''}
                      </option>
                    ))}
                  </select>
                  {isAdmin && (
                    <>
                      <button
                        className={styles['sync-btn']}
                        onClick={() => handleCreateVersion('clone')}
                        style={{ padding: '4px 10px' }}
                      >
                        + New from Previous
                      </button>
                      <button
                        className={styles['sync-btn']}
                        onClick={() => handleCreateVersion('blank')}
                        style={{ padding: '4px 10px', background: 'var(--gray-600)' }}
                      >
                        + New Blank
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            <p className={styles.subtitle}>
              Load music &bull; Press <b>Space</b> to play &bull; Use <b>Live Mode</b> to add instructions
            </p>
            {isAdmin && (
              <div className={styles['sync-row']}>
                <button
                  className={styles['sync-btn']}
                  onClick={handleManualSync}
                  disabled={manualSyncing}
                  title="Push local browser data to Supabase"
                >
                  {manualSyncing ? '⏳ Syncing...' : '☁️ Sync Local Data'}
                </button>
                {manualSyncMessage && (
                  <span className={styles['sync-status']}>
                    {manualSyncMessage}
                  </span>
                )}
              </div>
            )}
            {beatData && (
              <div className={styles['beat-info-bar']}>
                <span className={styles['bpm-badge']}>♩ {beatData.bpm} BPM</span>
                <span className={styles['eightcount-badge']}>{beatData.eightCounts.length} eight-counts</span>
                <button
                  className={`${styles['beat-toggle']} ${showBeats ? styles.active : ''}`}
                  onClick={() => setShowBeats(!showBeats)}
                >
                  {showBeats ? '🔢 Beats On' : '🔢 Beats Off'}
                </button>
                <label className={styles['prompt-lead-control']}>
                  Prompt Lead (ms)
                  <input
                    type="number"
                    value={promptLeadMs}
                    min={0}
                    max={600}
                    step={10}
                    onChange={(e) => dispatch({
                      type: 'UPDATE_SETTINGS',
                      payload: {
                        promptLeadMs: Math.max(0, Math.min(600, Number(e.target.value) || 0)),
                      },
                    })}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Mode tabs */}
          <div className={styles['mode-tabs']}>
            <button
              className={`${styles['mode-tab']} ${mode === 'edit' ? styles.active : ''}`}
              onClick={() => setMode('edit')}
            >
              ✏️ Edit
            </button>
            <button
              className={`${styles['mode-tab']} ${mode === 'live' ? styles.active : ''}`}
              onClick={() => setMode('live')}
            >
              ▶️ Live Mode
            </button>
          </div>

          {/* Music upload or info */}
          {!audioUrl ? (
            <div className={styles['music-upload']}>
              <span className={styles['upload-emoji']}>🎵</span>
              <span className={styles['upload-label']}>Upload the original music track</span>
              <label className={styles['music-upload-btn']}>
                Choose File
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          ) : (
            <div className={styles['music-info']}>
              <span>🎵</span>
              <span className={styles['file-name']}>{musicFileName}</span>
              <span className={styles.duration}>{formatTimestamp(duration)}</span>
              <label className={styles['change-music-btn']}>
                Change
                <input
                  type="file"
                  accept="audio/*"
                  onChange={handleMusicUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          )}

          {/* Waveform */}
          {audioUrl && (
            <div className={styles['waveform-container']}>
              <canvas
                ref={canvasRef}
                className={styles['waveform-canvas']}
                width={800}
                height={100}
                onClick={handleCanvasClick}
              />
              <div
                className={styles['waveform-playhead']}
                style={{ left: playheadLeft }}
              />
            </div>
          )}

          {/* Playback controls */}
          {audioUrl && (
            <div className={styles['playback-controls']}>
              <button className={styles['play-btn']} onClick={togglePlay}>
                {isPlaying ? '⏸' : '▶️'}
              </button>
              <span className={styles['time-display']}>
                {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
              </span>
              <div className={styles['speed-btns']}>
                {[0.5, 0.75, 1].map((r) => (
                  <button
                    key={r}
                    className={`${styles['speed-btn']} ${playbackRate === r ? styles.active : ''}`}
                    onClick={() => changeSpeed(r)}
                  >
                    {r}x
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== EDIT MODE ===== */}
      {!isKidLiveView && mode === 'edit' && (
        <>
          {/* Video & Sync section */}
          <div className={styles['sync-section']}>
            <h3>🔗 Practice Video</h3>
            <div className={styles['sync-row']}>
              <label className={styles['sync-video-upload']}>
                {liveVideoUrl ? '🎥 Change video' : '📹 Upload practice video'}
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  style={{ display: 'none' }}
                />
              </label>
              {liveVideoUrl && !syncing && !syncResult && (
                <span className={styles['sync-status']}>✅ Video loaded</span>
              )}
              {syncing && (
                <div className={styles['syncing-overlay']}>
                  <div className={styles.spinner} />
                  Analysing audio…
                </div>
              )}
              {syncResult && !syncResult.error && (
                <span className={styles['sync-status']}>
                  Offset: {syncResult.offsetMs.toFixed(0)}ms &bull;{' '}
                  <span
                    className={`${styles['sync-confidence']} ${
                      syncResult.confidence > 0.6
                        ? styles.high
                        : syncResult.confidence > 0.3
                          ? styles.medium
                          : styles.low
                    }`}
                  >
                    {(syncResult.confidence * 100).toFixed(0)}% confidence
                  </span>
                </span>
              )}
            </div>
            <div className={styles['sync-row']}>
              <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Fine-tune:</span>
              <div className={styles['offset-adjust']}>
                <button className={styles['nudge-btn']} onClick={() => nudgeOffset(-50)}>−</button>
                <span className={styles['offset-value']}>
                  {choreography.videoSyncOffset || 0}ms
                </span>
                <button className={styles['nudge-btn']} onClick={() => nudgeOffset(50)}>+</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== LIVE MODE — fullscreen dance game ===== */}
      {(mode === 'live' || isKidLiveView) && (
        <div className={styles['live-screen']}>
          {/* Background: video (when loaded) or dark gradient */}
          {isLiveVideoPlayback ? (
            <video
              ref={liveVideoRef}
              src={liveVideoUrl}
              className={styles['live-video-bg']}
              muted={liveAudioMode === 'music' && !!audioUrl}
              playsInline
              onTimeUpdate={(e) => {
                const t = e.target.currentTime
                syncLiveAudio(t)
              }}
              onLoadedMetadata={(e) => setLiveDuration(e.target.duration)}
              onPlay={() => setLiveIsPlaying(true)}
              onPause={() => setLiveIsPlaying(false)}
              onEnded={handleLiveVideoEnded}
            />
          ) : (
            <div className={styles['live-no-video']}>
              {!isKidLiveView && (
                <>
                  <span style={{ fontSize: '3rem', marginBottom: 8, display: 'block' }}>🎬</span>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>No video loaded</p>
                  <p style={{ fontSize: '0.78rem', opacity: 0.6 }}>Upload a practice video below, or dance along to music only</p>
                </>
              )}
            </div>
          )}

          {/* Gradient overlays for readability */}
          <div className={styles['live-top-gradient']} />
          <div className={styles['live-bottom-gradient']} />

          {/* Video annotation layer — feedback bubbles + tap overlay */}
          {isLiveVideoPlayback && (
            <VideoAnnotationLayer
              videoRef={liveVideoRef}
              annotations={videoAnnotations}
              currentTime={isLiveVideoPlayback ? liveTime : currentTime}
              isPlaying={liveIsPlaying}
              feedbackMode={feedbackMode}
              onPause={() => {
                const video = liveVideoRef.current
                if (video) video.pause()
                const audio = audioRef.current
                if (liveAudioMode === 'music' && audio) audio.pause()
              }}
              onAddAnnotation={(ann) => {
                const updated = [...videoAnnotations, ann]
                dispatch({
                  type: 'UPDATE_CHOREOGRAPHY_VERSION',
                  payload: {
                    routineId,
                    versionId: selectedVersion?.id,
                    updates: { videoAnnotations: updated },
                  },
                })
              }}
              onDeleteAnnotation={(annId) => {
                const updated = videoAnnotations.filter(a => a.id !== annId)
                dispatch({
                  type: 'UPDATE_CHOREOGRAPHY_VERSION',
                  payload: {
                    routineId,
                    versionId: selectedVersion?.id,
                    updates: { videoAnnotations: updated },
                  },
                })
              }}
            />
          )}

          {isVideoDownloading && (
            <div className={styles['video-download-status']}>
              ⬇️ Caching video locally...
              {typeof videoDownloadProgress === 'number' ? ` ${videoDownloadProgress}%` : ''}
            </div>
          )}

          {!isKidLiveView && (
            <>
              {/* Top bar: exit + upload + clock */}
              <div className={styles['live-top-bar']}>
                <button
                  className={styles['live-exit-btn']}
                  onClick={() => {
                    liveVideoRef.current?.pause()
                    audioRef.current?.pause()
                    setLiveIsPlaying(false)
                    if (isLiveOnly) {
                      navigate('/')
                    } else {
                      setMode('edit')
                    }
                  }}
                >
                  ✕ Exit
                </button>
                <button
                  type="button"
                  className={styles['live-upload-btn']}
                  title={musicFileName || 'No song loaded'}
                  onClick={() => openMediaPicker('audio')}
                >
                  <span className={styles['live-upload-text']}>🎵 {displayMusicName}</span>
                  <span className={styles['live-upload-pencil']} aria-hidden="true">✏️</span>
                </button>
                <button
                  type="button"
                  className={styles['live-upload-btn']}
                  title={videoFileName || 'No video loaded'}
                  onClick={() => openMediaPicker('video')}
                >
                  <span className={styles['live-upload-text']}>🎥 {displayVideoName}</span>
                  <span className={styles['live-upload-pencil']} aria-hidden="true">✏️</span>
                </button>
                <button
                  className={styles['live-sync-btn']}
                  onClick={handleLiveResync}
                  disabled={!audioUrl || !liveVideoUrl || syncing}
                  title={!audioUrl || !liveVideoUrl ? 'Load both song and video first' : 'Click to re-sync and refresh offset/confidence'}
                >
                  {syncLabel}
                </button>
                <span className={styles['live-time-display']}>
                  {formatTimestamp(isLiveVideoPlayback ? liveTime : currentTime)} / {formatTimestamp(liveTotalDuration)}
                </span>
              </div>

              <input
                ref={musicPickerInputRef}
                type="file"
                accept="audio/*"
                onChange={handleMusicUpload}
                style={{ display: 'none' }}
              />
              <input
                ref={videoPickerInputRef}
                type="file"
                accept="video/*"
                onChange={handleVideoUpload}
                style={{ display: 'none' }}
              />

              {mediaPickerOpen && (
                <div
                  className={styles['media-picker-overlay']}
                  onClick={closeMediaPicker}
                  role="presentation"
                >
                  <div
                    className={styles['media-picker-dialog']}
                    role="dialog"
                    aria-modal="true"
                    aria-label={mediaPickerType === 'video' ? 'Choose video source' : 'Choose song source'}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className={styles['media-picker-header']}>
                      <h3>{mediaPickerType === 'video' ? '🎥 Change Video' : '🎵 Change Song'}</h3>
                      <button
                        type="button"
                        className={styles['media-picker-close']}
                        onClick={closeMediaPicker}
                      >
                        ✕
                      </button>
                    </div>

                    <button
                      type="button"
                      className={styles['media-picker-upload']}
                      onClick={handlePickerUploadClick}
                    >
                      {mediaPickerType === 'video' ? '📁 Upload new video' : '📁 Upload new song'}
                    </button>

                    <div className={styles['media-picker-subtitle']}>
                      Or pick existing media
                    </div>

                    {mediaPickerLoading ? (
                      <div className={styles['media-picker-loading']}>Loading media…</div>
                    ) : (
                      <div className={styles['media-picker-list']}>
                        {mediaPickerItems.length === 0 ? (
                          <div className={styles['media-picker-empty']}>
                            No existing {mediaPickerType === 'video' ? 'videos' : 'songs'} found.
                          </div>
                        ) : (
                          mediaPickerItems.map((item) => {
                            const isSelecting = mediaPickerSelectingId === item.id
                            const sizeLabel = formatFileSize(item.size)
                            return (
                              <button
                                type="button"
                                key={item.id}
                                className={styles['media-picker-item']}
                                onClick={() => handlePickExistingMedia(item)}
                                disabled={isSelecting}
                              >
                                <span className={styles['media-picker-item-name']}>
                                  {mediaPickerType === 'video' ? '🎥' : '🎵'} {toDisplayFileName(item.fileName || item.id, 42)}
                                </span>
                                <span className={styles['media-picker-item-meta']}>
                                  {isSelecting ? 'Loading…' : (sizeLabel || 'Existing file')}
                                </span>
                              </button>
                            )
                          })
                        )}
                      </div>
                    )}

                    {mediaPickerError && (
                      <div className={styles['media-picker-error']}>
                        {mediaPickerError}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Next instruction preview */}
          {nextSongInstruction && (isPlaying || liveIsPlaying) && (
            <div className={styles['live-next-preview']}>
              Up next: {nextSongInstruction.emoji && <span>{nextSongInstruction.emoji} </span>}{nextSongInstruction.text}
            </div>
          )}

          {/* Current instruction — big animated card */}
          {(!filesLoaded || isVideoDownloading) ? (
            <div className={styles['live-cue-idle']}>
              <span style={{ fontSize: '2.5rem' }}>⏳</span>
              <p style={{ fontWeight: 600, marginTop: 8 }}>
                {isVideoDownloading
                  ? `Caching video…${typeof videoDownloadProgress === 'number' ? ` ${videoDownloadProgress}%` : ''}`
                  : 'Loading music & video…'}
              </p>
              <p style={{ fontSize: '0.8rem', opacity: 0.6, marginTop: 4 }}>Almost ready!</p>
            </div>
          ) : liveSongInstruction ? (
            <div key={liveSongInstruction.id} className={styles['live-cue-card']}>
              <span className={styles['live-beat-move-label']}>
                {liveSongInstruction.emoji && <span className={styles['live-inst-emoji']}>{liveSongInstruction.emoji} </span>}
                {liveSongInstruction.text}
              </span>
            </div>
          ) : (liveIsPlaying || isPlaying) ? null : (
            <div className={styles['live-cue-idle']}>
              <span style={{ fontSize: '3rem' }}>💃</span>
              <p>Press play and dance!</p>
            </div>
          )}

          {/* Beat counter — shows 8 beat dots */}
          {showBeats && liveBeatInfo && (
            <div className={styles['live-beat-counter']}>
              <div className={styles['live-beat-group']}>8-count {liveBeatInfo.group}</div>
              <div className={styles['live-beat-dots']}>
                {BEAT_SLOTS.map((slot) => {
                  const beatNum = slot
                  const isCurrent = beatNum === liveBeatInfo.count && !liveBeatInfo.isAnd
                  const dotClass = isCurrent ? styles['live-beat-dot-current'] : (beatNum < liveBeatInfo.count ? styles['live-beat-dot-past'] : '')
                  return (
                    <div key={slot} className={styles['live-beat-slot']}>
                      <span className={`${styles['live-beat-dot']} ${dotClass}`}>
                        {slot}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Bottom bar: progress + controls */}
          <div className={styles['live-bottom-bar']}>
            <div className={styles['live-progress-meta']}>
              <span>{formatTimestamp(liveProgressTime)}</span>
              <span>{formatTimestamp(liveTotalDuration)}</span>
            </div>

            {/* Progress track with beat ticks */}
            <div
              id="live-progress-track"
              className={styles['live-progress-track']}
              onClick={handleProgressClick}
              onPointerDown={handleProgressPointerDown}
            >
              {/* Beat tick marks on the timeline */}
              {showBeats && beatData && liveTotalDuration > 0 && beatData.beats.map((bt, i) => {
                const isDownbeat = (i % 8) === 0
                return (
                  <div
                    key={`bt-${i}`}
                    className={`${styles['live-progress-beat-tick']} ${isDownbeat ? styles['live-progress-beat-tick-down'] : ''}`}
                    style={{ left: `${(bt / liveTotalDuration) * 100}%` }}
                  />
                )
              })}
              <div
                className={styles['live-progress-fill']}
                style={{
                  width: liveTotalDuration > 0
                    ? `${((isLiveVideoPlayback ? liveTime : currentTime) / liveTotalDuration) * 100}%`
                    : '0%',
                  transition: isLiveSeeking ? 'none' : undefined,
                }}
              />
              <div
                className={styles['live-progress-thumb']}
                style={{ left: liveProgressLeft }}
              />

              {isLiveSeeking && seekPreviewTime !== null && (
                <div className={styles['live-progress-preview']}>
                  {formatTimestamp(seekPreviewTime)}
                </div>
              )}
              {!isKidLiveView && (
                <>
                  {/* Song instruction dots on progress bar */}
                  {beatData?.beats && liveTotalDuration > 0 && songInstructions.map((inst) => {
                    const beatIdx = Math.floor(inst.startPos)
                    const beatTime = beatData.beats[beatIdx]
                    if (beatTime === undefined) return null
                    const isActive = liveSongInstruction?.id === inst.id
                    return (
                      <div
                        key={inst.id}
                        className={`${styles['live-progress-dot']} ${isActive ? styles['live-progress-dot-active'] : ''}`}
                        style={{ left: `${(beatTime / liveTotalDuration) * 100}%` }}
                        title={`${inst.emoji || ''} ${inst.text || ''}`}
                        onClick={(e) => { e.stopPropagation(); seekLive(beatTime) }}
                      />
                    )
                  })}
                  {/* Annotation dots on progress bar */}
                  {liveTotalDuration > 0 && videoAnnotations.map((ann) => (
                    <div
                      key={ann.id}
                      className={annotationStyles['annotation-progress-dot']}
                      style={{ left: `${(ann.timestamp / liveTotalDuration) * 100}%` }}
                      title={`${ann.emoji || ''} ${ann.text || ''} @ ${formatTimestamp(ann.timestamp)}`}
                      onClick={(e) => { e.stopPropagation(); seekLive(ann.timestamp) }}
                    />
                  ))}
                </>
              )}
            </div>

            {/* Controls row */}
            <div className={styles['live-controls']}>
              <button className={styles['live-restart-btn']} onClick={restartLive} title="Restart">
                ⏮
              </button>
              <button
                className={styles['live-play-btn']}
                onClick={toggleLivePlay}
                disabled={!filesLoaded || isVideoDownloading}
                style={(!filesLoaded || isVideoDownloading) ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
              >
                {(!filesLoaded || isVideoDownloading) ? '⏳' : (isLiveVideoPlayback ? liveIsPlaying : isPlaying) ? '⏸' : '▶️'}
              </button>
              {!isKidLiveView && (
                <>
                  <div className={styles['live-speed-row']}>
                    {[0.5, 0.75, 1].map((r) => (
                      <button
                        key={r}
                        className={`${styles['live-speed-btn']} ${playbackRate === r ? styles.active : ''}`}
                        onClick={() => changeLiveSpeed(r)}
                      >
                        {r}x
                      </button>
                    ))}
                  </div>
                  {/* Audio mode toggle — only show when both video + music are available */}
                  {liveVideoUrl && audioUrl && (
                    <div className={styles['live-audio-toggle']}>
                      <button
                        className={`${styles['live-audio-btn']} ${liveAudioMode === 'video' ? styles.active : ''}`}
                        onClick={() => setLiveAudioMode('video')}
                      >
                        🎬 Video
                      </button>
                      <button
                        className={`${styles['live-audio-btn']} ${liveAudioMode === 'music' ? styles.active : ''}`}
                        onClick={() => setLiveAudioMode('music')}
                      >
                        🎵 Music
                      </button>
                    </div>
                  )}
                  {isLiveVideoPlayback && (
                    <button
                      className={`${annotationStyles['feedback-toggle']} ${feedbackMode ? annotationStyles['feedback-toggle-active'] : ''}`}
                      onClick={() => setFeedbackMode(f => !f)}
                      title={feedbackMode ? 'Exit feedback mode' : 'Tap video to leave feedback'}
                    >
                      {feedbackMode ? '💬 Feedback ON' : '💬 Feedback'}
                    </button>
                  )}
                  <button
                    className={`${styles['live-edit-toggle']} ${liveEditOpen ? styles.active : ''}`}
                    onClick={() => setLiveEditOpen(!liveEditOpen)}
                    title="Edit beat instructions"
                  >
                    ✏️ Edit
                  </button>
                  {/* Version picker in live controls */}
                  {versions.length > 1 && (
                    <select
                      className={styles['live-version-select']}
                      value={selectedVersionId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSelectedVersionId(nextId)
                        if (sessionId) {
                          dispatch({ type: 'SET_REHEARSAL_VERSION', payload: { sessionId, choreographyVersionId: nextId } })
                        }
                      }}
                    >
                      {versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          v{i + 1}{v.label ? ` — ${v.label}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Live edit panel — full-song beat timeline + instructions */}
          {!isKidLiveView && liveEditOpen && (
            <div className={styles['live-edit-panel']}>
              <div className={styles['live-edit-header']}>
                <span>🎵 Choreography</span>
                <div className={styles['live-edit-header-actions']}>
                  {/* Version selector */}
                  {versions.length > 0 && (
                    <select
                      className={styles['live-edit-version-select']}
                      value={selectedVersionId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSelectedVersionId(nextId)
                        if (sessionId) {
                          dispatch({ type: 'SET_REHEARSAL_VERSION', payload: { sessionId, choreographyVersionId: nextId } })
                        }
                      }}
                    >
                      {versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          v{i + 1}{v.label ? ` — ${v.label}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                  {isAdmin && (
                    <button
                      className={styles['live-edit-new-version']}
                      onClick={() => handleCreateVersion('clone')}
                      title="Save current choreography as a new version"
                    >
                      + Save as New Version
                    </button>
                  )}
                  <label className={styles['offbeat-toggle']}>
                    <input type="checkbox" checked={showOffBeats} onChange={(e) => setShowOffBeats(e.target.checked)} />
                    Off-beats
                  </label>
                  <button className={styles['live-edit-save']} onClick={() => { setLiveEditOpen(false); rangeStartRef.current = null; dragEndRef.current = null; isDraggingRef.current = false; setRangeStartPos(null); setDragEndPos(null); setIsDragging(false) }}>Done</button>
                  <button className={styles['live-edit-close']} onClick={() => { setLiveEditOpen(false); rangeStartRef.current = null; dragEndRef.current = null; isDraggingRef.current = false; setRangeStartPos(null); setDragEndPos(null); setIsDragging(false) }}>✕</button>
                </div>
              </div>

              {/* Range start hint */}
              {rangeStartPos !== null && !isDragging && (
                <div className={styles['range-start-hint']}>
                  Tap another beat to complete the range
                  <button onClick={() => { rangeStartRef.current = null; dragEndRef.current = null; isDraggingRef.current = false; setRangeStartPos(null); setDragEndPos(null); setIsDragging(false) }}>Cancel</button>
                </div>
              )}

              {!beatData?.beats?.length ? (
                <div className={styles['song-timeline-empty']}>
                  <p>No beats detected yet. Load music and beats will be analysed automatically.</p>
                </div>
              ) : (
                <div
                  className={styles['song-timeline-container']}
                  ref={timelineContainerRef}
                  onPointerDown={handleTimelinePointerDown}
                  onPointerMove={handleTimelinePointerMove}
                  onPointerUp={handleTimelinePointerUp}
                >
                  <div className={styles['song-timeline-inner']} style={{ position: 'relative', minHeight: timelineRows.length * BEAT_ROW_HEIGHT }}>
                    {/* Beat rows */}
                    {timelineRows.map((row, idx) => {
                      const isCurrent = liveBeatInfo?.beatIndex === row.beatIndex &&
                        (row.isOffBeat ? liveBeatInfo.isAnd : !liveBeatInfo.isAnd)
                      const isRangeStart = rangeStartPos === row.pos
                      const inDragRange = rangeStartPos !== null && dragEndPos !== null &&
                        row.pos >= Math.min(rangeStartPos, dragEndPos) && row.pos <= Math.max(rangeStartPos, dragEndPos)
                      const hasCoverage = songInstructions.some(inst =>
                        row.pos >= inst.startPos && row.pos <= inst.endPos && String(inst.text || '').trim()
                      )

                      return (
                        <div
                          key={row.pos}
                          className={[
                            styles['song-beat-row'],
                            row.isOffBeat ? styles['song-beat-offbeat'] : '',
                            row.isDownbeat ? styles['song-beat-downbeat'] : '',
                            isCurrent ? styles['song-beat-current'] : '',
                            isRangeStart ? styles['song-beat-range-start'] : '',
                            inDragRange ? styles['song-beat-in-drag'] : '',
                            hasCoverage ? styles['song-beat-covered'] : '',
                          ].filter(Boolean).join(' ')}
                          style={{ height: BEAT_ROW_HEIGHT }}
                          onClick={() => handleBeatClick(row.pos)}
                        >
                          <span className={styles['song-beat-dot']} />
                          <span className={styles['song-beat-num']}>
                            {row.isOffBeat ? '&' : row.count}
                          </span>
                          <span className={styles['song-beat-time']}>
                            {formatTimestamp(row.time)}
                          </span>
                          {row.isDownbeat && (
                            <span className={styles['song-beat-group-label']}>8ct {row.group}</span>
                          )}
                        </div>
                      )
                    })}

                    {/* Instruction range blocks — absolutely positioned on the right side */}
                    {songInstructions.map((inst) => {
                      // Use resize preview positions if this instruction is being resized
                      const displayStart = (resizePreview && resizePreview.instId === inst.id) ? resizePreview.startPos : inst.startPos
                      const displayEnd = (resizePreview && resizePreview.instId === inst.id) ? resizePreview.endPos : inst.endPos

                      const startIdx = timelineRows.findIndex(r => r.pos >= displayStart)
                      let endIdx = timelineRows.findIndex(r => r.pos > displayEnd)
                      if (endIdx === -1) endIdx = timelineRows.length
                      if (startIdx === -1) return null

                      const top = startIdx * BEAT_ROW_HEIGHT
                      const height = Math.max((endIdx - startIdx) * BEAT_ROW_HEIGHT, BEAT_ROW_HEIGHT)

                      return (
                        <div
                          key={inst.id}
                          className={`${styles['song-inst-block']} ${editingInstId === inst.id ? styles['song-inst-editing'] : ''} ${resizingInstId === inst.id ? styles['song-inst-resizing'] : ''}`}
                          style={{ position: 'absolute', top, height }}
                          onClick={(e) => { e.stopPropagation(); setEditingInstId(inst.id) }}
                        >
                          {/* Top resize handle */}
                          <div
                            className={styles['song-inst-resize-handle-top']}
                            onPointerDown={(e) => handleResizePointerDown(e, inst.id, 'top')}
                          />
                          {editingInstId === inst.id ? (
                            <input
                              autoFocus
                              className={styles['song-inst-input']}
                              value={inst.text || ''}
                              onChange={(e) => {
                                const text = e.target.value
                                const emoji = suggestEmoji(text)
                                updateSongInstruction(inst.id, { text, emoji: emoji || undefined })
                              }}
                              onBlur={() => setEditingInstId(null)}
                              onKeyDown={(e) => { if (e.key === 'Enter') setEditingInstId(null); if (e.key === 'Escape') { setEditingInstId(null) } }}
                              placeholder="Type instruction…"
                            />
                          ) : (
                            <span className={styles['song-inst-text']}>
                              {(inst.emoji || suggestEmoji(inst.text)) && <span className={styles['song-inst-emoji']}>{inst.emoji || suggestEmoji(inst.text)} </span>}
                              {inst.text || 'Tap to edit…'}
                            </span>
                          )}
                          <button
                            className={styles['song-inst-delete']}
                            onClick={(e) => { e.stopPropagation(); deleteSongInstruction(inst.id) }}
                            title="Delete instruction"
                          >✕</button>
                          {/* Bottom resize handle */}
                          <div
                            className={styles['song-inst-resize-handle-bottom']}
                            onPointerDown={(e) => handleResizePointerDown(e, inst.id, 'bottom')}
                          />
                        </div>
                      )
                    })}

                    {/* Drag selection preview */}
                    {rangeStartPos !== null && dragEndPos !== null && isDragging && (() => {
                      const minPos = Math.min(rangeStartPos, dragEndPos)
                      const maxPos = Math.max(rangeStartPos, dragEndPos)
                      const startIdx = timelineRows.findIndex(r => r.pos >= minPos)
                      let endIdx = timelineRows.findIndex(r => r.pos > maxPos)
                      if (endIdx === -1) endIdx = timelineRows.length
                      if (startIdx === -1) return null
                      const top = startIdx * BEAT_ROW_HEIGHT
                      const height = Math.max((endIdx - startIdx) * BEAT_ROW_HEIGHT, BEAT_ROW_HEIGHT)
                      return <div className={styles['song-drag-preview']} style={{ position: 'absolute', top, height }} />
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
