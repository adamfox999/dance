import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { generateId } from '../utils/helpers'
import { formatTimestamp } from '../utils/audioSync'
import styles from './VideoAnnotationLayer.module.css'

const EMOJI_PALETTE = [
  '💯', '🔥', '⭐', '💪', '👏', '❤️', '😍', '🎯', '✨', '🙌', '⚡', '👀',
  '🌈', '🦄', '🍀', '🏆', '🪙', '🌟', '🎉', '🎊', '🥳', '🌸', '🦋', '🍭',
  '🍩', '🍦', '🧁', '🍉', '🐣', '🐬', '🐼', '🐯', '🦊', '🐨', '🚀', '🎈',
]
const EMOJI_PAGE_SIZE = 12
const ANNOTATION_VISIBLE_WINDOW = 2 // seconds before/after to show
const MOVE_CANCEL_PX = 10
const DOUBLE_TAP_MS = 280
const DOUBLE_TAP_DISTANCE_PX = 28
const DOUBLE_TAP_MS_TOUCH = 420
const DOUBLE_TAP_DISTANCE_TOUCH_PX = 44

// Vibrant pill colours for text comments
const PILL_COLORS = [
  '#e74c3c', '#e91e63', '#9b59b6', '#8e44ad',
  '#3498db', '#2980b9', '#1abc9c', '#16a085',
  '#2ecc71', '#27ae60', '#f39c12', '#e67e22',
  '#f1c40f', '#d35400', '#e84393', '#6c5ce7',
  '#00cec9', '#fd79a8', '#a29bfe', '#ff7675',
]

// Deterministic colour + angle from annotation id
function getAnnStyle(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0
  }
  const colorIdx = Math.abs(hash) % PILL_COLORS.length
  const angle = ((hash % 11) - 5) // -5 to +5 degrees
  return { color: PILL_COLORS[colorIdx], angle }
}
function getVideoContentRect(videoEl) {
  if (!videoEl || !videoEl.videoWidth || !videoEl.videoHeight) return null

  const containerRect = videoEl.getBoundingClientRect()
  const containerW = containerRect.width
  const containerH = containerRect.height
  const videoAspect = videoEl.videoWidth / videoEl.videoHeight
  const containerAspect = containerW / containerH

  let renderW, renderH
  if (videoAspect > containerAspect) {
    // Video is wider — letterbox top/bottom
    renderW = containerW
    renderH = containerW / videoAspect
  } else {
    // Video is taller — pillarbox left/right
    renderH = containerH
    renderW = containerH * videoAspect
  }

  const offsetX = (containerW - renderW) / 2
  const offsetY = (containerH - renderH) / 2

  return {
    left: containerRect.left + offsetX,
    top: containerRect.top + offsetY,
    width: renderW,
    height: renderH,
    // Relative to the container (for positioning inside .live-screen)
    relLeft: offsetX,
    relTop: offsetY,
  }
}

function screenToVideoCoords(clientX, clientY, videoRect) {
  if (!videoRect) return null
  const x = (clientX - videoRect.left) / videoRect.width
  const y = (clientY - videoRect.top) / videoRect.height
  if (x < 0 || x > 1 || y < 0 || y > 1) return null
  return { x, y }
}

function screenToClampedVideoCoords(clientX, clientY, videoRect) {
  if (!videoRect) return null
  const rawX = (clientX - videoRect.left) / videoRect.width
  const rawY = (clientY - videoRect.top) / videoRect.height
  const x = Math.min(1, Math.max(0, rawX))
  const y = Math.min(1, Math.max(0, rawY))
  return { x, y }
}

export default function VideoAnnotationLayer({
  videoRef,
  annotations,
  currentTime,
  isPlaying,
  onPause,
  onTogglePlay,
  onAddAnnotation,
  onDeleteAnnotation,
  onUpdateAnnotation,
  currentVideoFeedbackKey = null,
  hideInlineEmojiForCurrentVideo = false,
  allowEditOnCurrentVideoOnly = false,
}) {
  const [popover, setPopover] = useState(null)
  const [, setSelectedEmoji] = useState('')
  const [commentText, setCommentText] = useState('')
  const [videoRect, setVideoRect] = useState(null)
  const [dragPreview, setDragPreview] = useState(null)
  const [emojiPage, setEmojiPage] = useState(0)
  const commentInputRef = useRef(null)
  const overlayRef = useRef(null)
  const singleTapTimerRef = useRef(null)
  const lastTapRef = useRef({
    atMs: 0,
    clientX: 0,
    clientY: 0,
    pointerType: '',
  })
  const dragStateRef = useRef({
    isDragging: false,
    pointerId: null,
    annId: null,
  })
  const pressStateRef = useRef({
    isPressing: false,
    pointerId: null,
    pointerType: '',
    startX: 0,
    startY: 0,
    wasPlayingAtStart: false,
    movedBeyondCancelThreshold: false,
    pressTimestamp: 0,
  })

  const updateRect = useCallback(() => {
    if (videoRef?.current) {
      setVideoRect(getVideoContentRect(videoRef.current))
    }
  }, [videoRef])

  useEffect(() => {
    updateRect()
    window.addEventListener('resize', updateRect)
    const video = videoRef?.current
    if (video) {
      video.addEventListener('loadedmetadata', updateRect)
      video.addEventListener('loadeddata', updateRect)
    }
    return () => {
      window.removeEventListener('resize', updateRect)
      if (video) {
        video.removeEventListener('loadedmetadata', updateRect)
        video.removeEventListener('loadeddata', updateRect)
      }
    }
  }, [updateRect, videoRef])

  useEffect(() => { updateRect() }, [updateRect])

  // Attach native touch listeners with { passive: false } to call preventDefault()
  // AND stopPropagation().  Two purposes:
  //  1. preventDefault  — stops the browser from hijacking the second tap for
  //     zoom/gesture recognition (which fires pointercancel instead of pointerup).
  //  2. stopPropagation — stops the parent live-screen's onTouchStart from
  //     firing revealLiveUi(), which would show the top/bottom bars (z-index 6)
  //     and intercept subsequent taps in those areas.
  //
  // Dependency on `!!videoRect` ensures the effect re-runs once the overlay
  // element is actually in the DOM (the component returns null when videoRect
  // is not yet available).
  const hasVideoRect = !!videoRect
  useEffect(() => {
    const el = overlayRef.current
    if (!el) return
    const handler = (e) => { e.preventDefault(); e.stopPropagation() }
    el.addEventListener('touchstart', handler, { passive: false })
    el.addEventListener('touchend', handler, { passive: false })
    el.addEventListener('touchmove', handler, { passive: false })
    return () => {
      el.removeEventListener('touchstart', handler)
      el.removeEventListener('touchend', handler)
      el.removeEventListener('touchmove', handler)
    }
  }, [hasVideoRect])

  const openPopoverAt = useCallback((clientX, clientY, timestamp) => {
    if (!videoRect) return
    const coords = screenToVideoCoords(clientX, clientY, videoRect)
    if (!coords) return
    setPopover({
      x: coords.x,
      y: coords.y,
      timestamp,
      screenX: coords.x * videoRect.width,
      screenY: coords.y * videoRect.height,
    })
    setSelectedEmoji('')
    setCommentText('')
    setEmojiPage(0)
    setTimeout(() => commentInputRef.current?.focus(), 100)
  }, [videoRect])

  const emojiPages = useMemo(() => {
    const pages = []
    for (let i = 0; i < EMOJI_PALETTE.length; i += EMOJI_PAGE_SIZE) {
      pages.push(EMOJI_PALETTE.slice(i, i + EMOJI_PAGE_SIZE))
    }
    return pages
  }, [])

  const maxEmojiPage = Math.max(0, emojiPages.length - 1)
  const visibleEmojiPage = emojiPages[emojiPage] || emojiPages[0] || []

  const clearSingleTapTimer = useCallback(() => {
    if (singleTapTimerRef.current) {
      clearTimeout(singleTapTimerRef.current)
      singleTapTimerRef.current = null
    }
  }, [])

  const handleOverlayPointerDown = useCallback((e) => {
    if (!videoRect || popover) return
    if (e.button !== undefined && e.button !== 0) return

    e.stopPropagation()
    const coords = screenToVideoCoords(e.clientX, e.clientY, videoRect)
    if (!coords) return

    const pointerType = e.pointerType || ''
    if (pointerType === 'touch') {
      e.preventDefault()
    }

    const wasPlayingAtStart = Boolean(isPlaying)
    pressStateRef.current = {
      isPressing: true,
      pointerId: e.pointerId,
      pointerType,
      startX: e.clientX,
      startY: e.clientY,
      wasPlayingAtStart,
      movedBeyondCancelThreshold: false,
      pressTimestamp: currentTime,
    }

    if (wasPlayingAtStart && onPause) {
      onPause()
    }
  }, [videoRect, popover, isPlaying, onPause, currentTime])

  const handleOverlayPointerMove = useCallback((e) => {
    const state = pressStateRef.current
    if (!state.isPressing) return
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return

    // Stop propagation while pressing so the parent's onPointerMove
    // doesn't trigger revealLiveUi mid-tap.
    e.stopPropagation()

    const dx = e.clientX - state.startX
    const dy = e.clientY - state.startY
    if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
      state.movedBeyondCancelThreshold = true
    }
  }, [])

  const handleOverlayPointerUp = useCallback((e) => {
    const state = pressStateRef.current
    if (!state.isPressing) return
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return

    const pointerType = state.pointerType || e.pointerType || ''
    const isTouchPointer = pointerType === 'touch'
    const doubleTapMs = isTouchPointer ? DOUBLE_TAP_MS_TOUCH : DOUBLE_TAP_MS
    const doubleTapDistance = isTouchPointer ? DOUBLE_TAP_DISTANCE_TOUCH_PX : DOUBLE_TAP_DISTANCE_PX

    e.stopPropagation()
    if (isTouchPointer) {
      e.preventDefault()
    }
    if (!state.movedBeyondCancelThreshold) {
      const nowMs = Date.now()
      const lastTap = lastTapRef.current
      const isDoubleTap =
        lastTap.atMs > 0
        && lastTap.pointerType === pointerType
        && (nowMs - lastTap.atMs) <= doubleTapMs
        && Math.hypot(e.clientX - lastTap.clientX, e.clientY - lastTap.clientY) <= doubleTapDistance

      if (isDoubleTap) {
        clearSingleTapTimer()
        lastTapRef.current = { atMs: 0, clientX: 0, clientY: 0, pointerType: '' }
        openPopoverAt(e.clientX, e.clientY, state.pressTimestamp)
      } else {
        lastTapRef.current = {
          atMs: nowMs,
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType,
        }
        // Only schedule single-tap play/pause for mouse/pen — NOT touch.
        // On touch, the play timer races against the second tap of a double-tap:
        // if the user is slightly slower than doubleTapMs the timer fires first,
        // toggling playback and breaking double-tap detection on every retry.
        // Touch users have the play button in the bottom bar instead.
        if (!isTouchPointer && !state.wasPlayingAtStart && onTogglePlay) {
          clearSingleTapTimer()
          singleTapTimerRef.current = setTimeout(() => {
            onTogglePlay()
            singleTapTimerRef.current = null
          }, doubleTapMs)
        }
      }
    }

    pressStateRef.current = {
      isPressing: false,
      pointerId: null,
      pointerType: '',
      startX: 0,
      startY: 0,
      wasPlayingAtStart: false,
      movedBeyondCancelThreshold: false,
      pressTimestamp: 0,
    }
  }, [clearSingleTapTimer, onTogglePlay, openPopoverAt])

  const handleOverlayPointerCancel = useCallback((e) => {
    const state = pressStateRef.current
    if (state.pointerId !== null && e.pointerId !== state.pointerId) return

    // Even on cancel, record this as a tap for double-tap detection if the
    // finger didn't move.  Some mobile browsers fire pointercancel instead of
    // pointerup for the first tap of a double-tap gesture; without this the
    // second tap never recognises the pair.
    if (!state.movedBeyondCancelThreshold && state.isPressing) {
      const pointerType = state.pointerType || e.pointerType || ''
      const isTouchPointer = pointerType === 'touch'
      const doubleTapMs = isTouchPointer ? DOUBLE_TAP_MS_TOUCH : DOUBLE_TAP_MS
      const doubleTapDistance = isTouchPointer ? DOUBLE_TAP_DISTANCE_TOUCH_PX : DOUBLE_TAP_DISTANCE_PX

      const nowMs = Date.now()
      const lastTap = lastTapRef.current
      const isDoubleTap =
        lastTap.atMs > 0
        && lastTap.pointerType === pointerType
        && (nowMs - lastTap.atMs) <= doubleTapMs
        && Math.hypot(e.clientX - lastTap.clientX, e.clientY - lastTap.clientY) <= doubleTapDistance

      if (isDoubleTap) {
        clearSingleTapTimer()
        lastTapRef.current = { atMs: 0, clientX: 0, clientY: 0, pointerType: '' }
        openPopoverAt(e.clientX, e.clientY, state.pressTimestamp)
      } else {
        lastTapRef.current = {
          atMs: nowMs,
          clientX: e.clientX,
          clientY: e.clientY,
          pointerType,
        }
      }
    }

    pressStateRef.current = {
      isPressing: false,
      pointerId: null,
      pointerType: '',
      startX: 0,
      startY: 0,
      wasPlayingAtStart: false,
      movedBeyondCancelThreshold: false,
      pressTimestamp: 0,
    }
  }, [clearSingleTapTimer, openPopoverAt])

  useEffect(() => () => {
    clearSingleTapTimer()
  }, [clearSingleTapTimer])

  const isPausedIdle = !isPlaying && !popover

  const finishDrag = useCallback((e, shouldCommit = true) => {
    const drag = dragStateRef.current
    if (!drag.isDragging) return
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return

    e.stopPropagation()
    e.preventDefault()

    const coords = screenToClampedVideoCoords(e.clientX, e.clientY, videoRect)
    if (coords) {
      setDragPreview({ annId: drag.annId, x: coords.x, y: coords.y })
      if (shouldCommit && onUpdateAnnotation) {
        onUpdateAnnotation(drag.annId, { x: coords.x, y: coords.y })
      }
    }

    if (e.currentTarget?.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    dragStateRef.current = {
      isDragging: false,
      pointerId: null,
      annId: null,
    }
    setDragPreview(null)
  }, [videoRect, onUpdateAnnotation])

  const handleAnnotationPointerDown = useCallback((e, annId) => {
    if (!isPausedIdle || popover || !videoRect || !onUpdateAnnotation) return
    if (e.button !== undefined && e.button !== 0) return
    if (e.target.closest('button')) return

    const coords = screenToClampedVideoCoords(e.clientX, e.clientY, videoRect)
    if (!coords) return

    e.stopPropagation()
    e.preventDefault()
    e.currentTarget?.setPointerCapture?.(e.pointerId)

    dragStateRef.current = {
      isDragging: true,
      pointerId: e.pointerId,
      annId,
    }
    setDragPreview({ annId, x: coords.x, y: coords.y })
  }, [isPausedIdle, popover, videoRect, onUpdateAnnotation])

  const handleAnnotationPointerMove = useCallback((e) => {
    const drag = dragStateRef.current
    if (!drag.isDragging) return
    if (drag.pointerId !== null && e.pointerId !== drag.pointerId) return

    const coords = screenToClampedVideoCoords(e.clientX, e.clientY, videoRect)
    if (!coords) return

    e.stopPropagation()
    e.preventDefault()
    setDragPreview({ annId: drag.annId, x: coords.x, y: coords.y })
  }, [videoRect])

  const handleAnnotationPointerUp = useCallback((e) => {
    finishDrag(e, true)
  }, [finishDrag])

  const handleAnnotationPointerCancel = useCallback((e) => {
    finishDrag(e, false)
  }, [finishDrag])

  const handleSave = useCallback(() => {
    if (!popover) return
    if (!commentText.trim()) return
    onAddAnnotation({
      id: generateId('ann'),
      timestamp: popover.timestamp,
      x: popover.x,
      y: popover.y,
      emoji: '',
      text: commentText.trim(),
      createdAt: new Date().toISOString(),
    })
    setPopover(null)
    setSelectedEmoji('')
    setCommentText('')
  }, [popover, commentText, onAddAnnotation])

  const handleCancel = useCallback(() => {
    setPopover(null)
    setSelectedEmoji('')
    setCommentText('')
  }, [])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    else if (e.key === 'Escape') { handleCancel() }
  }, [handleSave, handleCancel])

  if (!videoRect) return null

  // Show annotations starting at the placed timestamp, visible for the window duration after
  const visibleAnnotations = (annotations || []).filter((ann) => {
    const annVideoKey = typeof ann?.sourceVideoKey === 'string' ? ann.sourceVideoKey : null
    const isSameVideo = !!currentVideoFeedbackKey && !!annVideoKey && annVideoKey === currentVideoFeedbackKey
    const hasEmoji = Boolean(ann?.emoji)
    const hasText = Boolean(ann?.text)

    if (hideInlineEmojiForCurrentVideo && isSameVideo && hasEmoji && !hasText) {
      return false
    }

    const elapsed = currentTime - ann.timestamp
    return elapsed >= 0 && elapsed <= ANNOTATION_VISIBLE_WINDOW
  })

  // When paused (and no popover open), allow delete/drag on currently visible annotations

  return (
    <>
      {/* Tap overlay — always present */}
      <div
        ref={overlayRef}
        className={`${styles['annotation-overlay']}${isPlaying ? '' : ' ' + styles['annotation-overlay-feedback']}`}
        style={{
          left: videoRect.relLeft,
          top: videoRect.relTop,
          width: videoRect.width,
          height: videoRect.height,
        }}
        onPointerDown={handleOverlayPointerDown}
        onPointerMove={handleOverlayPointerMove}
        onPointerUp={handleOverlayPointerUp}
        onPointerCancel={handleOverlayPointerCancel}
      />

      {/* Annotations */}
      {visibleAnnotations.map((ann) => {
        const annVideoKey = typeof ann?.sourceVideoKey === 'string' ? ann.sourceVideoKey : null
        const isEditableOnCurrentVideo = !allowEditOnCurrentVideoOnly
          || !currentVideoFeedbackKey
          || !annVideoKey
          || annVideoKey === currentVideoFeedbackKey

        const timeDiff = Math.abs(currentTime - ann.timestamp)
        const isInTimeWindow = timeDiff <= ANNOTATION_VISIBLE_WINDOW
        const isVisible = isInTimeWindow
        const canDelete = isPausedIdle && isEditableOnCurrentVideo
        const isDraggable = canDelete && !!onUpdateAnnotation
        const { color, angle } = getAnnStyle(ann.id)

        const isDraggingThis = dragPreview?.annId === ann.id
        const annX = isDraggingThis ? dragPreview.x : ann.x
        const annY = isDraggingThis ? dragPreview.y : ann.y
        const posLeft = videoRect.relLeft + annX * videoRect.width
        const posTop = videoRect.relTop + annY * videoRect.height

        const hasEmoji = !!ann.emoji
        const hasText = !!ann.text

        // Emoji-only: floating reaction
        if (hasEmoji && !hasText) {
          const cls = [
            styles['reaction'],
            isVisible ? (isPausedIdle ? styles['reaction-paused'] : styles['reaction-visible']) : '',
            isDraggable ? styles['annotation-draggable'] : '',
            isDraggingThis ? styles['annotation-dragging'] : '',
          ].filter(Boolean).join(' ')

          const inner = <span className={styles['reaction-emoji']}>{ann.emoji}</span>

          return (
            <div
              key={ann.id}
              className={cls}
              style={{ left: posLeft, top: posTop }}
              onPointerDown={(e) => handleAnnotationPointerDown(e, ann.id)}
              onPointerMove={handleAnnotationPointerMove}
              onPointerUp={handleAnnotationPointerUp}
              onPointerCancel={handleAnnotationPointerCancel}
            >
              {canDelete ? (
                <div className={styles['delete-wrap']}>
                  {inner}
                  <button className={styles['delete-btn']} onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id) }}>✕</button>
                </div>
              ) : inner}
            </div>
          )
        }

        // Text-only: coloured pill at a slight angle
        if (hasText && !hasEmoji) {
          const cls = [
            styles['comment-bubble'],
            isVisible ? (isPausedIdle ? styles['comment-bubble-paused'] : styles['comment-bubble-visible']) : '',
            isDraggable ? styles['annotation-draggable'] : '',
            isDraggingThis ? styles['annotation-dragging'] : '',
          ].filter(Boolean).join(' ')

          const inner = (
            <span className={styles['comment-pill']} style={{ background: color, transform: `rotate(${angle}deg)` }}>
              {ann.text}
            </span>
          )

          return (
            <div
              key={ann.id}
              className={cls}
              style={{ left: posLeft, top: posTop }}
              onPointerDown={(e) => handleAnnotationPointerDown(e, ann.id)}
              onPointerMove={handleAnnotationPointerMove}
              onPointerUp={handleAnnotationPointerUp}
              onPointerCancel={handleAnnotationPointerCancel}
            >
              {canDelete ? (
                <div className={styles['delete-wrap']}>
                  {inner}
                  <button className={styles['delete-btn']} onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id) }}>✕</button>
                </div>
              ) : inner}
            </div>
          )
        }

        // Combo: emoji + text pill
        const cls = [
          styles['combo'],
          isVisible ? (isPausedIdle ? styles['combo-paused'] : styles['combo-visible']) : '',
          isDraggable ? styles['annotation-draggable'] : '',
          isDraggingThis ? styles['annotation-dragging'] : '',
        ].filter(Boolean).join(' ')

        const inner = (
          <>
            <span className={styles['reaction-emoji']}>{ann.emoji}</span>
            <span className={styles['comment-pill']} style={{ background: color, transform: `rotate(${angle}deg)` }}>
              {ann.text}
            </span>
          </>
        )

        return (
          <div
            key={ann.id}
            className={cls}
            style={{ left: posLeft, top: posTop }}
            onPointerDown={(e) => handleAnnotationPointerDown(e, ann.id)}
            onPointerMove={handleAnnotationPointerMove}
            onPointerUp={handleAnnotationPointerUp}
            onPointerCancel={handleAnnotationPointerCancel}
          >
            {canDelete ? (
              <div className={styles['delete-wrap']}>
                {inner}
                <button className={styles['delete-btn']} onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id) }}>✕</button>
              </div>
            ) : inner}
          </div>
        )
      })}

      {/* Input popover */}
      {popover && (
        <>
          <div
            className={styles['popover-backdrop']}
            onClick={handleCancel}
          />
          <div
            className={styles['popover']}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles['popover-header']}>
              <span className={styles['popover-title']}>Add Feedback</span>
              <span className={styles['popover-time']}>{formatTimestamp(popover.timestamp)}</span>
            </div>

            <div className={styles['emoji-carousel']}>
              <button
                type="button"
                className={styles['emoji-carousel-arrow']}
                onClick={() => setEmojiPage((prev) => Math.max(0, prev - 1))}
                disabled={emojiPage <= 0}
                aria-label="Previous emoji page"
              >
                ←
              </button>

              <div>
                <div className={styles['emoji-grid']}>
                  {visibleEmojiPage.map((emoji) => (
                    <button
                      key={emoji}
                      className={styles['emoji-btn']}
                      onClick={() => {
                        // Instant save: tapping an emoji immediately adds the annotation
                        if (popover) {
                          onAddAnnotation({
                            id: generateId('ann'),
                            timestamp: popover.timestamp,
                            x: popover.x,
                            y: popover.y,
                            emoji,
                            text: '',
                            createdAt: new Date().toISOString(),
                          })
                          setPopover(null)
                          setSelectedEmoji('')
                          setCommentText('')
                        }
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                {emojiPages.length > 1 && (
                  <div className={styles['emoji-carousel-meta']}>
                    {emojiPage + 1} / {emojiPages.length}
                  </div>
                )}
              </div>

              <button
                type="button"
                className={styles['emoji-carousel-arrow']}
                onClick={() => setEmojiPage((prev) => Math.min(maxEmojiPage, prev + 1))}
                disabled={emojiPage >= maxEmojiPage}
                aria-label="Next emoji page"
              >
                →
              </button>
            </div>

            <input
              ref={commentInputRef}
              type="text"
              className={styles['comment-input']}
              placeholder="Add a comment... e.g. Stretch your arms!"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={handleKeyDown}
              maxLength={120}
            />

            <div className={styles['popover-actions']}>
              <button className={styles['popover-cancel-btn']} onClick={handleCancel}>
                Cancel
              </button>
              <button
                className={styles['popover-save-btn']}
                onClick={handleSave}
                disabled={!commentText.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}
