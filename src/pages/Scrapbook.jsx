import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getEventTypeIcon, getEventTypeLabel } from '../data/aedEvents'
import { formatDate, formatDateWithWeekday } from '../utils/helpers'
import { compressImage, compressVideo } from '../utils/mediaCompress'
import { notify } from '../utils/notify'
import TextInputDialog from '../components/TextInputDialog'
import styles from './Scrapbook.module.css'

export default function Scrapbook() {
  const { showId, entryId } = useParams()
  const { events, routines, addScrapbookEntry, addScrapbookReaction, removeScrapbookEntry, addEventEntry, editEventEntry, removeEventEntry, isAdmin, isKidMode } = useApp()
  const navigate = useNavigate()
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const carouselRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // { stage, progress }
  const [expandedEntry, setExpandedEntry] = useState(null) // entry id for expanded result panel
  const [lightboxIndex, setLightboxIndex] = useState(null) // index into mediaEntries
  const [selectedMediaEntryId, setSelectedMediaEntryId] = useState('')
  const [showAddEntry, setShowAddEntry] = useState(false)
  const [entryDateDrafts, setEntryDateDrafts] = useState({})
  const [entryNoteDrafts, setEntryNoteDrafts] = useState({})
  const [textDialog, setTextDialog] = useState({
    open: false,
    title: '',
    placeholder: '',
    value: '',
    type: 'note',
    author: 'dancer',
  })
  const noteSaveTimersRef = useRef({})
  const noteSaveSeqRef = useRef({})

  const clearNoteSaveTimer = useCallback((targetEntryId) => {
    const timer = noteSaveTimersRef.current[targetEntryId]
    if (timer) {
      window.clearTimeout(timer)
      delete noteSaveTimersRef.current[targetEntryId]
    }
  }, [])

  const persistEntryNote = useCallback(async (targetEntryId, nextNote, seq) => {
    try {
      await editEventEntry(showId, targetEntryId, { notes: nextNote })
      if (noteSaveSeqRef.current[targetEntryId] === seq) {
        setEntryNoteDrafts((prev) => {
          if (prev[targetEntryId] !== nextNote) return prev
          const rest = { ...prev }
          delete rest[targetEntryId]
          return rest
        })
      }
    } catch (error) {
      console.warn('Save entry note:', error)
    }
  }, [editEventEntry, showId])

  const scheduleEntryNoteSave = useCallback((targetEntryId, nextNote, options = {}) => {
    const { immediate = false } = options
    const nextSeq = (noteSaveSeqRef.current[targetEntryId] || 0) + 1
    noteSaveSeqRef.current[targetEntryId] = nextSeq
    clearNoteSaveTimer(targetEntryId)
    if (immediate) {
      persistEntryNote(targetEntryId, nextNote, nextSeq)
      return
    }
    noteSaveTimersRef.current[targetEntryId] = window.setTimeout(() => {
      delete noteSaveTimersRef.current[targetEntryId]
      persistEntryNote(targetEntryId, nextNote, nextSeq)
    }, 450)
  }, [clearNoteSaveTimer, persistEntryNote])

  useEffect(() => () => {
    Object.values(noteSaveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    noteSaveTimersRef.current = {}
  }, [])

  useEffect(() => {
    setEntryNoteDrafts({})
    noteSaveSeqRef.current = {}
    Object.values(noteSaveTimersRef.current).forEach((timer) => window.clearTimeout(timer))
    noteSaveTimersRef.current = {}
  }, [showId])

  if (isKidMode) {
    return (
      <div className={styles.scrapbook}>
        <div className={styles.empty}>
          <h2>Scrapbook is only available in parent view</h2>
          <button onClick={() => navigate('/')}>← Back Home</button>
        </div>
      </div>
    )
  }

  const show = events.find(s => s.id === showId)

  if (!show) {
    return (
      <div className={styles.scrapbook}>
        <div className={styles.empty}>
          <h2>Show not found</h2>
          <button onClick={() => navigate('/')}>← Back Home</button>
        </div>
      </div>
    )
  }

  const entries = show.scrapbookEntries || []
  const eventEntries = show.entries || []
  const isEntryView = Boolean(entryId)
  const selectedEntryFromRoute = entryId
    ? eventEntries.find((entry) => entry.id === entryId)
    : null

  if (isEntryView && !selectedEntryFromRoute) {
    return (
      <div className={styles.scrapbook}>
        <div className={styles.empty}>
          <h2>Entry not found</h2>
          <button onClick={() => navigate(`/show/${showId}`)}>← Back to Event</button>
        </div>
      </div>
    )
  }

  const effectiveMediaEntryId = (
    isEntryView
      ? (selectedEntryFromRoute?.id || '')
      : (selectedMediaEntryId && eventEntries.some((entry) => entry.id === selectedMediaEntryId)
          ? selectedMediaEntryId
          : (eventEntries[0]?.id || ''))
  )
  const selectedMediaEntry = eventEntries.find((entry) => entry.id === effectiveMediaEntryId) || null
  const selectedMediaRoutine = routines.find((routine) => routine.id === selectedMediaEntry?.routineId) || null
  const visibleEventEntries = isEntryView && selectedEntryFromRoute
    ? [selectedEntryFromRoute]
    : eventEntries

  const formatOrdinalPlace = (value) => {
    const n = Number(value)
    if (!Number.isFinite(n) || n <= 0) return ''
    const mod100 = n % 100
    if (mod100 >= 11 && mod100 <= 13) return `${n}th`
    const mod10 = n % 10
    if (mod10 === 1) return `${n}st`
    if (mod10 === 2) return `${n}nd`
    if (mod10 === 3) return `${n}rd`
    return `${n}th`
  }

  const openTextDialog = (config) => {
    setTextDialog({
      open: true,
      title: config?.title || 'Add note',
      placeholder: config?.placeholder || '',
      value: config?.value || '',
      type: config?.type || 'note',
      author: config?.author || 'dancer',
    })
  }

  const handleAddNote = () => {
    openTextDialog({
      title: 'Add note',
      placeholder: 'What do you want to remember about this show?',
      type: 'note',
      author: 'dancer',
    })
  }

  const handleTextDialogSave = (value) => {
    const content = String(value || '').trim()
    if (!content) {
      setTextDialog((prev) => ({ ...prev, open: false }))
      return
    }
    addScrapbookEntry(showId, {
      type: textDialog.type,
      content,
      author: textDialog.author,
      eventEntryId: isEntryView ? effectiveMediaEntryId : null,
      date: new Date().toISOString().split('T')[0],
      emojiReactions: [],
    })
    setTextDialog((prev) => ({ ...prev, open: false }))
  }

  const handleReaction = (entryId, emoji) => {
    addScrapbookReaction(showId, entryId, emoji)
  }

  const reactionEmojis = ['🔥', '⭐', '💜', '👏', '🎉']

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (!effectiveMediaEntryId) {
      notify('Add a routine entry first so photos can be attached to it.')
      e.target.value = ''
      return
    }
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ stage: `Compressing photo ${i + 1}/${files.length}`, progress: Math.round((i / files.length) * 100) })
      try {
        const compressed = await compressImage(files[i])
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target.result)
          reader.readAsDataURL(compressed)
        })
        addScrapbookEntry(showId, {
          type: 'photo',
          eventEntryId: effectiveMediaEntryId,
          content: dataUrl,
          author: 'dancer',
          date: new Date().toISOString().split('T')[0],
          emojiReactions: [],
        })
      } catch (err) {
        console.error(`Photo ${i + 1} compression failed:`, err)
      }
    }
    setUploading(false)
    setUploadProgress(null)
    e.target.value = ''
  }

  const handleVideoUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    if (!effectiveMediaEntryId) {
      notify('Add a routine entry first so videos can be attached to it.')
      e.target.value = ''
      return
    }
    setUploading(true)
    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ stage: `Processing video ${i + 1}/${files.length}`, progress: Math.round((i / files.length) * 100) })
      try {
        const compressed = await compressVideo(files[i], {
          onProgress: (info) => setUploadProgress({ ...info, stage: `Video ${i + 1}/${files.length}: ${info.stage || 'compressing'}` }),
        })
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (ev) => resolve(ev.target.result)
          reader.readAsDataURL(compressed)
        })
        addScrapbookEntry(showId, {
          type: 'video',
          eventEntryId: effectiveMediaEntryId,
          content: dataUrl,
          author: 'dancer',
          date: new Date().toISOString().split('T')[0],
          emojiReactions: [],
        })
      } catch (err) {
        console.error(`Video ${i + 1} compression failed:`, err)
      }
    }
    setUploading(false)
    setUploadProgress(null)
    e.target.value = ''
  }

  // Get all media scrapbook entries for the carousel
  const mediaEntries = entries.filter((e) => (
    (e.type === 'photo' || e.type === 'video')
    && effectiveMediaEntryId
    && e.eventEntryId === effectiveMediaEntryId
  ))

  // Available competitions user can select as "qualified through to"
  const otherEvents = (events || []).filter(
    (s) => s.id !== showId && (s.eventType || 'show') !== 'show'
  )

  return (
    <div className={styles.scrapbook}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>←</button>
        <div>
          <h1 className={styles.showName}>
            {getEventTypeIcon(show.eventType)} {show.name}
          </h1>
          <p className={styles.showMeta}>
            📅 {formatDateWithWeekday(show.startDate || show.date)}
            {show.endDate && show.endDate !== (show.startDate || show.date) && (
              <> – {formatDate(show.endDate)}</>
            )}
            {show.venue && ` · 📍 ${show.venue}`}
          </p>
          {show.eventType && show.eventType !== 'show' && (
            <span className={styles.eventTypePill}>{getEventTypeLabel(show.eventType)}</span>
          )}
        </div>
      </div>

      {/* Event entries (routines entered) */}
      <div className={styles.entriesSection}>
        <div className={styles.entriesSectionHeader}>
          <h3 className={styles.entriesSectionTitle}>{isEntryView ? 'Entry' : 'Entries'}</h3>
          {!isEntryView && (
            <button
              className={styles.addEntryBtn}
              onClick={() => setShowAddEntry(!showAddEntry)}
            >
              {showAddEntry ? '✕' : '+ Add Entry'}
            </button>
          )}
        </div>

        {/* Add entry picker */}
        {!isEntryView && showAddEntry && (
          <div className={styles.addEntryPicker}>
            {routines
              .filter(r => !(show.entries || []).some(e => e.routineId === r.id))
              .map(r => (
                <button
                  key={r.id}
                  className={styles.addEntryOption}
                  onClick={async () => {
                    const alreadyExists = (show.entries || []).some((entry) => entry.routineId === r.id)
                    if (alreadyExists) {
                      notify('This routine is already entered for this festival.')
                      return
                    }

                    try {
                      await addEventEntry(showId, {
                        routineId: r.id,
                        scheduledDate: '',
                        scheduledTime: '',
                        place: null,
                        qualified: false,
                        qualifiedForEventId: '',
                        notes: '',
                      })
                      setShowAddEntry(false)
                    } catch (err) {
                      notify(err?.message || 'Could not add event entry.')
                    }
                  }}
                >
                  🎵 {r.name}
                </button>
              ))}
            {routines.filter(r => !(show.entries || []).some(e => e.routineId === r.id)).length === 0 && (
              <p className={styles.addEntryEmpty}>All routines already added</p>
            )}
          </div>
        )}

      {visibleEventEntries.length > 0 && (
        <>
          <div className={styles.eventEntriesList}>
            {visibleEventEntries.map((entry) => {
              const r = routines.find((rt) => rt.id === entry.routineId)
              const hasDate = Boolean(entry.scheduledDate)
              const hasTime = Boolean(entry.scheduledTime)
              const dateLabel = hasDate
                ? formatDate(entry.scheduledDate)
                : ''
              const qualifiedEvent = entry.qualifiedForEventId
                ? (events || []).find((s) => s.id === entry.qualifiedForEventId)
                : null
              const isExpanded = isEntryView || expandedEntry === entry.id

              return (
                <div key={entry.id} className={styles.eventEntryBlock}>
                  <div
                    className={styles.eventEntryRow}
                    onClick={() => {
                      if (isEntryView) return
                      setExpandedEntry(isExpanded ? null : entry.id)
                    }}
                    style={{ cursor: isEntryView ? 'default' : 'pointer' }}
                  >
                    <span className={styles.eventEntryName}>🎵 {r?.name || 'Unknown routine'}</span>
                    {(hasDate || hasTime) && (
                      <span className={styles.eventEntryTime}>
                        ⏰ {hasDate ? dateLabel : ''}{hasDate && hasTime ? ' · ' : ''}{hasTime ? entry.scheduledTime : ''}
                      </span>
                    )}
                    {entry.place != null && entry.place > 0 && (
                      <span className={styles.eventEntryPlace}>
                        {entry.place <= 3
                          ? (entry.place === 1 ? '🥇' : entry.place === 2 ? '🥈' : '🥉')
                          : formatOrdinalPlace(entry.place)
                        }
                      </span>
                    )}
                    {entry.qualified && (
                      <span className={styles.qualifiedBadge}>✓ AED Qualified</span>
                    )}
                    {qualifiedEvent && (
                      <span className={styles.qualifiedThroughLabel}>
                        → {getEventTypeIcon(qualifiedEvent.eventType)} {qualifiedEvent.name}
                      </span>
                    )}
                    <span className={styles.entryExpandArrow}>{isExpanded ? '▾' : '▸'}</span>
                  </div>

                  {/* Expanded result panel */}
                  {isExpanded && (
                    <div className={styles.entryResultPanel}>
                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Routine</label>
                        <select
                          className={styles.qualifiedForSelect}
                          value={entry.routineId || ''}
                          onChange={(e) => {
                            const nextRoutineId = e.target.value || null
                            if (!nextRoutineId) {
                              editEventEntry(showId, entry.id, { routineId: null })
                              return
                            }
                            const duplicate = (show.entries || []).some(
                              (other) => other.id !== entry.id && other.routineId === nextRoutineId
                            )
                            if (duplicate) {
                              notify('That routine is already entered for this festival.')
                              return
                            }
                            editEventEntry(showId, entry.id, { routineId: nextRoutineId })
                          }}
                        >
                          <option value="">— Select routine —</option>
                          {routines.map((routineOption) => (
                            <option key={routineOption.id} value={routineOption.id}>
                              🎵 {routineOption.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Scheduled</label>
                        <div className={styles.scheduleInputs}>
                          <input
                            type="date"
                            className={styles.qualifiedForSelect}
                            value={entryDateDrafts[entry.id] ?? (entry.scheduledDate || '')}
                            onChange={(e) => {
                              const nextValue = e.target.value || ''
                              setEntryDateDrafts((prev) => ({
                                ...prev,
                                [entry.id]: nextValue,
                              }))
                            }}
                            onBlur={(e) => {
                              const nextValue = e.target.value || ''
                              const currentValue = entry.scheduledDate || ''
                              if (nextValue !== currentValue) {
                                editEventEntry(showId, entry.id, { scheduledDate: nextValue })
                              }
                              setEntryDateDrafts((prev) => {
                                if (!(entry.id in prev)) return prev
                                const nextDrafts = { ...prev }
                                delete nextDrafts[entry.id]
                                return nextDrafts
                              })
                            }}
                          />
                          <input
                            type="time"
                            className={styles.qualifiedForSelect}
                            value={entry.scheduledTime || ''}
                            onChange={(e) => editEventEntry(showId, entry.id, { scheduledTime: e.target.value || '' })}
                          />
                        </div>
                      </div>

                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Place</label>
                        <div className={styles.placeButtons}>
                          <button
                            className={`${styles.placeBtn} ${entry.place === 0 ? styles.placeBtnActive : ''}`}
                            onClick={() => editEventEntry(showId, entry.id, { place: entry.place === 0 ? null : 0 })}
                          >
                            Not placed
                          </button>
                          {[1, 2, 3].map((p) => (
                            <button
                              key={p}
                              className={`${styles.placeBtn} ${entry.place === p ? styles.placeBtnActive : ''}`}
                              onClick={() => editEventEntry(showId, entry.id, { place: entry.place === p ? null : p })}
                            >
                              {p === 1 ? '🥇 1st' : p === 2 ? '🥈 2nd' : '🥉 3rd'}
                            </button>
                          ))}
                          <input
                            type="number"
                            className={styles.placeInput}
                            min="1"
                            step="1"
                            placeholder="Other"
                            value={entry.place > 3 ? entry.place : ''}
                            onChange={(e) => {
                              const val = Number.parseInt(e.target.value, 10)
                              editEventEntry(showId, entry.id, { place: Number.isFinite(val) && val > 0 ? val : null })
                            }}
                          />
                        </div>
                      </div>

                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Qualified?</label>
                        <button
                          className={`${styles.qualifiedToggle} ${entry.qualified ? styles.qualifiedToggleActive : ''}`}
                          onClick={() => editEventEntry(showId, entry.id, { qualified: !entry.qualified })}
                        >
                          {entry.qualified ? '✓ Yes – AED Qualified' : '○ Not yet'}
                        </button>
                      </div>

                      {entry.qualified && (
                        <div className={styles.resultRow}>
                          <label className={styles.resultLabel}>Qualified through to</label>
                          <select
                            className={styles.qualifiedForSelect}
                            value={entry.qualifiedForEventId || ''}
                            onChange={(e) => editEventEntry(showId, entry.id, { qualifiedForEventId: e.target.value })}
                          >
                            <option value="">— Select event —</option>
                            {otherEvents.map((ev) => (
                              <option key={ev.id} value={ev.id}>
                                {getEventTypeIcon(ev.eventType)} {ev.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Notes</label>
                        <textarea
                          className={styles.resultNotes}
                          rows={2}
                          placeholder="Any notes about this entry…"
                          value={Object.prototype.hasOwnProperty.call(entryNoteDrafts, entry.id) ? entryNoteDrafts[entry.id] : (entry.notes || '')}
                          onChange={(e) => {
                            const nextNote = e.target.value
                            setEntryNoteDrafts((prev) => ({ ...prev, [entry.id]: nextNote }))
                            scheduleEntryNoteSave(entry.id, nextNote)
                          }}
                          onBlur={(e) => {
                            const nextNote = e.target.value
                            setEntryNoteDrafts((prev) => ({ ...prev, [entry.id]: nextNote }))
                            scheduleEntryNoteSave(entry.id, nextNote, { immediate: true })
                          }}
                        />
                      </div>

                      <div className={styles.resultRow}>
                        <button
                          className={styles.deleteEntryBtn}
                          onClick={() => {
                            const ok = window.confirm('Delete this festival entry? This cannot be undone.')
                            if (!ok) return
                            removeEventEntry(showId, entry.id)
                            setExpandedEntry(null)
                          }}
                        >
                          Delete Entry
                        </button>
                      </div>
                    </div>
                  )}

                </div>
              )
            })}
          </div>
        </>
      )}
      </div>

      {/* Media carousel (entry-focused) */}
      {isEntryView && mediaEntries.length > 0 && (
        <div className={styles.mediaCarousel}>
          <h3 className={styles.entriesSectionTitle}>Media</h3>
          {selectedMediaRoutine && (
            <p className={styles.entryAuthor}>Showing media for 🎵 {selectedMediaRoutine.name}</p>
          )}
          <div className={styles.carouselWrap}>
              <button
                className={`${styles.carouselArrow} ${styles.carouselArrowLeft}`}
                onClick={() => carouselRef.current?.scrollBy({ left: -220, behavior: 'smooth' })}
                disabled={mediaEntries.length <= 1}
                aria-label="Scroll left"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
            <div className={styles.carouselTrack} ref={carouselRef}>
              {mediaEntries.map((me, idx) => (
                <div
                  key={me.id}
                  className={styles.carouselItem}
                  onClick={() => setLightboxIndex(idx)}
                  style={{ cursor: 'pointer' }}
                >
                  {me.type === 'photo' ? (
                    <img src={me.content} alt="show photo" className={styles.carouselImg} />
                  ) : (
                    <video src={me.content} className={styles.carouselVideo} />
                  )}
                </div>
              ))}
            </div>
              <button
                className={`${styles.carouselArrow} ${styles.carouselArrowRight}`}
                onClick={() => carouselRef.current?.scrollBy({ left: 220, behavior: 'smooth' })}
                disabled={mediaEntries.length <= 1}
                aria-label="Scroll right"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
          </div>
        </div>
      )}

      {/* Scrapbook entries */}
      <div className={styles.entriesGrid}>
        {entries
          .filter((entry) => entry.type !== 'photo' && entry.type !== 'video')
          .filter((entry) => {
            if (isEntryView) return entry.eventEntryId === effectiveMediaEntryId
            return entry.type === 'note' && !entry.eventEntryId
          })
          .map(entry => (
          <div key={entry.id} className={`${styles.entryCard} ${styles[entry.type]}`}>
            {entry.type === 'note' && (
              <>
                <div className={styles.entryAuthor}>
                  {entry.author === 'dancer' ? '✏️ My Dancing' : entry.author === 'teacher' ? '👩‍🏫 Teacher' : '👨‍👩‍👧 Family'}
                </div>
                <p className={styles.entryContent}>{entry.content}</p>
              </>
            )}
            {entry.type === 'examResult' && (
              <>
                <div className={styles.entryAuthor}>🎓 Exam Result</div>
                <p className={styles.entryContent}>{entry.content}</p>
              </>
            )}
            {entry.type === 'feedback' && (
              <>
                <div className={styles.entryAuthor}>
                  {entry.author === 'teacher' ? '👩‍🏫 Teacher' : '👨‍👩‍👧 Family'} Feedback
                </div>
                <p className={styles.entryContent}>{entry.content}</p>
              </>
            )}
            {/* Reactions */}
            <div className={styles.reactions}>
              {(entry.emojiReactions || []).length > 0 && (
                <span className={styles.reactionList}>
                  {entry.emojiReactions.join('')}
                </span>
              )}
              <div className={styles.reactionPicker}>
                {reactionEmojis.map(emoji => (
                  <button
                    key={emoji}
                    className={styles.reactionBtn}
                    onClick={() => handleReaction(entry.id, emoji)}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className={styles.dancerActions}>
        <button className={styles.addNoteBtn} onClick={handleAddNote}>
          ✏️ Add My Note
        </button>
        {isEntryView && (
          <>
            <button
              className={styles.addPhotoBtn}
              onClick={() => photoInputRef.current?.click()}
              disabled={uploading || !effectiveMediaEntryId}
            >
              {uploading ? '⏳ Uploading...' : '📸 Add Photos'}
            </button>
            <button
              className={styles.addVideoBtn}
              onClick={() => videoInputRef.current?.click()}
              disabled={uploading || !effectiveMediaEntryId}
            >
              {uploading ? '⏳ Uploading...' : '📹 Add Videos'}
            </button>
          </>
        )}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleVideoUpload}
        />
      </div>

      {/* Upload progress bar */}
      {uploadProgress !== null && (
        <div className={styles.uploadProgressWrap}>
          <div className={styles.uploadProgressBar} style={{ width: `${uploadProgress.progress || 0}%` }} />
          <span className={styles.uploadProgressText}>{uploadProgress.stage || 'Processing…'}</span>
        </div>
      )}

      {/* Admin: add other entry types */}
      {isAdmin && isEntryView && (
        <div className={styles.adminSection}>
          <p className={styles.adminLabel}>Admin</p>
          <div className={styles.adminButtons}>
            <button onClick={() => {
              openTextDialog({
                title: 'Add feedback',
                placeholder: 'Enter teacher/parent feedback',
                type: 'feedback',
                author: 'teacher',
              })
            }}>
              👩‍🏫 Add Feedback
            </button>
            <button onClick={() => {
              openTextDialog({
                title: 'Add exam result',
                placeholder: "Enter exam result (e.g. 'Merit - 85%')",
                type: 'examResult',
                author: 'parent',
              })
            }}>
              🎓 Add Exam Result
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 && (
        <div className={styles.emptyEntries}>
          <p>📖 No scrapbook entries yet</p>
          <p>Tap "Add My Note" to write about this show!</p>
        </div>
      )}

      {/* Lightbox overlay */}
      {lightboxIndex !== null && mediaEntries[lightboxIndex] && (
        <div className={styles.lightboxOverlay} onClick={() => setLightboxIndex(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightboxIndex(null)}>✕</button>
          {isAdmin && mediaEntries[lightboxIndex].type === 'photo' && (
            <button
              className={styles.lightboxDelete}
              onClick={async (e) => {
                e.stopPropagation()
                const entry = mediaEntries[lightboxIndex]
                const ok = window.confirm('Delete this photo from the festival scrapbook?')
                if (!ok) return
                try {
                  await removeScrapbookEntry(showId, entry.id)
                  setLightboxIndex(null)
                } catch (err) {
                  notify(err?.message || 'Could not delete photo.')
                }
              }}
            >
              Delete Photo
            </button>
          )}
            <button
              className={`${styles.lightboxArrow} ${styles.lightboxArrowLeft}`}
              disabled={lightboxIndex === 0}
              onClick={(e) => { e.stopPropagation(); if (lightboxIndex > 0) setLightboxIndex(lightboxIndex - 1); }}
              aria-label="Previous"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
          {mediaEntries[lightboxIndex].type === 'photo' ? (
            <img src={mediaEntries[lightboxIndex].content} alt="" className={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          ) : (
            <video src={mediaEntries[lightboxIndex].content} controls autoPlay className={styles.lightboxVideo} onClick={e => e.stopPropagation()} />
          )}
            <button
              className={`${styles.lightboxArrow} ${styles.lightboxArrowRight}`}
              disabled={lightboxIndex === mediaEntries.length - 1}
              onClick={(e) => { e.stopPropagation(); if (lightboxIndex < mediaEntries.length - 1) setLightboxIndex(lightboxIndex + 1); }}
              aria-label="Next"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
        </div>
      )}

      <TextInputDialog
        open={textDialog.open}
        title={textDialog.title}
        placeholder={textDialog.placeholder}
        initialValue={textDialog.value}
        confirmLabel="Save"
        cancelLabel="Cancel"
        onCancel={() => setTextDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={handleTextDialogSave}
      />
    </div>
  )
}
