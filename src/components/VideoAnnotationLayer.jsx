import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { generateId } from '../utils/helpers'
import { formatTimestamp } from '../utils/audioSync'
import styles from './VideoAnnotationLayer.module.css'

const EMOJI_PALETTE = ['💯', '🔥', '⭐', '💪', '👏', '❤️', '😍', '🎯', '✨', '🙌', '⚡', '👀']
const ANNOTATION_VISIBLE_WINDOW = 2 // seconds before/after to show

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

export default function VideoAnnotationLayer({
  videoRef,
  annotations,
  currentTime,
  isPlaying,
  onPause,
  onTogglePlay,
  onAddAnnotation,
  onDeleteAnnotation,
}) {
  const [popover, setPopover] = useState(null)
  const [selectedEmoji, setSelectedEmoji] = useState('')
  const [commentText, setCommentText] = useState('')
  const [videoRect, setVideoRect] = useState(null)
  const commentInputRef = useRef(null)
  const overlayRef = useRef(null)

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

  const handleOverlayClick = useCallback((e) => {
    if (!videoRect) return
    e.stopPropagation()
    if (popover) return

    if (isPlaying) {
      const coords = screenToVideoCoords(e.clientX, e.clientY, videoRect)
      if (!coords) return
      if (onPause) onPause()
      setPopover({
        x: coords.x,
        y: coords.y,
        timestamp: currentTime,
        screenX: coords.x * videoRect.width,
        screenY: coords.y * videoRect.height,
      })
      setSelectedEmoji('')
      setCommentText('')
      setTimeout(() => commentInputRef.current?.focus(), 100)
    } else {
      if (onTogglePlay) onTogglePlay()
    }
  }, [videoRect, isPlaying, onPause, onTogglePlay, currentTime, popover])

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

  // Determine which annotations to show (same timing behavior for play and pause)
  const visibleAnnotations = (annotations || []).filter((ann) => {
    const diff = Math.abs(currentTime - ann.timestamp)
    return diff <= ANNOTATION_VISIBLE_WINDOW
  })

  // When paused (and no popover open), allow delete on currently visible annotations
  const isPausedIdle = !isPlaying && !popover

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
        onClick={handleOverlayClick}
      />

      {/* Annotations */}
      {visibleAnnotations.map((ann) => {
        const timeDiff = Math.abs(currentTime - ann.timestamp)
        const isInTimeWindow = timeDiff <= ANNOTATION_VISIBLE_WINDOW
        const isVisible = isInTimeWindow
        const canDelete = isPausedIdle
        const { color, angle } = getAnnStyle(ann.id)

        const posLeft = videoRect.relLeft + ann.x * videoRect.width
        const posTop = videoRect.relTop + ann.y * videoRect.height

        const hasEmoji = !!ann.emoji
        const hasText = !!ann.text

        // Emoji-only: floating reaction
        if (hasEmoji && !hasText) {
          const cls = [
            styles['reaction'],
            isVisible ? (isPausedIdle ? styles['reaction-paused'] : styles['reaction-visible']) : '',
          ].filter(Boolean).join(' ')

          const inner = <span className={styles['reaction-emoji']}>{ann.emoji}</span>

          return (
            <div key={ann.id} className={cls} style={{ left: posLeft, top: posTop }}>
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
          ].filter(Boolean).join(' ')

          const inner = (
            <span className={styles['comment-pill']} style={{ background: color, transform: `rotate(${angle}deg)` }}>
              {ann.text}
            </span>
          )

          return (
            <div key={ann.id} className={cls} style={{ left: posLeft, top: posTop }}>
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
          <div key={ann.id} className={cls} style={{ left: posLeft, top: posTop }}>
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
            style={{
              left: videoRect.relLeft + popover.screenX,
              top: Math.max(videoRect.relTop + 120, videoRect.relTop + popover.screenY - 8),
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles['popover-header']}>
              <span className={styles['popover-title']}>Add Feedback</span>
              <span className={styles['popover-time']}>{formatTimestamp(popover.timestamp)}</span>
            </div>

            <div className={styles['emoji-grid']}>
              {EMOJI_PALETTE.map((emoji) => (
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
