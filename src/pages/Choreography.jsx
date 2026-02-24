import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { useNavigate, useSearchParams, useParams } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import { decodeAudioFile, extractWaveform, crossCorrelateSync, formatTimestamp } from '../utils/audioSync'
import { detectBeats, getCurrentBeatInfo } from '../utils/beatDetection'
import { saveFile, saveLocalFile, loadFile, loadLocalFile } from '../utils/fileStorage'
import { listMediaFromBackend } from '../utils/backendApi'
import { notify } from '../utils/notify'
import styles from './Choreography.module.css'
import VideoAnnotationLayer from '../components/VideoAnnotationLayer'
import annotationStyles from '../components/VideoAnnotationLayer.module.css'
import MediaPickerDialog from '../components/MediaPickerDialog'

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

function getFileNameBase(name) {
  if (!name) return 'video'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

function getPersistableMediaUrl(value) {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('blob:')) return ''
  return trimmed
}

function truncatePreviewText(value, maxLength = 120) {
  const text = String(value || '').trim()
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`
}

const LIVE_PROMPT_MAX_CHARS = 24
const LIVE_EXPANDED_MAX_CHARS = 200

function clampInstructionPrompt(value) {
  return String(value || '').slice(0, LIVE_PROMPT_MAX_CHARS)
}

function getInstructionPromptText(inst) {
  return clampInstructionPrompt(inst?.promptText ?? inst?.text ?? '')
}

function getInstructionExpandedText(inst) {
  return String(inst?.expandedText || '').slice(0, LIVE_EXPANDED_MAX_CHARS)
}

function normalizeSongInstruction(inst) {
  const promptText = getInstructionPromptText(inst)
  const expandedText = getInstructionExpandedText(inst)
  return {
    ...inst,
    promptText,
    text: promptText,
    expandedText,
  }
}

const MAX_VIDEO_UPLOAD_BYTES = 50 * 1024 * 1024

async function compressVideoToMax720p(inputFile, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null
  if (!(inputFile instanceof File || inputFile instanceof Blob)) {
    throw new Error('Invalid video file.')
  }
  if (onProgress) onProgress({ stage: 'preparing', progress: 0 })

  const {
    Input, Output, Conversion, ALL_FORMATS,
    BlobSource, Mp4OutputFormat, BufferTarget, QUALITY_MEDIUM,
  } = await import('mediabunny')

  const startTime = Date.now()
  console.log('[Mediabunny] Starting 720p compression for', inputFile.name || 'blob', `(${(inputFile.size / 1024 / 1024).toFixed(1)} MB)`)

  const input = new Input({
    source: new BlobSource(inputFile),
    formats: ALL_FORMATS,
  })
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  try {
    if (onProgress) onProgress({ stage: 'compressing', progress: 0, elapsed: 0 })

    const conversion = await Conversion.init({
      input,
      output,
      video: (videoTrack) => {
        const opts = { bitrate: QUALITY_MEDIUM }
        // Only downscale if the video is taller than 720p
        if (videoTrack.displayHeight > 720) {
          opts.height = 720
        }
        // Keep only the first video track
        if (videoTrack.number > 1) return { discard: true }
        return opts
      },
      audio: (audioTrack) => {
        if (audioTrack.number > 1) return { discard: true }
        return {
          numberOfChannels: 2,
          sampleRate: 48000,
          bitrate: QUALITY_MEDIUM,
        }
      },
    })

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks
        .map(t => `${t.track.type}: ${t.reason}`)
        .join(', ')
      throw new Error(`Video format not supported for conversion: ${reasons}`)
    }

    if (onProgress) {
      conversion.onProgress = (progress) => {
        const pct = Math.max(0, Math.min(1, Number(progress) || 0))
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        onProgress({ stage: 'compressing', progress: pct, elapsed })
      }
    }

    await conversion.execute()
    console.log('[Mediabunny] Conversion complete in', Math.round((Date.now() - startTime) / 1000), 's')

    if (onProgress) onProgress({ stage: 'finalizing', progress: 1 })

    const buffer = output.target.buffer
    if (!buffer || !buffer.byteLength) {
      throw new Error('Video compression produced an empty file.')
    }

    const compressedBlob = new Blob([buffer], { type: 'video/mp4' })
    console.log('[Mediabunny] Output size:', (compressedBlob.size / 1024 / 1024).toFixed(1), 'MB')

    return new File(
      [compressedBlob],
      `${getFileNameBase(inputFile.name || 'video')}-720p.mp4`,
      { type: 'video/mp4', lastModified: Date.now() }
    )
  } catch (error) {
    throw new Error(`Video compression failed: ${error?.message || 'Unknown error'}`)
  } finally {
    input.dispose()
  }
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
  const {
    routines,
    sessions,
    ownKidProfiles,
    settings,
    isAdmin,
    isKidMode,
    activeKidProfile,
    isLoading,
    setRehearsalVersion,
    editChoreographyVersion,
    attachRehearsalVideo,
    addChoreographyVersion,
    editSession,
    fetchSessionFeedback,
    saveSessionFeedback,
    fetchSessionPracticeReflection,
    fetchRoutineLivingGoals,
    saveSessionPracticeReflection,
    saveSessionGoalCheckins,
  } = useApp()

  // Find the routine from the new data model
  const routine = routines?.find(r => r.id === routineId)
  const versions = useMemo(() => routine?.choreographyVersions || [], [routine])
  const [selectedVersionId, setSelectedVersionId] = useState(() => versions[versions.length - 1]?.id || null)
  const selectedVersion = versions.find(v => v.id === selectedVersionId) || versions[versions.length - 1] || {}
  // Alias so all existing code that reads `choreography.*` still works
  const choreography = selectedVersion

  const promptLeadMs = Math.max(0, Math.min(600, Number(settings?.promptLeadMs ?? 0)))
  const requestedView = searchParams.get('view') === 'kid' ? 'kid' : 'adult'
  const isKidLiveView = requestedView === 'kid'
  const isLiveOnly = searchParams.get('live') === 'true'
  const openMediaType = searchParams.get('openMedia')
  const sessionId = searchParams.get('sessionId')
  const activeSession = sessionId ? (sessions || []).find((session) => session.id === sessionId) : null
  const sessionSyncBackupKey = sessionId ? `live-sync:${sessionId}` : null
  const readSessionSyncBackup = useCallback(() => {
    if (!sessionSyncBackupKey) return null
    try {
      const raw = localStorage.getItem(sessionSyncBackupKey)
      if (!raw) return null
      const parsed = JSON.parse(raw)
      return {
        offsetMs: Number.isFinite(parsed?.offsetMs) ? parsed.offsetMs : 0,
        confidence: Number.isFinite(parsed?.confidence) ? parsed.confidence : null,
      }
    } catch {
      return null
    }
  }, [sessionSyncBackupKey])
  const writeSessionSyncBackup = useCallback((offsetMs, confidence) => {
    if (!sessionSyncBackupKey) return
    try {
      localStorage.setItem(sessionSyncBackupKey, JSON.stringify({
        offsetMs: Number.isFinite(offsetMs) ? offsetMs : 0,
        confidence: Number.isFinite(confidence) ? confidence : null,
      }))
    } catch {
      // Ignore local backup write errors
    }
  }, [sessionSyncBackupKey])
  const clearSessionSyncBackup = useCallback(() => {
    if (!sessionSyncBackupKey) return
    try {
      localStorage.removeItem(sessionSyncBackupKey)
    } catch {
      // Ignore local backup remove errors
    }
  }, [sessionSyncBackupKey])
  const localSessionSyncBackup = readSessionSyncBackup()
  const routineMusicStorageKey = routineId ? `choreo-music-${routineId}` : 'choreo-music'
  const routineVideoStorageKey = routineId ? `choreo-video-${routineId}` : 'choreo-video'
  const liveVideoStorageKey = sessionId
    ? (activeSession?.rehearsalVideoKey || `rehearsal-video-${sessionId}`)
    : routineVideoStorageKey

  const routineFeedbackKids = useMemo(() => {
    const routineKidIds = Array.isArray(routine?.kidProfileIds) ? routine.kidProfileIds : []
    if (!routineKidIds.length) return []
    const ownKids = Array.isArray(ownKidProfiles) ? ownKidProfiles : []
    return routineKidIds
      .map((kidId) => ownKids.find((kid) => kid.id === kidId))
      .filter(Boolean)
  }, [routine?.kidProfileIds, ownKidProfiles])

  const [selectedFeedbackKidId, setSelectedFeedbackKidId] = useState(null)

  useEffect(() => {
    if (!sessionId) {
      setSelectedFeedbackKidId(null)
      return
    }

    if (isKidMode && activeKidProfile?.id) {
      setSelectedFeedbackKidId(activeKidProfile.id)
      return
    }

    const availableIds = routineFeedbackKids.map((kid) => kid.id)
    if (!availableIds.length) {
      setSelectedFeedbackKidId(null)
      return
    }

    if (!selectedFeedbackKidId || !availableIds.includes(selectedFeedbackKidId)) {
      setSelectedFeedbackKidId(availableIds[0])
    }
  }, [sessionId, isKidMode, activeKidProfile?.id, routineFeedbackKids, selectedFeedbackKidId])

  const feedbackKidProfileId = useMemo(() => {
    if (!sessionId) return null
    if (isKidMode && activeKidProfile?.id) return activeKidProfile.id
    return selectedFeedbackKidId || routineFeedbackKids[0]?.id || null
  }, [sessionId, isKidMode, activeKidProfile?.id, selectedFeedbackKidId, routineFeedbackKids])

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
    setRehearsalVersion(sessionId, selectedVersionId)
  }, [sessionId, selectedVersionId, activeSession?.choreographyVersionId])

  // Guard: if routine not found, redirect home
  useEffect(() => {
    if (!routine && routines?.length >= 0) {
      // Routine was deleted or ID is invalid
      if (routineId) navigate('/', { replace: true })
    }
  }, [routine, routineId, navigate, routines])

  // Audio state
  const audioRef = useRef(null)
  const [audioUrl, setAudioUrl] = useState(getPersistableMediaUrl(choreography.musicUrl))
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
  const [videoProcessing, setVideoProcessing] = useState(false)
  const [videoProcessingMessage, setVideoProcessingMessage] = useState('')
  const [videoProcessStage, setVideoProcessStage] = useState('idle')
  const [videoCompressionProgress, setVideoCompressionProgress] = useState(null)
  const [videoError, setVideoError] = useState('')
  const liveScreenRef = useRef(null)
  const liveVideoRef = useRef(null)
  const currentFeedbackVideoKey = useMemo(() => {
    if (sessionId) {
      return activeSession?.rehearsalVideoKey || liveVideoStorageKey || null
    }
    if (routineId) {
      return `${routineId}:${selectedVersion?.id || 'latest'}:${videoFileName || ''}`
    }
    return videoFileName || null
  }, [sessionId, activeSession?.rehearsalVideoKey, liveVideoStorageKey, routineId, selectedVersion?.id, videoFileName])
  const [liveIsPlaying, setLiveIsPlaying] = useState(false)
  const [liveTime, setLiveTime] = useState(0)
  const [liveDuration, setLiveDuration] = useState(0)
  const storedSyncOffsetMs = sessionId
    ? (Number.isFinite(activeSession?.liveSyncOffsetMs)
      ? activeSession.liveSyncOffsetMs
      : (localSessionSyncBackup?.offsetMs || 0))
    : (choreography.videoSyncOffset || 0)
  const storedSyncConfidence = sessionId
    ? (Number.isFinite(activeSession?.liveSyncConfidence)
      ? activeSession.liveSyncConfidence
      : localSessionSyncBackup?.confidence)
    : choreography.videoSyncConfidence
  const effectiveSyncOffsetMs = Number.isFinite(syncResult?.offsetMs)
    ? syncResult.offsetMs
    : storedSyncOffsetMs
  const syncOffset = effectiveSyncOffsetMs / 1000 // ms → s
  const [filesLoaded, setFilesLoaded] = useState(false)
  const [liveAudioMode, setLiveAudioMode] = useState('music') // 'music' | 'video'
  const [isLiveSeeking, setIsLiveSeeking] = useState(false)
  const [seekPreviewTime, setSeekPreviewTime] = useState(null)
  const [videoDownloadProgress, setVideoDownloadProgress] = useState(null)
  const [, setIsVideoDownloading] = useState(false)
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false)
  const [mediaPickerType, setMediaPickerType] = useState('audio')
  const [mediaPickerItems, setMediaPickerItems] = useState([])
  const [mediaPickerLoading, setMediaPickerLoading] = useState(false)
  const [mediaPickerError, setMediaPickerError] = useState('')
  const [mediaPickerSelectingId, setMediaPickerSelectingId] = useState('')
  const musicPickerInputRef = useRef(null)
  const videoPickerInputRef = useRef(null)
  const hasAutoOpenedVideoPickerRef = useRef(false)
  const isLiveVideoPlayback = !!liveVideoUrl
  const [liveUiVisible, setLiveUiVisible] = useState(true)
  const [isLiveFullscreen, setIsLiveFullscreen] = useState(false)
  const liveUiHideTimerRef = useRef(null)
  const [showPracticeSummary, setShowPracticeSummary] = useState(false)
  const [reflectionNote, setReflectionNote] = useState('')
  const [livingGoals, setLivingGoals] = useState([])
  const [goalReactions, setGoalReactions] = useState({})
  const [newGoalText, setNewGoalText] = useState('')
  const [summarySaving, setSummarySaving] = useState(false)
  const [summaryError, setSummaryError] = useState('')
  const [summaryClosing, setSummaryClosing] = useState(false)
  const [sessionFeedback, setSessionFeedback] = useState({
    dancerReflection: { feeling: '', note: '', goals: [] },
    videoAnnotations: [],
    emojiReactions: [],
  })
  const [showReplayCurtainOpening, setShowReplayCurtainOpening] = useState(false)
  const replayCurtainTimerRef = useRef(null)

  const stageStars = useMemo(() => {
    const positions = [
      { left: 8, top: 12 }, { left: 22, top: 8 }, { left: 38, top: 18 },
      { left: 52, top: 6 }, { left: 68, top: 14 }, { left: 82, top: 10 },
      { left: 15, top: 35 }, { left: 45, top: 28 }, { left: 72, top: 32 },
      { left: 90, top: 22 }, { left: 30, top: 45 }, { left: 60, top: 42 },
      { left: 85, top: 38 }, { left: 12, top: 55 }, { left: 55, top: 52 },
    ]
    return positions.map((pos, i) => ({
      ...pos,
      delay: i * 0.25,
      size: 8 + (i % 4) * 4,
      char: ['\u2726', '\u2B50', '\u2728', '\u22C6'][i % 4],
    }))
  }, [])

  const stageRecap = useMemo(() => {
    const feedbackAnnotations = sessionId
      ? (sessionFeedback.videoAnnotations || activeSession?.videoAnnotations || [])
      : (choreography.videoAnnotations || [])

    const emojiCountMap = new Map()
    for (const ann of feedbackAnnotations) {
      const emoji = String(ann?.emoji || '').trim()
      if (!emoji) continue
      emojiCountMap.set(emoji, (emojiCountMap.get(emoji) || 0) + 1)
    }

    return {
      emojiPills: Array.from(emojiCountMap.entries()).map(([emoji, count]) => ({ emoji, count })),
      feedbackPreview: truncatePreviewText(reflectionNote, 140),
    }
  }, [sessionId, sessionFeedback.videoAnnotations, activeSession?.videoAnnotations, choreography.videoAnnotations, reflectionNote])

  useEffect(() => {
    let cancelled = false

    const reset = () => {
      if (cancelled) return
      setSessionFeedback({
        dancerReflection: { feeling: '', note: '', goals: [] },
        videoAnnotations: [],
        emojiReactions: [],
      })
    }

    if (!sessionId || !feedbackKidProfileId) {
      reset()
      return () => { cancelled = true }
    }

    const load = async () => {
      try {
        const feedback = await fetchSessionFeedback(sessionId, feedbackKidProfileId)
        if (cancelled || !feedback) return
        setSessionFeedback(feedback)
      } catch (error) {
        console.warn('Failed to load session feedback:', error)
      }
    }

    load()
    return () => { cancelled = true }
  }, [sessionId, feedbackKidProfileId, fetchSessionFeedback])

  useEffect(() => {
    let cancelled = false

    const resetReflectionUi = () => {
      if (cancelled) return
      setShowPracticeSummary(false)
      setReflectionNote('')
      setLivingGoals([])
      setGoalReactions({})
      setNewGoalText('')
      setSummaryError('')
    }

    if (!sessionId || !routineId) {
      resetReflectionUi()
      return () => { cancelled = true }
    }

    const loadReflectionContext = async () => {
      try {
        const [currentReflection, activeGoals] = await Promise.all([
          fetchSessionPracticeReflection(sessionId, feedbackKidProfileId),
          fetchRoutineLivingGoals(routineId, feedbackKidProfileId),
        ])
        if (cancelled) return

        setReflectionNote(currentReflection?.reflectionNote || sessionFeedback?.dancerReflection?.note || activeSession?.dancerReflection?.note || '')
        setLivingGoals(activeGoals || [])

        // Restore any reactions already saved for this session
        const existingReactions = {}
        ;(currentReflection?.checkins || []).forEach((row) => {
          existingReactions[row.priorGoalId] = row.rating
        })
        setGoalReactions(existingReactions)
      } catch (error) {
        console.warn('Failed to load practice reflection context:', error)
      }
    }

    loadReflectionContext()
    return () => { cancelled = true }
  }, [
    sessionId,
    routineId,
    feedbackKidProfileId,
    sessionFeedback?.dancerReflection?.note,
    activeSession?.dancerReflection?.note,
    fetchSessionPracticeReflection,
    fetchRoutineLivingGoals,
  ])

  useEffect(() => () => {
    if (replayCurtainTimerRef.current) {
      clearTimeout(replayCurtainTimerRef.current)
      replayCurtainTimerRef.current = null
    }
  }, [])

  const goBackFromLive = useCallback(() => {
    liveVideoRef.current?.pause()
    audioRef.current?.pause()
    setLiveIsPlaying(false)
    setIsPlaying(false)
    if (routineId) {
      navigate(`/timeline/routine/${routineId}`)
    } else if (activeSession?.disciplineId) {
      navigate(`/timeline/discipline/${activeSession.disciplineId}`)
    } else if (isLiveOnly) {
      navigate('/')
    } else {
      setMode('edit')
    }
  }, [activeSession?.disciplineId, isLiveOnly, navigate, routineId])

  const closeStageThen = useCallback((callback) => {
    setSummaryClosing(true)
    setTimeout(() => {
      setShowPracticeSummary(false)
      setSummaryClosing(false)
      if (callback) callback()
    }, 800)
  }, [])

  // Video annotations — per-session when practicing, per-choreography when editing
  const videoAnnotations = sessionId
    ? (sessionFeedback.videoAnnotations || activeSession?.videoAnnotations || [])
    : (choreography.videoAnnotations || [])

  const clearLiveUiHideTimer = useCallback(() => {
    if (liveUiHideTimerRef.current) {
      clearTimeout(liveUiHideTimerRef.current)
      liveUiHideTimerRef.current = null
    }
  }, [])

  const scheduleLiveUiHide = useCallback(() => {
    clearLiveUiHideTimer()
    const isLiveModeActive = mode === 'live' || isKidLiveView
    if (!isLiveModeActive || liveEditOpen || mediaPickerOpen) return

    const currentlyPlaying = isLiveVideoPlayback ? liveIsPlaying : isPlaying
    if (!currentlyPlaying) return

    liveUiHideTimerRef.current = setTimeout(() => {
      setLiveUiVisible(false)
    }, 2200)
  }, [clearLiveUiHideTimer, mode, isKidLiveView, liveEditOpen, mediaPickerOpen, isLiveVideoPlayback, liveIsPlaying, isPlaying])

  const revealLiveUi = useCallback(() => {
    setLiveUiVisible(true)
    scheduleLiveUiHide()
  }, [scheduleLiveUiHide])

  useEffect(() => {
    scheduleLiveUiHide()
    return clearLiveUiHideTimer
  }, [scheduleLiveUiHide, clearLiveUiHideTimer])

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsLiveFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange()
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleLiveFullscreen = useCallback(async () => {
    try {
      const fullscreenElement = document.fullscreenElement
      if (fullscreenElement) {
        await document.exitFullscreen()
        return
      }
      const container = liveScreenRef.current
      if (container?.requestFullscreen) {
        await container.requestFullscreen()
      }
    } catch (err) {
      console.warn('Fullscreen toggle failed:', err)
    }
  }, [])

  const handleCastToScreen = useCallback(async () => {
    const video = liveVideoRef.current
    if (!video) {
      notify('Load a video first to cast to an external screen.')
      return
    }

    const isLocalBlobSource = typeof liveVideoUrl === 'string' && liveVideoUrl.startsWith('blob:')
    const canRemotePrompt = !!(video.remote && typeof video.remote.prompt === 'function')
    const canAirPlayPicker = typeof video.webkitShowPlaybackTargetPicker === 'function'

    if (!canRemotePrompt && !canAirPlayPicker) {
      notify('Casting is not supported in this browser. Try Chrome/Edge for Chromecast or Safari for AirPlay.')
      return
    }

    if (isLocalBlobSource && !canAirPlayPicker) {
      notify('This video is a local upload. Direct device cast may be unavailable. Use browser menu > Cast and choose This tab/screen, or use a cloud-hosted video URL.')
      return
    }

    if (canRemotePrompt) {
      try {
        await video.remote.prompt()
        return
      } catch (err) {
        console.warn('Cast prompt failed:', err)

        if (err?.name === 'AbortError') {
          notify('No cast device was selected.')
          return
        }

        if (err?.name === 'NotFoundError') {
          const localSource = typeof liveVideoUrl === 'string' && liveVideoUrl.startsWith('blob:')
          if (localSource) {
            notify('No cast devices were found for this local video source. Try casting the browser tab/screen, or use a cloud-hosted video URL.')
          } else {
            notify('No cast devices were found. Make sure your device and TV are on the same network.')
          }
          return
        }

        if (err?.name === 'NotAllowedError') {
          if (canAirPlayPicker) {
            try {
              video.webkitShowPlaybackTargetPicker()
              return
            } catch (pickerErr) {
              console.warn('AirPlay picker failed after remote prompt block:', pickerErr)
            }
          }
          if (isLocalBlobSource) {
            notify('Cast picker was dismissed for this local video source. Use browser menu > Cast and choose This tab/screen, or use a cloud-hosted video URL.')
          } else {
            notify('Cast picker was dismissed or blocked by the browser. Try browser menu > Cast (or AirPlay), then choose your device.')
          }
          return
        }

        if (!canAirPlayPicker) {
          notify('Could not start casting on this device.')
          return
        }
      }
    }

    if (canAirPlayPicker) {
      try {
        video.webkitShowPlaybackTargetPicker()
        return
      } catch (err) {
        console.warn('AirPlay picker failed:', err)
        notify('Could not open the casting picker on this device.')
      }
    }
  }, [liveVideoUrl])

  useEffect(() => {
    if (!isKidLiveView || !liveVideoUrl) return
    setLiveAudioMode(audioUrl ? 'music' : 'video')
  }, [isKidLiveView, liveVideoUrl, audioUrl])

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
      writeSessionSyncBackup(result.offsetMs, result.confidence)
      if (sessionId && activeSession?.id) {
        try {
          await editSession(activeSession.id, {
            liveSyncOffsetMs: result.offsetMs,
            liveSyncConfidence: result.confidence,
          })
        } catch (saveErr) {
          console.warn('Save session sync failed (using local sync backup):', saveErr)
        }
      } else if (routineId && selectedVersion?.id) {
        editChoreographyVersion(routineId, selectedVersion.id, {
          videoSyncOffset: result.offsetMs,
          videoSyncConfidence: result.confidence,
        })
      }
    } catch (err) {
      console.warn('Sync failed:', err)
      setSyncResult({ offsetMs: 0, confidence: 0, error: true })
    } finally {
      setSyncing(false)
    }
  }, [sessionId, activeSession?.id, editSession, routineId, selectedVersion?.id, writeSessionSyncBackup])

  const resetVideoSyncState = useCallback(() => {
    setSyncResult(null)
    clearSessionSyncBackup()
    if (sessionId && activeSession?.id) {
      editSession(activeSession.id, {
        liveSyncOffsetMs: 0,
        liveSyncConfidence: null,
      }).catch((err) => console.warn('Reset session sync failed:', err))
    } else if (routineId && selectedVersion?.id) {
      editChoreographyVersion(routineId, selectedVersion.id, {
        videoSyncOffset: 0,
        videoSyncConfidence: null,
      })
    }
  }, [sessionId, activeSession?.id, editSession, routineId, selectedVersion?.id, clearSessionSyncBackup])

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
    if (openMediaType !== 'video') return
    if (!sessionId) return
    if (isKidMode || isKidLiveView) return
    if (mode !== 'live' && !isLiveOnly) return
    if (hasAutoOpenedVideoPickerRef.current) return
    hasAutoOpenedVideoPickerRef.current = true
    openMediaPicker('video')
  }, [openMediaType, sessionId, isKidMode, isKidLiveView, mode, isLiveOnly, openMediaPicker])

  // Beat detection
  const [beatData, setBeatData] = useState(null) // { bpm, firstBeat, beats[], eightCounts[] }
  const [showBeats, setShowBeats] = useState(true)
  const liveAnimRef = useRef(null)
  const lastLiveClockTimeRef = useRef(-1)

  // ========== LOAD PERSISTED FILES ON MOUNT ==========
  useEffect(() => {
    // Wait for hydration so _danceOwnerId is set correctly (guardians)
    if (isLoading) return
    let cancelled = false
    const restore = async () => {
      try {
        const fallbackMusicUrl = getPersistableMediaUrl(choreography.musicUrl)
        if (!cancelled) {
          setAudioUrl(fallbackMusicUrl)
          setMusicFileName(choreography.musicFileName || '')
          setLiveVideoUrl('')
          setVideoFileName('')
        }

        const applyMusicBlob = async (blob, fileName = choreography.musicFileName || 'music.mp3', durationFromMeta = 0) => {
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
        const musicKeys = Array.from(new Set([routineMusicStorageKey, 'choreo-music']))

        for (const musicKey of musicKeys) {
          if (resolvedMusic || cancelled) break

          const localMusic = await loadLocalFile(musicKey)
          if (localMusic?.blob) {
            await applyMusicBlob(
              localMusic.blob,
              localMusic.meta?.fileName || choreography.musicFileName || 'music.mp3',
              localMusic.meta?.duration || 0
            )
            resolvedMusic = true
            break
          }

          const remoteMusic = await loadFile(musicKey)
          if (!remoteMusic?.blob) continue

          try {
            await saveLocalFile(musicKey, remoteMusic.blob, remoteMusic.meta || {})
          } catch (cacheErr) {
            console.warn('Could not cache fetched music locally:', cacheErr)
          }

          if (!cancelled) {
            await applyMusicBlob(
              remoteMusic.blob,
              remoteMusic.meta?.fileName || choreography.musicFileName || 'music.mp3',
              remoteMusic.meta?.duration || 0
            )
            resolvedMusic = true
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
  }, [
    isLoading,
    routineId,
    routineMusicStorageKey,
    sessionId,
    selectedVersion?.id,
    choreography.musicFileName,
    liveVideoStorageKey,
    activeSession?.rehearsalVideoName,
  ])

  const applyMusicFile = useCallback(async (file) => {
    if (!file) return

    try {
      const url = URL.createObjectURL(file)
      const audioBuffer = await decodeAudioFile(file)
      await saveFile(routineMusicStorageKey, file, {
        fileName: file.name,
        type: file.type,
        size: file.size,
        duration: audioBuffer.duration,
        routineId,
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

      editChoreographyVersion(routineId, selectedVersion?.id, { musicUrl: '', musicFileName: file.name, duration: audioBuffer.duration })

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
  }, [liveVideoUrl, routineId, routineMusicStorageKey, runSyncAnalysis, selectedVersion?.id])

  // ========== MUSIC FILE UPLOAD ==========
  const handleMusicUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await applyMusicFile(file)
    } catch (err) {
      notify(err?.message || 'Could not save song. Check connection and try again.')
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
    const isLiveModeActive = mode === 'live' || isKidLiveView
    if (isLiveModeActive) {
      setShowPracticeSummary(true)
      setLiveUiVisible(true)
      setLiveEditOpen(false)
    }
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

    setShowPracticeSummary(true)
    setLiveUiVisible(true)
    setLiveEditOpen(false)
  }

  const handleAddLivingGoal = () => {
    const text = (newGoalText || '').trim()
    if (!text) return
    setLivingGoals((prev) => [
      ...prev,
      { id: `new-${Date.now()}`, text, masteredAt: null, isNew: true },
    ])
    setNewGoalText('')
  }

  const handleUpdateNewLivingGoal = (goalId, text) => {
    setLivingGoals((prev) => prev.map((goal) => (
      goal.id === goalId ? { ...goal, text } : goal
    )))
  }

  const handleRemoveNewLivingGoal = (goalId) => {
    setLivingGoals((prev) => prev.filter((goal) => goal.id !== goalId))
  }

  const handleSavePracticeSummary = async () => {
    if (!sessionId) {
      closeStageThen()
      return
    }

    if (!feedbackKidProfileId) {
      setSummaryError('Choose which child this feedback is for first.')
      return
    }

    setSummarySaving(true)
    setSummaryError('')
    try {
      // Collect new goals added this session
      const newGoals = livingGoals
        .filter((g) => g.isNew)
        .map((g) => g.text)

      // Collect emoji reactions for existing (prior) goals
      const reactions = Object.entries(goalReactions)
        .filter(([, rating]) => [1, 2, 3].includes(rating))
        .map(([goalId, rating]) => ({ goalId, rating }))

      await saveSessionPracticeReflection(sessionId, {
        kidProfileId: feedbackKidProfileId,
        routineId: routineId || null,
        reflectionNote,
        newGoals,
        goalReactions: reactions,
      })

      const allGoalTexts = livingGoals
        .filter((g) => goalReactions[g.id] !== 3)
        .map((g) => g.text)
      const fallbackReflection = sessionFeedback?.dancerReflection || activeSession?.dancerReflection || { feeling: '', note: '', goals: [] }
      if (feedbackKidProfileId) {
        const savedFeedback = await saveSessionFeedback(sessionId, feedbackKidProfileId, {
          dancerReflection: {
            ...fallbackReflection,
            note: reflectionNote,
            goals: allGoalTexts,
          },
        })
        if (savedFeedback) setSessionFeedback(savedFeedback)
      } else {
        await editSession(sessionId, {
          dancerReflection: {
            ...fallbackReflection,
            note: reflectionNote,
            goals: allGoalTexts,
          },
        })
      }

      setSummarySaving(false)
      closeStageThen(() => notify.success('Practice summary saved ✨'))
    } catch (error) {
      console.warn('Failed to save practice summary:', error)
      setSummaryError(error?.message || 'Could not save summary yet.')
      setSummarySaving(false)
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

    liveVideoRef.current?.pause()
    audioRef.current?.pause()
    setLiveIsPlaying(false)
    setIsPlaying(false)

    setVideoProcessing(true)
    setVideoProcessStage('preparing')
    setVideoCompressionProgress(null)
    setVideoProcessingMessage('⏳ Compressing video to 720p before upload…')
    setVideoError('')
    setIsVideoDownloading(true)
    setVideoDownloadProgress(0)

    try {
      let compressedFile
      try {
        compressedFile = await compressVideoToMax720p(file, {
          onProgress: ({ stage, progress, elapsed }) => {
            if (stage === 'preparing') {
              setVideoProcessStage('preparing')
              setVideoCompressionProgress(null)
              setVideoProcessingMessage('⏳ Preparing video for 720p compression…')
              setVideoDownloadProgress(5)
              return
            }
            if (stage === 'compressing') {
              const pct = Math.round((Number(progress) || 0) * 100)
              const elapsedSec = Number(elapsed) || 0
              const mins = Math.floor(elapsedSec / 60)
              const secs = elapsedSec % 60
              const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
              setVideoProcessStage('compressing')
              setVideoCompressionProgress(pct)
              setVideoProcessingMessage(`⏳ Compressing video to 720p… ${pct}% (${timeStr})`)
              setVideoDownloadProgress(Math.max(5, Math.min(65, Math.round(5 + (pct * 0.6)))))
              return
            }
            if (stage === 'finalizing') {
              setVideoProcessStage('finalizing')
              setVideoCompressionProgress(100)
              setVideoProcessingMessage('⏳ Finalizing compressed video…')
              setVideoDownloadProgress(70)
            }
          },
        })
      } catch (error) {
        setVideoProcessingMessage(`❌ Compression failed: ${error?.message || 'Unknown error'}`)
        throw error
      }

      const sourceSizeLabel = formatFileSize(file.size) || `${file.size} B`
      const compressedSizeLabel = formatFileSize(compressedFile.size) || `${compressedFile.size} B`
      const uploadLimitLabel = formatFileSize(MAX_VIDEO_UPLOAD_BYTES) || '50 MB'
      if (compressedFile.size > MAX_VIDEO_UPLOAD_BYTES) {
        throw new Error(`Compressed video is ${compressedSizeLabel}. Maximum allowed size is ${uploadLimitLabel} (50 MB limit).`)
      }
      setVideoProcessStage('compressed')
      setVideoCompressionProgress(null)
      setVideoProcessingMessage(`✅ Compressed to 720p MP4: ${sourceSizeLabel} → ${compressedSizeLabel}`)
      setVideoDownloadProgress(75)

      setVideoProcessStage('caching')
      setVideoProcessingMessage('⏳ Saving compressed video and caching locally…')
      await saveFile(liveVideoStorageKey, compressedFile, {
        fileName: compressedFile.name,
        originalFileName: file.name,
        type: compressedFile.type,
        size: compressedFile.size,
        routineId,
        sessionId: sessionId || null,
      })
      setVideoDownloadProgress(90)

      setVideoProcessingMessage('⏳ Verifying local video cache…')
      const cachedVideo = await loadLocalFile(liveVideoStorageKey)
      if (!cachedVideo?.blob) {
        throw new Error('Video was not fully cached locally yet. Please retry upload.')
      }
      setVideoDownloadProgress(100)

      resetVideoSyncState()

      const url = URL.createObjectURL(cachedVideo.blob)
      setLiveVideoUrl(url)
      setVideoFileName(cachedVideo.meta?.fileName || compressedFile.name)
      setLiveTime(0)
      setLiveIsPlaying(false)

      if (sessionId) {
        attachRehearsalVideo(sessionId, liveVideoStorageKey, compressedFile.name)
      } else {
        editChoreographyVersion(routineId, selectedVersion?.id, { videoFileName: compressedFile.name })
      }

      // Upload/caching pipeline is complete here; unlock playback immediately.
      setVideoProcessing(false)
      setVideoProcessStage('idle')
      setVideoCompressionProgress(null)
      setIsVideoDownloading(false)
      setVideoDownloadProgress(null)

      if (audioUrl) {
        try {
          const musicResp = await fetch(audioUrl)
          const musicBlob = await musicResp.blob()
          const musicFile = new File([musicBlob], 'music.mp3', { type: musicBlob.type || 'audio/mpeg' })
          await runSyncAnalysis(musicFile, compressedFile)
        } catch (err) {
          console.warn('Sync failed:', err)
        }
      }
    } catch (error) {
      console.error('[VideoUpload] ❌ Error:', error)
      setVideoError(error?.message || 'Video upload failed. Please try again.')
    } finally {
      setVideoProcessing(false)
      setVideoProcessStage('idle')
      setVideoCompressionProgress(null)
      setIsVideoDownloading(false)
      setVideoDownloadProgress(null)
    }
  }, [audioUrl, liveVideoStorageKey, resetVideoSyncState, routineId, runSyncAnalysis, selectedVersion?.id, sessionId])

  // ========== LIVE MODE VIDEO ==========
  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      await applyVideoFile(file)
    } catch (err) {
      notify(err?.message || 'Could not save video. Check connection and try again.')
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

  // Keep master music timeline synced with live video (drift-correct every frame)
  const syncLiveAudio = useCallback((videoT) => {
    const audio = audioRef.current
    if (!audio || !audioUrl) return
    const target = videoT - syncOffset

    if (liveAudioMode === 'music') {
      audio.muted = false
      audio.volume = 1
    } else {
      audio.muted = true
      audio.volume = 0
    }

    if (target < 0) {
      // Master track hasn't reached start point yet.
      if (!audio.paused) audio.pause()
      return
    }

    // Master track should be running while video is playing.
    if (audio.paused) {
      const video = liveVideoRef.current
      if (video && !video.paused) {
        audio.currentTime = target
        audio.play().catch(() => {
          if (liveAudioMode === 'music') {
            setLiveAudioMode('video')
            video.muted = false
          }
        })
      }
    } else if (Math.abs(audio.currentTime - target) > 0.5) {
      audio.currentTime = target
    }
  }, [audioUrl, syncOffset, liveAudioMode])

  const toggleLivePlay = () => {
    if (!filesLoaded || videoProcessing) return
    const video = liveVideoRef.current
    const audio = audioRef.current
    if (isLiveVideoPlayback && video) {
      if (liveIsPlaying) {
        video.pause()
        audio?.pause()
      } else {
        if (audio && audioUrl) {
          const musicTarget = video.currentTime - syncOffset
          if (musicTarget >= 0) {
            if (liveAudioMode === 'music') {
              audio.muted = false
              audio.volume = 1
            } else {
              audio.muted = true
              audio.volume = 0
            }
            audio.currentTime = musicTarget
            audio.play().catch(() => {
              if (liveAudioMode === 'music') {
                setLiveAudioMode('video')
                video.muted = false
              }
            })
          }
          // If musicTarget < 0, syncLiveAudio will auto-start when the time comes.
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
    const canUseMusicTrack = !!audioUrl && !!audio
    if (liveAudioMode === 'music' && canUseMusicTrack) {
      // Music is the audible output.
      video.muted = true
      if (liveIsPlaying && audio && audioUrl) {
        const musicTarget = video.currentTime - syncOffset
        if (musicTarget >= 0) {
          audio.muted = false
          audio.volume = 1
          audio.currentTime = musicTarget
          audio.playbackRate = playbackRate
          audio.play().catch(() => {
            setLiveAudioMode('video')
            video.muted = false
          })
        }
        // If musicTarget < 0, syncLiveAudio will auto-start when the time comes.
      }
    } else {
      // Video is audible output; keep master music track silent and synced.
      video.muted = false
      if (audio && audioUrl) {
        audio.muted = true
        audio.volume = 0
        if (liveIsPlaying) {
          const musicTarget = video.currentTime - syncOffset
          if (musicTarget >= 0) {
            audio.currentTime = musicTarget
            audio.playbackRate = playbackRate
            audio.play().catch(() => {})
          } else {
            audio.pause()
          }
        } else {
          audio.pause()
        }
      }
    }
  }, [liveAudioMode, liveVideoUrl, audioUrl, liveIsPlaying, syncOffset, playbackRate])

  // Seek live mode to a specific time
  const seekLive = useCallback((time) => {
    const video = liveVideoRef.current
    const audio = audioRef.current
    if (isLiveVideoPlayback && video) {
      video.currentTime = time
      setLiveTime(time)
      if (audio && audioUrl) {
        const musicTarget = time - syncOffset
        if (musicTarget >= 0) {
          audio.currentTime = musicTarget
          if (liveIsPlaying && audio.paused) {
            audio.play().catch(() => {})
          }
        } else {
          audio.currentTime = 0
          audio.pause()
        }
      }
    } else if (audio) {
      audio.currentTime = time
      setCurrentTime(time)
    }
  }, [isLiveVideoPlayback, audioUrl, syncOffset, liveIsPlaying])

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
  }, [isLiveSeeking, getSeekTimeFromClientX, seekLive])

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
      const musicResp = await fetch(audioUrl)
      const musicBlob = await musicResp.blob()
      let videoBlob = null

      const cachedVideo = await loadLocalFile(liveVideoStorageKey)
      if (cachedVideo?.blob) {
        videoBlob = cachedVideo.blob
      } else {
        const videoResp = await fetch(liveVideoUrl)
        videoBlob = await videoResp.blob()
      }

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
    setManualSyncMessage('Uploading local files...')

    try {
      const localFileKeys = Array.from(new Set([
        routineMusicStorageKey,
        'choreo-music',
        liveVideoStorageKey,
        'choreo-video',
      ]))
      let uploadedCount = 0

      for (const key of localFileKeys) {
        const localFile = await loadLocalFile(key)
        if (!localFile?.blob) continue
        await saveFile(key, localFile.blob, {
          ...(localFile.meta || {}),
          routineId: localFile.meta?.routineId || routineId,
          sessionId: localFile.meta?.sessionId || sessionId || null,
        })
        uploadedCount += 1
      }

      if (uploadedCount === 0) {
        setManualSyncMessage('No browser-local files found to upload.')
      } else {
        setManualSyncMessage(`Uploaded ${uploadedCount} local file${uploadedCount === 1 ? '' : 's'} to backend storage.`)
      }
    } catch (err) {
      console.error('Manual local sync failed:', err)
      setManualSyncMessage('Sync failed. Check backend env vars/policies and try again.')
    } finally {
      setManualSyncing(false)
    }
  }

  const handleCreateVersion = async (mode = 'clone') => {
    if (!routineId) return
    const nextVersionNumber = versions.length + 1
    const clonedInstructions = mode === 'clone' ? JSON.parse(JSON.stringify(selectedVersion?.songInstructions || [])) : []
    const clonedCues = mode === 'clone' ? JSON.parse(JSON.stringify(selectedVersion?.cues || [])) : []

    const versionData = {
      label: mode === 'clone' ? `v${nextVersionNumber} amendment` : `v${nextVersionNumber} blank`,
      musicUrl: mode === 'clone' ? getPersistableMediaUrl(selectedVersion?.musicUrl) : '',
      musicFileName: mode === 'clone' ? (selectedVersion?.musicFileName || '') : '',
      duration: mode === 'clone' ? (selectedVersion?.duration || 0) : 0,
      songInstructions: clonedInstructions,
      cues: clonedCues,
      videoSyncOffset: mode === 'clone' ? (selectedVersion?.videoSyncOffset || 0) : 0,
      videoSyncConfidence: null,
      videoFileName: '',
    }

    const created = await addChoreographyVersion(routineId, versionData)
    setSelectedVersionId(created.id)

    if (sessionId) {
      setRehearsalVersion(sessionId, created.id)
    }
  }

  // Derived time for live mode: music track is the master timeline.
  const hasMasterAudioClock = isLiveVideoPlayback && !!audioUrl
  const masterAudioTime = hasMasterAudioClock
    ? Number(audioRef.current?.currentTime || 0)
    : null
  const effectiveLiveTime = isLiveVideoPlayback
    ? (hasMasterAudioClock
      ? masterAudioTime
      : (liveTime - syncOffset))
    : currentTime
  const liveTotalDuration = liveDuration || duration
  const isLivePlaybackActive = isPlaying || liveIsPlaying

  // Derived beat info for live mode
  const liveBeatInfo = beatData ? getCurrentBeatInfo(effectiveLiveTime, beatData) : null

  // ========== SONG-LEVEL INSTRUCTIONS ==========
  const songInstructions = useMemo(
    () => (choreography.songInstructions || []).map(normalizeSongInstruction),
    [choreography.songInstructions]
  )
  const cues = useMemo(() => choreography.cues || [], [choreography.cues])
  const songInstructionsRef = useRef(songInstructions)
  songInstructionsRef.current = songInstructions

  const addSongInstruction = (startPos, endPos, text = '') => {
    const newId = generateId('sinst')
    const minPos = Math.min(startPos, endPos)
    const maxPos = Math.max(startPos, endPos)
    const promptText = clampInstructionPrompt(text)
    const updated = [...songInstructions, {
      id: newId,
      text: promptText,
      promptText,
      expandedText: '',
      startPos: minPos,
      endPos: maxPos,
    }]
    editChoreographyVersion(routineId, selectedVersion?.id, { songInstructions: updated })
    return newId
  }

  const updateSongInstruction = (id, patch) => {
    const updated = songInstructions.map((inst) => {
      if (inst.id !== id) return inst
      const nextInst = { ...inst, ...patch }
      const promptText = clampInstructionPrompt(nextInst.promptText ?? nextInst.text ?? '')
      return {
        ...nextInst,
        promptText,
        text: promptText,
        expandedText: String(nextInst.expandedText || '').slice(0, LIVE_EXPANDED_MAX_CHARS),
      }
    })
    editChoreographyVersion(routineId, selectedVersion?.id, { songInstructions: updated })
  }

  const deleteSongInstruction = (id) => {
    editChoreographyVersion(routineId, selectedVersion?.id, { songInstructions: songInstructions.filter(i => i.id !== id) })
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
  // Click handler for single-tap instruction creation (on each beat row)
  const handleBeatClick = (pos) => {
    // Skip if this click is the tail end of a drag gesture
    if (didDragRef.current) {
      didDragRef.current = false
      return
    }
    const newId = addSongInstruction(pos, pos)
    setEditingInstId(newId)
    rangeStartRef.current = null
    dragEndRef.current = null
    isDraggingRef.current = false
    setRangeStartPos(null)
    setDragEndPos(null)
    setIsDragging(false)
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
        editChoreographyVersion(routineId, selectedVersion?.id, { songInstructions: updated })
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
        rangeStartRef.current = dragEndRef.current ?? newPos
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
  const liveSongInstruction = useMemo(() => {
    const leadSec = promptLeadMs / 1000
    if (!beatData?.beats?.length || !songInstructions.length) {
      if (!cues.length) return null
      const sortedCues = [...cues].sort((a, b) => a.time - b.time)
      const time = effectiveLiveTime

      for (let i = 0; i < sortedCues.length; i++) {
        const cue = sortedCues[i]
        const nextCue = sortedCues[i + 1]
        const startTime = cue.time - leadSec
        const endTime = nextCue ? (nextCue.time - leadSec) : (cue.time + 2 - leadSec)
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
      const promptText = getInstructionPromptText(inst)
      if (!promptText.trim()) continue
      const startTime = getBeatTime(inst.startPos)
      if (startTime == null) continue
      const endTime = getBeatTime(inst.endPos)
      const triggerTime = startTime - leadSec
      // Stay visible until half a beat after the last position
      const hideTime = endTime != null
        ? endTime + beatInterval * 0.5 - leadSec
        : startTime + beatInterval - leadSec
      if (time >= triggerTime && time < hideTime) {
        matches.push(inst)
      }
    }
    if (matches.length === 0) return null
    // Prefer narrower (more specific) instructions
    matches.sort((a, b) => (a.endPos - a.startPos) - (b.endPos - b.startPos))
    const best = matches[0]
    const promptText = getInstructionPromptText(best)
    return {
      text: promptText,
      expandedText: getInstructionExpandedText(best),
      id: best.id,
      emoji: best.emoji || suggestEmoji(promptText),
    }
  }, [effectiveLiveTime, beatData, songInstructions, cues, promptLeadMs])

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
        const promptText = getInstructionPromptText(inst)
        if (!promptText.trim()) return false
        const startTime = getBeatTime(inst.startPos)
        if (startTime == null) return false
        // Exclude the currently active instruction
        if (liveSongInstruction && inst.id === liveSongInstruction.id) return false
        return startTime > time
      })
      .sort((a, b) => a.startPos - b.startPos)

    if (upcoming.length === 0) return null
    const next = upcoming[0]
    const promptText = getInstructionPromptText(next)
    return { text: promptText, id: next.id, emoji: next.emoji || suggestEmoji(promptText) }
  }, [effectiveLiveTime, beatData, songInstructions, liveSongInstruction, cues])

  const liveInstructionDisplayText = liveSongInstruction
    ? (isLivePlaybackActive
      ? liveSongInstruction.text
      : (liveSongInstruction.expandedText || liveSongInstruction.text))
    : ''
  const showLiveInstructionCard = !/press\s*play\s*(and|&)\s*dance/i.test(liveInstructionDisplayText || '')
  const isExpandedLiveInstruction = Boolean(
    liveSongInstruction && !isLivePlaybackActive && liveSongInstruction.expandedText
  )

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
  }, [liveEditOpen, liveBeatInfo, timelineRows])

  // Frame-accurate update loop for live mode (keeps UI time stable on heavy videos)
  useEffect(() => {
    const video = liveVideoRef.current
    if (mode !== 'live' || !liveIsPlaying || !video) {
      if (typeof liveAnimRef.current === 'number') cancelAnimationFrame(liveAnimRef.current)
      liveAnimRef.current = null
      lastLiveClockTimeRef.current = -1
      return
    }

    let cancelled = false
    let lastFrameTs = performance.now()
    let watchdogId = null
    let usingRafFallback = false

    const updateClock = (videoTime) => {
      if (!Number.isFinite(videoTime)) return
      const clampedTime = Math.max(0, videoTime)
      const last = lastLiveClockTimeRef.current
      if (last < 0 || Math.abs(clampedTime - last) >= 0.008) {
        lastLiveClockTimeRef.current = clampedTime
        setLiveTime(clampedTime)
      }
      if (audioRef.current) {
        setCurrentTime(audioRef.current.currentTime)
      }
      syncLiveAudio(clampedTime)
      lastFrameTs = performance.now()
    }

    const supportsVideoFrameCallback = typeof video.requestVideoFrameCallback === 'function'

    // rAF fallback tick (used when requestVideoFrameCallback stalls or isn't supported)
    const rafTick = () => {
      if (cancelled) return
      updateClock(video.currentTime)
      liveAnimRef.current = requestAnimationFrame(rafTick)
    }

    if (supportsVideoFrameCallback) {
      const onFrame = (_now, metadata) => {
        if (cancelled) return
        usingRafFallback = false
        const mediaTime = Number(metadata?.mediaTime)
        updateClock(Number.isFinite(mediaTime) ? mediaTime : video.currentTime)
        liveAnimRef.current = video.requestVideoFrameCallback(onFrame)
      }
      liveAnimRef.current = video.requestVideoFrameCallback(onFrame)

      // Watchdog: if requestVideoFrameCallback hasn't fired in 500ms while
      // video is supposed to be playing, fall back to rAF polling so the UI
      // stays responsive and audio sync continues.
      watchdogId = setInterval(() => {
        if (cancelled) return
        const elapsed = performance.now() - lastFrameTs
        if (elapsed > 500 && !video.paused && !video.ended) {
          if (!usingRafFallback) {
            usingRafFallback = true
            // Cancel stalled VFC and switch to rAF
            if (typeof video.cancelVideoFrameCallback === 'function' && typeof liveAnimRef.current === 'number') {
              video.cancelVideoFrameCallback(liveAnimRef.current)
            }
            liveAnimRef.current = requestAnimationFrame(rafTick)
          }
          // Also nudge the video to recover from decode stalls
          if (video.readyState < 3) {
            const cur = video.currentTime
            video.currentTime = cur // force re-seek to unstick decoder
          }
        }
      }, 500)
    } else {
      liveAnimRef.current = requestAnimationFrame(rafTick)
    }

    return () => {
      cancelled = true
      if (watchdogId) clearInterval(watchdogId)
      if (!usingRafFallback && supportsVideoFrameCallback && typeof video.cancelVideoFrameCallback === 'function' && typeof liveAnimRef.current === 'number') {
        video.cancelVideoFrameCallback(liveAnimRef.current)
      } else if (typeof liveAnimRef.current === 'number') {
        cancelAnimationFrame(liveAnimRef.current)
      }
      liveAnimRef.current = null
      lastLiveClockTimeRef.current = -1
    }
  }, [mode, liveIsPlaying, liveAudioMode, syncLiveAudio])

  // ========== VIDEO SYNC ==========

  const nudgeOffset = (delta) => {
    const newOffset = (effectiveSyncOffsetMs || 0) + delta
    if (sessionId && activeSession?.id) {
      setSyncResult({
        offsetMs: newOffset,
        confidence: Number.isFinite(syncResult?.confidence)
          ? syncResult.confidence
          : (Number.isFinite(storedSyncConfidence) ? storedSyncConfidence : 0),
      })
      writeSessionSyncBackup(newOffset, null)
      editSession(activeSession.id, {
        liveSyncOffsetMs: newOffset,
        liveSyncConfidence: null,
      }).catch((err) => console.warn('Save nudged session sync failed:', err))
    } else if (routineId && selectedVersion?.id) {
      editChoreographyVersion(routineId, selectedVersion.id, {
        videoSyncOffset: newOffset,
        videoSyncConfidence: null,
      })
    }
  }

  // ========== KEYBOARD SHORTCUTS ==========
  useEffect(() => {
    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'Space') {
        e.preventDefault()
        if (mode === 'live' || isKidLiveView) {
          toggleLivePlay()
        } else {
          togglePlay()
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  })

  // ========== RENDER ==========
  const playheadLeft = duration > 0 ? `${(currentTime / duration) * 100}%` : '0%'
  const choreographyTrackDuration = duration || liveTotalDuration
  const getBeatPositionTime = (beatPos) => {
    if (!beatData?.beats?.length || !Number.isFinite(beatPos)) return null
    const beatIdx = Math.floor(beatPos)
    if (beatIdx < 0 || beatIdx >= beatData.beats.length) return null
    let time = beatData.beats[beatIdx]
    if (beatPos % 1 !== 0 && Number.isFinite(beatData.bpm) && beatData.bpm > 0) {
      const beatInterval = 60 / beatData.bpm
      time += beatInterval * 0.5
    }
    return time
  }
  const mapMusicTimeToProgressTime = (musicTime) => {
    if (!Number.isFinite(musicTime)) return 0
    const mapped = isLiveVideoPlayback ? (musicTime + syncOffset) : musicTime
    const maxTime = liveTotalDuration || choreographyTrackDuration || mapped || 0
    return Math.max(0, Math.min(mapped, maxTime))
  }
  const liveProgressTimeRaw = isLiveVideoPlayback
    ? liveTime
    : currentTime
  const liveProgressTime = Math.max(0, Math.min(liveProgressTimeRaw, liveTotalDuration || liveProgressTimeRaw || 0))
  const liveProgressLeft = liveTotalDuration > 0
    ? `${(liveProgressTime / liveTotalDuration) * 100}%`
    : '0%'
  const hasSyncResult = (!!syncResult && !syncResult.error)
    || Number.isFinite(storedSyncConfidence)
  const syncOffsetMs = Math.round(syncResult?.offsetMs ?? storedSyncOffsetMs ?? 0)
  const syncConfidence = syncResult?.error
    ? null
    : (Number.isFinite(syncResult?.confidence)
      ? syncResult.confidence
      : (Number.isFinite(storedSyncConfidence) ? storedSyncConfidence : null))
  const syncConfidencePct = syncConfidence == null
    ? null
    : Math.max(0, Math.min(100, Math.round(syncConfidence * 100)))
  const syncLabel = syncing
    ? 'Syncing...'
    : (hasSyncResult
      ? 'Synced'
      : 'Tap to Sync')
  const syncTooltip = !audioUrl || !liveVideoUrl
    ? 'Load both song and video first'
    : (hasSyncResult
      ? `Click to re-sync and refresh offset/confidence • ${syncOffsetMs}ms${syncConfidencePct != null ? ` • ${syncConfidencePct}%` : ''}`
      : 'Click to re-sync and refresh offset/confidence')
  const hasVideoProgress = typeof videoDownloadProgress === 'number'
  const videoProgressLabel = hasVideoProgress ? `${Math.max(0, Math.min(100, Math.round(videoDownloadProgress)))}%` : ''
  const compressionPctLabel = typeof videoCompressionProgress === 'number'
    ? `${Math.max(0, Math.min(100, Math.round(videoCompressionProgress)))}%`
    : ''
  const compressingLabel = videoProcessStage === 'compressing'
    ? `Compressing video...${compressionPctLabel ? ` ${compressionPctLabel}` : ''}`
    : videoProcessStage === 'preparing'
      ? 'Preparing video...'
      : videoProcessStage === 'finalizing'
        ? 'Finalizing video...'
        : videoProcessStage === 'caching'
          ? 'Caching video...'
          : `Compressing video...${videoProgressLabel ? ` ${videoProgressLabel}` : ''}`
  const videoUploadButtonLabel = videoProcessing
    ? compressingLabel
    : (liveVideoUrl ? '🎥 Change video' : '📹 Upload practice video')
  const canManageLiveControls = !isKidMode && !isKidLiveView
  const showLiveFeedbackToggle = !isKidMode
    && !isKidLiveView
    && Boolean(sessionId)
    && routineFeedbackKids.length > 1
  const priorLivingGoals = livingGoals.filter((g) => !g.isNew)
  const newLivingGoals = livingGoals.filter((g) => g.isNew)

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
                        setRehearsalVersion(sessionId, nextVersionId)
                      }
                    }}
                    style={{ fontSize: '0.85rem', padding: '4px 8px', borderRadius: 6 }}
                  >
                    {versions.map((v, i) => (
                      <option key={v.id} value={v.id}>
                        v{i + 1} {v.createdAt ? `(${new Date(v.createdAt).toLocaleDateString()})` : ''}
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
            {videoProcessingMessage && videoProcessing && (
              <p style={{ margin: '4px 0 8px', fontSize: '0.85rem', color: '#7c3aed' }}>{videoProcessingMessage}</p>
            )}
            {videoError && (
              <p style={{ margin: '4px 0 8px', fontSize: '0.85rem', color: '#dc2626', fontWeight: 600 }}>
                ❌ {videoError}
              </p>
            )}
            <div className={styles['sync-row']}>
              <label className={styles['sync-video-upload']}>
                {videoUploadButtonLabel}
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleVideoUpload}
                  disabled={videoProcessing}
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
                  {Math.round(effectiveSyncOffsetMs)}ms
                </span>
                <button className={styles['nudge-btn']} onClick={() => nudgeOffset(50)}>+</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ===== LIVE MODE — fullscreen dance game ===== */}
      {(mode === 'live' || isKidLiveView) && (
        <div
          ref={liveScreenRef}
          className={`${styles['live-screen']} ${liveUiVisible ? styles['live-screen-controls-visible'] : ''}`}
          onPointerMove={revealLiveUi}
          onPointerDown={revealLiveUi}
          onTouchStart={revealLiveUi}
        >
          {/* Background: video (when loaded) or dark gradient */}
          {isLiveVideoPlayback ? (
            <video
              ref={liveVideoRef}
              src={liveVideoUrl}
              className={styles['live-video-bg']}
              style={{ objectFit: 'contain', objectPosition: 'center center' }}
              x-webkit-airplay="allow"
              muted={liveAudioMode === 'music' && !!audioUrl}
              playsInline
              preload="auto"
              onLoadedMetadata={(e) => setLiveDuration(e.target.duration)}
              onPlay={() => setLiveIsPlaying(true)}
              onPause={() => setLiveIsPlaying(false)}
              onEnded={handleLiveVideoEnded}
            />
          ) : (
            <div className={styles['live-no-video']}>
              {!isKidLiveView && (
                <div className={styles['live-no-video-card']}>
                  {filesLoaded ? (
                    <>
                      <span className={styles['live-state-icon']} style={{ marginBottom: 8 }}>🎬</span>
                      <p className={styles['live-no-video-title']}>No video loaded</p>
                      <p className={styles['live-no-video-subtitle']}>Add video or music to get started</p>
                      {canManageLiveControls && (
                        <div className={styles['live-no-video-actions']}>
                          <button
                            type="button"
                            className={styles['live-no-video-action-btn']}
                            onClick={() => videoPickerInputRef.current?.click()}
                          >
                            📹 Add Video
                          </button>
                          {!audioUrl && (
                            <button
                              type="button"
                              className={styles['live-no-video-action-btn']}
                              onClick={() => musicPickerInputRef.current?.click()}
                            >
                              🎵 Add Music
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : null}
                </div>
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
              onPause={() => {
                const video = liveVideoRef.current
                if (video) video.pause()
                const audio = audioRef.current
                if (liveAudioMode === 'music' && audio) audio.pause()
              }}
              onTogglePlay={toggleLivePlay}
              onAddAnnotation={(ann) => {
                const annotationWithVideoScope = {
                  ...ann,
                  sourceVideoKey: currentFeedbackVideoKey || ann.sourceVideoKey || null,
                }
                const updated = [...videoAnnotations, annotationWithVideoScope]
                if (sessionId) {
                  if (!feedbackKidProfileId) return
                  setSessionFeedback((prev) => ({ ...prev, videoAnnotations: updated }))
                  saveSessionFeedback(sessionId, feedbackKidProfileId, { videoAnnotations: updated })
                    .then((saved) => { if (saved) setSessionFeedback(saved) })
                    .catch((e) => console.warn('Save annotation feedback:', e))
                } else {
                  editChoreographyVersion(routineId, selectedVersion?.id, { videoAnnotations: updated })
                }
              }}
              onDeleteAnnotation={(annId) => {
                const updated = videoAnnotations.filter(a => a.id !== annId)
                if (sessionId) {
                  if (!feedbackKidProfileId) return
                  setSessionFeedback((prev) => ({ ...prev, videoAnnotations: updated }))
                  saveSessionFeedback(sessionId, feedbackKidProfileId, { videoAnnotations: updated })
                    .then((saved) => { if (saved) setSessionFeedback(saved) })
                    .catch((e) => console.warn('Delete annotation feedback:', e))
                } else {
                  editChoreographyVersion(routineId, selectedVersion?.id, { videoAnnotations: updated })
                }
              }}
              onUpdateAnnotation={(annId, updates) => {
                const updated = videoAnnotations.map((ann) => (
                  ann.id === annId ? { ...ann, ...updates } : ann
                ))
                if (sessionId) {
                  if (!feedbackKidProfileId) return
                  setSessionFeedback((prev) => ({ ...prev, videoAnnotations: updated }))
                  saveSessionFeedback(sessionId, feedbackKidProfileId, { videoAnnotations: updated })
                    .then((saved) => { if (saved) setSessionFeedback(saved) })
                    .catch((e) => console.warn('Update annotation feedback:', e))
                } else {
                  editChoreographyVersion(routineId, selectedVersion?.id, { videoAnnotations: updated })
                }
              }}
              currentVideoFeedbackKey={currentFeedbackVideoKey}
              hideInlineEmojiForCurrentVideo
              allowEditOnCurrentVideoOnly
            />
          )}

          {!isKidLiveView && (
            <>
              {/* Top bar: exit + upload + clock */}
              <div className={`${styles['live-top-bar']} ${!liveUiVisible ? styles['live-top-bar-hidden'] : ''}`}>
                <button
                  className={styles['live-exit-btn']}
                  onClick={goBackFromLive}
                >
                  ✕ Exit
                </button>
                {showLiveFeedbackToggle && (
                  <label className={styles['live-feedback-toggle']}>
                    <span className={styles['live-feedback-toggle-label']}>Leaving feedback for</span>
                    <select
                      className={styles['live-feedback-toggle-select']}
                      value={feedbackKidProfileId || ''}
                      onChange={(e) => setSelectedFeedbackKidId(e.target.value || null)}
                    >
                      {routineFeedbackKids.map((kid) => (
                        <option key={kid.id} value={kid.id}>
                          {kid.display_name || 'Dancer'}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {canManageLiveControls && (
                  <>
                    <button
                      type="button"
                      className={styles['live-upload-btn']}
                      title={musicFileName || 'No song loaded'}
                      onClick={() => openMediaPicker('audio')}
                    >
                      <span className={styles['live-upload-icon']} aria-hidden="true">🎵</span>
                      <span className={styles['live-upload-text']}>Music</span>
                      <span className={styles['live-upload-pencil']} aria-hidden="true">✏️</span>
                    </button>
                    <button
                      type="button"
                      className={styles['live-upload-btn']}
                      title={videoProcessing ? compressingLabel : (videoFileName || 'No video loaded')}
                      disabled={videoProcessing}
                      onClick={() => openMediaPicker('video')}
                    >
                      <span className={styles['live-upload-icon']} aria-hidden="true">🎥</span>
                      <span className={styles['live-upload-text']}>{videoProcessing ? compressingLabel : 'Video'}</span>
                      {!videoProcessing && <span className={styles['live-upload-pencil']} aria-hidden="true">✏️</span>}
                    </button>
                    <button
                      className={styles['live-sync-btn']}
                      onClick={handleLiveResync}
                      disabled={!audioUrl || !liveVideoUrl || syncing}
                      title={syncTooltip}
                    >
                      <span
                        className={`${styles['live-sync-icon']} ${syncing ? styles['live-sync-icon-spinning'] : ''}`}
                        aria-hidden="true"
                      >
                        ↻
                      </span>
                      <span className={styles['live-sync-text']}>{syncLabel}</span>
                    </button>
                  </>
                )}
                <div className={styles['live-top-spacer']} />
                <div className={styles['live-top-actions']}>
                  <button
                    type="button"
                    className={styles['live-top-action-btn']}
                    onClick={handleCastToScreen}
                    disabled={!isLiveVideoPlayback}
                    title={isLiveVideoPlayback ? 'Cast to external screen' : 'Load a video to cast'}
                  >
                    <span className={styles['live-top-action-icon']} aria-hidden="true">📺</span>
                    <span className={styles['live-top-action-label']}>Cast</span>
                  </button>
                  <button
                    type="button"
                    className={styles['live-top-action-btn']}
                    onClick={toggleLiveFullscreen}
                    title={isLiveFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                  >
                    <span className={styles['live-top-action-icon']} aria-hidden="true">{isLiveFullscreen ? '🗗' : '⛶'}</span>
                    <span className={styles['live-top-action-label']}>{isLiveFullscreen ? 'Exit Full' : 'Fullscreen'}</span>
                  </button>
                </div>
              </div>

              {canManageLiveControls && (
                <>
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

                  <MediaPickerDialog
                    open={mediaPickerOpen}
                    title={mediaPickerType === 'video' ? '🎥 Change Video' : '🎵 Change Song'}
                    uploadLabel={mediaPickerType === 'video'
                      ? (videoProcessing ? compressingLabel : '📁 Upload new video')
                      : '📁 Upload new song'}
                    onClose={closeMediaPicker}
                    onUpload={handlePickerUploadClick}
                    uploadDisabled={videoProcessing && mediaPickerType === 'video'}
                    subtitle="Or pick existing media"
                    loading={mediaPickerLoading}
                    error={mediaPickerError}
                    emptyText={`No existing ${mediaPickerType === 'video' ? 'videos' : 'songs'} found.`}
                    items={mediaPickerItems}
                    selectingId={mediaPickerSelectingId}
                    onSelect={handlePickExistingMedia}
                    getItemId={(item) => item.id || item.key}
                    getPrimaryText={(item) => `${mediaPickerType === 'video' ? '🎥' : '🎵'} ${toDisplayFileName(item.fileName || item.id, 42)}`}
                    getMetaText={(item, isSelecting) => {
                      const sizeLabel = formatFileSize(item.size)
                      return isSelecting ? 'Loading…' : (sizeLabel || 'Existing file')
                    }}
                  />
                </>
              )}
            </>
          )}

          {/* Top center stack: next-step prompt + beat counter */}
          {((nextSongInstruction && (isPlaying || liveIsPlaying)) || showBeats) && (
            <div className={styles['live-top-center-stack']}>
              {showBeats && (
                <div
                  className={styles['live-beat-counter']}
                  title={liveBeatInfo
                    ? `Beat ${liveBeatInfo.count} of 8 • 8-count group ${liveBeatInfo.group}`
                    : 'Beat counter ready'}
                  aria-label={liveBeatInfo
                    ? `Beat ${liveBeatInfo.count} of 8, group ${liveBeatInfo.group}`
                    : 'Beat counter ready'}
                >
                  <div className={styles['live-beat-dots']}>
                    {BEAT_SLOTS.map((slot) => {
                      const beatNum = slot
                      const currentCount = liveBeatInfo?.count ?? 0
                      const isCurrent = liveBeatInfo ? (beatNum === currentCount && !liveBeatInfo.isAnd) : false
                      const dotClass = isCurrent ? styles['live-beat-dot-current'] : (beatNum < currentCount ? styles['live-beat-dot-past'] : '')
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

              {nextSongInstruction && isLivePlaybackActive && (
                <div className={styles['live-next-preview']}>
                  Up next: {nextSongInstruction.emoji && <span>{nextSongInstruction.emoji} </span>}{nextSongInstruction.text}
                </div>
              )}
            </div>
          )}

          {/* Current instruction — big animated card */}
          {!filesLoaded ? (
            <div className={`${styles['live-cue-idle']} ${styles['live-cue-loading-centered']}`}>
              <span className={styles['live-state-icon']}>⏳</span>
              <p style={{ fontWeight: 600, marginTop: 8 }}>
                Loading music & video…
              </p>
              <p className={styles['live-cue-idle-subtitle']}>Almost ready!</p>
            </div>
          ) : (liveSongInstruction && showLiveInstructionCard) ? (
            <div key={liveSongInstruction.id} className={styles['live-cue-card']}>
              <span className={`${styles['live-beat-move-label']} ${isExpandedLiveInstruction ? styles['live-beat-move-label-expanded'] : ''}`}>
                {liveSongInstruction.emoji && <span className={styles['live-inst-emoji']}>{liveSongInstruction.emoji} </span>}
                {liveInstructionDisplayText}
              </span>
            </div>
          ) : null}

          {showPracticeSummary && (
            <div className={`${styles['stage-backdrop']} ${summaryClosing ? styles['stage-closing'] : ''}`}>
              {/* Top valance */}
              <div className={styles['stage-valance']} />

              {/* Curtains */}
              <div className={styles['stage-curtain-left']} />
              <div className={styles['stage-curtain-right']} />

              {/* Spotlight glow */}
              <div className={styles['stage-spotlight']} />

              {/* Floating stars */}
              <div className={styles['stage-stars']}>
                {stageStars.map((star, i) => (
                  <span
                    key={i}
                    className={styles['stage-star']}
                    style={{
                      left: `${star.left}%`,
                      top: `${star.top}%`,
                      animationDelay: `${star.delay}s`,
                      fontSize: `${star.size}px`,
                    }}
                  >
                    {star.char}
                  </span>
                ))}
              </div>

              {/* Scrollable content */}
              <div className={styles['stage-content']}>
                {/* Celebration header */}
                <div className={styles['stage-celebration']}>
                  <div className={styles['stage-bravo']}>Bravo!</div>
                  <p className={styles['stage-bravo-sub']}>What an amazing performance!</p>
                </div>

                <div className={styles['stage-recap']}>
                  {(() => {
                    // Start near the end of the intro so it overlaps slightly (less perceived delay).
                    const stageIntroStartDelay = 1.35

                    const bpm = Number(beatData?.bpm)
                    const beatIntervalFromBpm = Number.isFinite(bpm) && bpm > 0 ? (60 / bpm) : null
                    const beatIntervalFromGrid = (Array.isArray(beatData?.beats) && beatData.beats.length > 1)
                      ? Math.max(0.12, Number(beatData.beats[1]) - Number(beatData.beats[0]))
                      : null
                    const recapEmojiStep = beatIntervalFromBpm || beatIntervalFromGrid || 0.5

                    return (
                      <>
                  {stageRecap.emojiPills.length > 0 && (
                    <div className={styles['stage-recap-emojis']}>
                      {stageRecap.emojiPills.map((item, idx) => (
                        <span
                          key={`${item.emoji}-${idx}`}
                          className={`${styles['stage-recap-pill']} ${styles['stage-recap-seq']}`}
                          style={{ animationDelay: `${stageIntroStartDelay + (idx * recapEmojiStep)}s` }}
                        >
                          {item.emoji}{item.count > 1 ? ` × ${item.count}` : ''}
                        </span>
                      ))}
                    </div>
                  )}

                      </>
                    )
                  })()}
                </div>

                {/* 2-col form grid (collapses to 1 col on compact) */}
                <div className={styles['stage-form-grid']}>
                  {/* Left column — what went well */}
                  <div className={styles['stage-form-col']}>
                    <label className={styles['stage-form-label']}>What went well?</label>
                    <textarea
                      className={styles['stage-form-textarea']}
                      placeholder="I nailed my turns today..."
                      value={reflectionNote}
                      rows={4}
                      onChange={(e) => setReflectionNote(e.target.value)}
                    />
                  </div>

                  {/* Right column — living goals */}
                  <div className={styles['stage-form-col']}>
                    {priorLivingGoals.length > 0 && (
                      <>
                        <label className={styles['stage-form-label']}>
                          How did these go? Tap an emoji — only 🤩 clears it!
                        </label>
                        <div className={styles['stage-goal-list']}>
                          {priorLivingGoals.map((goal) => (
                            <div
                              key={goal.id}
                              className={`${styles['stage-goal-item']} ${goalReactions[goal.id] === 3 ? styles['stage-goal-mastered'] : ''}`}
                            >
                              <span className={styles['stage-goal-text']}>{goal.text}</span>
                              <div className={styles['stage-goal-emojis']}>
                                {[
                                  { value: 1, emoji: '😤', label: 'Tough' },
                                  { value: 2, emoji: '😊', label: 'Okay' },
                                  { value: 3, emoji: '🤩', label: 'Nailed it' },
                                ].map((opt) => (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    className={`${styles['stage-emoji-btn']} ${goalReactions[goal.id] === opt.value ? styles['stage-emoji-active'] : ''}`}
                                    onClick={() => setGoalReactions((prev) => ({ ...prev, [goal.id]: opt.value }))}
                                    aria-label={`${goal.text}: ${opt.label}`}
                                    title={opt.label}
                                  >
                                    {opt.emoji}
                                  </button>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                    <label className={styles['stage-form-label']}>
                      {priorLivingGoals.length > 0 ? 'Anything else to work on?' : 'What do you want to work on next time?'}
                    </label>
                    {newLivingGoals.length > 0 && (
                      <div className={styles['stage-goal-list']}>
                        {newLivingGoals.map((goal) => (
                          <div key={goal.id} className={styles['stage-goal-item']}>
                            <input
                              type="text"
                              className={styles['stage-goal-edit-input']}
                              value={goal.text || ''}
                              onChange={(e) => handleUpdateNewLivingGoal(goal.id, e.target.value)}
                              aria-label="Edit next video goal"
                            />
                            <div className={styles['stage-goal-edit-actions']}>
                              <span className={styles['stage-goal-new-badge']}>new</span>
                              <button
                                type="button"
                                className={styles['stage-goal-remove-btn']}
                                onClick={() => handleRemoveNewLivingGoal(goal.id)}
                                aria-label="Remove goal"
                                title="Remove"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={styles['stage-goal-add-row']}>
                      <input
                        type="text"
                        className={styles['stage-form-input']}
                        placeholder="e.g. Land my back walkover"
                        value={newGoalText}
                        onChange={(e) => setNewGoalText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddLivingGoal() } }}
                      />
                      <button
                        type="button"
                        className={styles['stage-form-add']}
                        onClick={handleAddLivingGoal}
                        disabled={!newGoalText.trim()}
                      >
                        + Add
                      </button>
                    </div>
                  </div>
                </div>

                {summaryError && <p className={styles['stage-form-error']}>{summaryError}</p>}

                <div className={styles['stage-actions']}>
                  <button
                    type="button"
                    className={styles['stage-btn-secondary']}
                    onClick={() => closeStageThen(() => {
                      setShowReplayCurtainOpening(true)
                      if (replayCurtainTimerRef.current) {
                        clearTimeout(replayCurtainTimerRef.current)
                      }
                      replayCurtainTimerRef.current = setTimeout(() => {
                        setShowReplayCurtainOpening(false)
                        replayCurtainTimerRef.current = null
                      }, 1350)
                      restartLive()
                      toggleLivePlay()
                    })}
                    disabled={summaryClosing}
                  >
                    🔄 Replay
                  </button>
                  <button
                    type="button"
                    className={styles['stage-btn-primary']}
                    onClick={handleSavePracticeSummary}
                    disabled={summarySaving || summaryClosing}
                  >
                    {summarySaving ? 'Saving…' : (sessionId ? '✨ Save & Take a Bow' : '🎭 Done')}
                  </button>
                </div>

              </div>

              {/* Stage floor with footlights */}
              <div className={styles['stage-floor']}>
                <div className={styles['stage-footlights']}>
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className={styles['stage-footlight']} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {showReplayCurtainOpening && !showPracticeSummary && (
            <div className={styles['stage-replay-overlay']} aria-hidden="true">
              <div className={styles['stage-valance']} />
              <div className={styles['stage-curtain-left']} />
              <div className={styles['stage-curtain-right']} />
            </div>
          )}

          {/* Bottom bar: progress + controls */}
          {filesLoaded && !showPracticeSummary && (
          <div className={`${styles['live-bottom-bar']} ${!liveUiVisible ? styles['live-bottom-bar-hidden'] : ''}`}>
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
              {showBeats && beatData && liveTotalDuration > 0 && choreographyTrackDuration > 0 && beatData.beats.map((bt, i) => {
                const isDownbeat = (i % 8) === 0
                const progressTime = mapMusicTimeToProgressTime(bt)
                return (
                  <div
                    key={`bt-${i}`}
                    className={`${styles['live-progress-beat-tick']} ${isDownbeat ? styles['live-progress-beat-tick-down'] : ''}`}
                    style={{ left: `${(progressTime / liveTotalDuration) * 100}%` }}
                  />
                )
              })}
              <div
                className={styles['live-progress-fill']}
                style={{
                  width: liveTotalDuration > 0
                    ? `${(liveProgressTime / liveTotalDuration) * 100}%`
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
              {canManageLiveControls && (
                <>
                  {/* Song instruction dots on progress bar */}
                  {beatData?.beats && liveTotalDuration > 0 && choreographyTrackDuration > 0 && songInstructions.map((inst) => {
                    const beatTime = getBeatPositionTime(inst.startPos)
                    if (!Number.isFinite(beatTime)) return null
                    const progressTime = mapMusicTimeToProgressTime(beatTime)
                    const isActive = liveSongInstruction?.id === inst.id
                    return (
                      <div
                        key={inst.id}
                        className={`${styles['live-progress-dot']} ${isActive ? styles['live-progress-dot-active'] : ''}`}
                        style={{ left: `${(progressTime / liveTotalDuration) * 100}%` }}
                        title={`${inst.emoji || ''} ${getInstructionPromptText(inst)}`}
                        onClick={(e) => { e.stopPropagation(); seekLive(progressTime) }}
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
              <div className={styles['live-controls-left']}>
                <button className={styles['live-restart-btn']} onClick={restartLive} title="Restart">
                  ⏮
                </button>
              </div>

              <div className={styles['live-controls-center']}>
                <button
                  className={styles['live-play-btn']}
                  onClick={toggleLivePlay}
                  disabled={!filesLoaded || videoProcessing}
                  style={(!filesLoaded || videoProcessing) ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                >
                  {(!filesLoaded || videoProcessing) ? '⏳' : (isLiveVideoPlayback ? liveIsPlaying : isPlaying) ? '⏸' : '▶️'}
                </button>
              </div>

              {!isKidLiveView && (
                <div className={styles['live-controls-right']}>
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
                </div>
              )}
            </div>

            {!isKidLiveView && (
              <div className={styles['live-controls-secondary']}>
                {/* Audio mode toggle — only show when both video + music are available */}
                {liveVideoUrl && audioUrl ? (
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
                ) : (
                  <span />
                )}
                <div className={styles['live-controls-secondary-right']}>
                  {canManageLiveControls && (
                    <button
                      className={`${styles['live-edit-toggle']} ${liveEditOpen ? styles.active : ''}`}
                      onClick={() => setLiveEditOpen(!liveEditOpen)}
                      title="Edit beat instructions"
                    >
                      ✏️ Choreography
                    </button>
                  )}
                  {/* Version picker in live controls */}
                  {versions.length > 1 && (
                    <select
                      className={styles['live-version-select']}
                      value={selectedVersionId || ''}
                      onChange={(e) => {
                        const nextId = e.target.value
                        setSelectedVersionId(nextId)
                        if (sessionId) {
                          setRehearsalVersion(sessionId, nextId)
                        }
                      }}
                    >
                      {versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          v{i + 1}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
          )}

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
                          setRehearsalVersion(sessionId, nextId)
                        }
                      }}
                    >
                      {versions.map((v, i) => (
                        <option key={v.id} value={v.id}>
                          v{i + 1}
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
                    {timelineRows.map((row) => {
                      const isCurrent = liveBeatInfo?.beatIndex === row.beatIndex &&
                        (row.isOffBeat ? liveBeatInfo.isAnd : !liveBeatInfo.isAnd)
                      const isRangeStart = rangeStartPos === row.pos
                      const inDragRange = rangeStartPos !== null && dragEndPos !== null &&
                        row.pos >= Math.min(rangeStartPos, dragEndPos) && row.pos <= Math.max(rangeStartPos, dragEndPos)
                      const hasCoverage = songInstructions.some(inst =>
                        row.pos >= inst.startPos && row.pos <= inst.endPos && getInstructionPromptText(inst).trim()
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
                            <div
                              className={styles['song-inst-editor-fields']}
                              onBlur={(e) => {
                                if (!e.currentTarget.contains(e.relatedTarget)) {
                                  setEditingInstId(null)
                                }
                              }}
                            >
                              <input
                                autoFocus
                                className={styles['song-inst-input']}
                                value={inst.promptText || ''}
                                maxLength={LIVE_PROMPT_MAX_CHARS}
                                onChange={(e) => {
                                  const promptText = e.target.value
                                  const emoji = suggestEmoji(promptText)
                                  updateSongInstruction(inst.id, {
                                    promptText,
                                    text: promptText,
                                    emoji: emoji || undefined,
                                  })
                                }}
                                onKeyDown={(e) => { if (e.key === 'Enter') setEditingInstId(null); if (e.key === 'Escape') { setEditingInstId(null) } }}
                                placeholder={`Prompt (${LIVE_PROMPT_MAX_CHARS} max)…`}
                              />
                              <input
                                className={styles['song-inst-expanded-input']}
                                value={inst.expandedText || ''}
                                maxLength={LIVE_EXPANDED_MAX_CHARS}
                                onChange={(e) => {
                                  updateSongInstruction(inst.id, { expandedText: e.target.value })
                                }}
                                onKeyDown={(e) => { if (e.key === 'Escape') { setEditingInstId(null) } }}
                                placeholder="Expanded text (shown when paused)…"
                              />
                            </div>
                          ) : (
                            <span className={styles['song-inst-text']}>
                              {(inst.emoji || suggestEmoji(inst.promptText)) && <span className={styles['song-inst-emoji']}>{inst.emoji || suggestEmoji(inst.promptText)} </span>}
                              {inst.promptText || 'Tap to edit…'}
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
