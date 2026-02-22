import { useState, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { getEventTypeIcon, getEventTypeLabel } from '../data/aedEvents'
import { compressImage, compressVideo } from '../utils/mediaCompress'
import styles from './Scrapbook.module.css'

export default function Scrapbook() {
  const { showId } = useParams()
  const { state, dispatch, isAdmin } = useApp()
  const navigate = useNavigate()
  const photoInputRef = useRef(null)
  const videoInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null) // { stage, progress }
  const [expandedEntry, setExpandedEntry] = useState(null) // entry id for expanded result panel
  const [lightbox, setLightbox] = useState(null) // { type, src }
  const [showAddEntry, setShowAddEntry] = useState(false)

  const show = state.shows.find(s => s.id === showId)

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

  const handleAddNote = () => {
    const note = prompt("What do you want to remember about this show?")
    if (!note) return
    dispatch({
      type: 'ADD_SCRAPBOOK_ENTRY',
      payload: {
        showId,
        entry: {
          id: `entry-${Date.now()}`,
          type: 'note',
          content: note,
          author: 'dancer',
          date: new Date().toISOString().split('T')[0],
          emojiReactions: [],
        },
      },
    })
  }

  const handleReaction = (entryId, emoji) => {
    dispatch({
      type: 'ADD_SCRAPBOOK_REACTION',
      payload: { showId, entryId, emoji },
    })
  }

  const reactionEmojis = ['🔥', '⭐', '💜', '👏', '🎉']

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress({ stage: 'compressing', progress: 0 })
    try {
      const compressed = await compressImage(file)
      const reader = new FileReader()
      reader.onload = (ev) => {
        dispatch({
          type: 'ADD_SCRAPBOOK_ENTRY',
          payload: {
            showId,
            entry: {
              id: `entry-${Date.now()}`,
              type: 'photo',
              content: ev.target.result,
              author: 'dancer',
              date: new Date().toISOString().split('T')[0],
              emojiReactions: [],
            },
          },
        })
        setUploading(false)
        setUploadProgress(null)
      }
      reader.readAsDataURL(compressed)
    } catch (err) {
      console.error('Photo compression failed:', err)
      setUploading(false)
      setUploadProgress(null)
    }
    e.target.value = ''
  }

  const handleVideoUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setUploadProgress({ stage: 'preparing', progress: 0 })
    try {
      const compressed = await compressVideo(file, {
        onProgress: (info) => setUploadProgress(info),
      })
      const reader = new FileReader()
      reader.onload = (ev) => {
        dispatch({
          type: 'ADD_SCRAPBOOK_ENTRY',
          payload: {
            showId,
            entry: {
              id: `entry-${Date.now()}`,
              type: 'video',
              content: ev.target.result,
              author: 'dancer',
              date: new Date().toISOString().split('T')[0],
              emojiReactions: [],
            },
          },
        })
        setUploading(false)
        setUploadProgress(null)
      }
      reader.readAsDataURL(compressed)
    } catch (err) {
      console.error('Video compression failed:', err)
      alert(err.message || 'Video compression failed')
      setUploading(false)
      setUploadProgress(null)
    }
    e.target.value = ''
  }

  // Get all media scrapbook entries for the carousel
  const mediaEntries = entries.filter((e) => e.type === 'photo' || e.type === 'video')

  // Available events user can select as "qualified through to"
  const otherEvents = (state.shows || []).filter((s) => s.id !== showId)

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
            📅 {new Date(show.startDate || show.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {show.endDate && show.endDate !== (show.startDate || show.date) && (
              <> – {new Date(show.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</>
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
          <h3 className={styles.entriesSectionTitle}>Entries</h3>
          <button
            className={styles.addEntryBtn}
            onClick={() => setShowAddEntry(!showAddEntry)}
          >
            {showAddEntry ? '✕' : '+ Add Entry'}
          </button>
        </div>

        {/* Add entry picker */}
        {showAddEntry && (
          <div className={styles.addEntryPicker}>
            {state.routines
              .filter(r => !(show.entries || []).some(e => e.routineId === r.id))
              .map(r => (
                <button
                  key={r.id}
                  className={styles.addEntryOption}
                  onClick={() => {
                    dispatch({
                      type: 'ADD_EVENT_ENTRY',
                      payload: {
                        showId,
                        entry: {
                          id: `entry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                          routineId: r.id,
                          scheduledDate: '',
                          scheduledTime: '',
                          place: null,
                          qualified: false,
                          qualifiedForEventId: '',
                          notes: '',
                        },
                      },
                    })
                    setShowAddEntry(false)
                  }}
                >
                  🎵 {r.name}
                </button>
              ))}
            {state.routines.filter(r => !(show.entries || []).some(e => e.routineId === r.id)).length === 0 && (
              <p className={styles.addEntryEmpty}>All routines already added</p>
            )}
          </div>
        )}

      {(show.entries || []).length > 0 && (
        <>
          <div className={styles.eventEntriesList}>
            {(show.entries || []).map((entry) => {
              const r = state.routines.find((rt) => rt.id === entry.routineId)
              const hasDate = Boolean(entry.scheduledDate)
              const hasTime = Boolean(entry.scheduledTime)
              const dateLabel = hasDate
                ? new Date(entry.scheduledDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                : ''
              const qualifiedEvent = entry.qualifiedForEventId
                ? (state.shows || []).find((s) => s.id === entry.qualifiedForEventId)
                : null
              const isExpanded = expandedEntry === entry.id

              return (
                <div key={entry.id} className={styles.eventEntryBlock}>
                  <div
                    className={styles.eventEntryRow}
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    style={{ cursor: 'pointer' }}
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
                        <label className={styles.resultLabel}>Place</label>
                        <div className={styles.placeButtons}>
                          <button
                            className={`${styles.placeBtn} ${entry.place === 0 ? styles.placeBtnActive : ''}`}
                            onClick={() => dispatch({
                              type: 'UPDATE_EVENT_ENTRY',
                              payload: { showId, entryId: entry.id, updates: { place: entry.place === 0 ? null : 0 } },
                            })}
                          >
                            Not placed
                          </button>
                          {[1, 2, 3].map((p) => (
                            <button
                              key={p}
                              className={`${styles.placeBtn} ${entry.place === p ? styles.placeBtnActive : ''}`}
                              onClick={() => dispatch({
                                type: 'UPDATE_EVENT_ENTRY',
                                payload: { showId, entryId: entry.id, updates: { place: entry.place === p ? null : p } },
                              })}
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
                              dispatch({
                                type: 'UPDATE_EVENT_ENTRY',
                                payload: {
                                  showId,
                                  entryId: entry.id,
                                  updates: { place: Number.isFinite(val) && val > 0 ? val : null },
                                },
                              })
                            }}
                          />
                        </div>
                      </div>

                      <div className={styles.resultRow}>
                        <label className={styles.resultLabel}>Qualified?</label>
                        <button
                          className={`${styles.qualifiedToggle} ${entry.qualified ? styles.qualifiedToggleActive : ''}`}
                          onClick={() => dispatch({
                            type: 'UPDATE_EVENT_ENTRY',
                            payload: { showId, entryId: entry.id, updates: { qualified: !entry.qualified } },
                          })}
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
                            onChange={(e) => dispatch({
                              type: 'UPDATE_EVENT_ENTRY',
                              payload: { showId, entryId: entry.id, updates: { qualifiedForEventId: e.target.value } },
                            })}
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
                          value={entry.notes || ''}
                          onChange={(e) => dispatch({
                            type: 'UPDATE_EVENT_ENTRY',
                            payload: { showId, entryId: entry.id, updates: { notes: e.target.value } },
                          })}
                        />
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

      {/* Media carousel */}
      {mediaEntries.length > 0 && (
        <div className={styles.mediaCarousel}>
          <h3 className={styles.entriesSectionTitle}>Media</h3>
          <div className={styles.carouselTrack}>
            {mediaEntries.map((me) => (
              <div
                key={me.id}
                className={styles.carouselItem}
                onClick={() => setLightbox({ type: me.type, src: me.content })}
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
        </div>
      )}

      {/* Scrapbook entries */}
      <div className={styles.entriesGrid}>
        {entries.filter(entry => entry.type !== 'photo' && entry.type !== 'video').map(entry => (
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

      {/* Add note + photo + video buttons — always available to My Dancing */}
      <div className={styles.dancerActions}>
        <button className={styles.addNoteBtn} onClick={handleAddNote}>
          ✏️ Add My Note
        </button>
        <button
          className={styles.addPhotoBtn}
          onClick={() => photoInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳ Uploading...' : '📸 Add Photo'}
        </button>
        <button
          className={styles.addVideoBtn}
          onClick={() => videoInputRef.current?.click()}
          disabled={uploading}
        >
          {uploading ? '⏳ Uploading...' : '📹 Add Video'}
        </button>
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
        <input
          ref={videoInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={handleVideoUpload}
        />
      </div>

      {/* Upload progress bar */}
      {uploadProgress !== null && (
        <div className={styles.uploadProgressWrap}>
          <div className={styles.uploadProgressBar} style={{ width: `${uploadProgress}%` }} />
          <span className={styles.uploadProgressText}>{Math.round(uploadProgress)}% compressing…</span>
        </div>
      )}

      {/* Admin: add other entry types */}
      {isAdmin && (
        <div className={styles.adminSection}>
          <p className={styles.adminLabel}>Admin</p>
          <div className={styles.adminButtons}>
            <button onClick={() => {
              const feedback = prompt("Enter teacher/parent feedback:")
              if (!feedback) return
              dispatch({
                type: 'ADD_SCRAPBOOK_ENTRY',
                payload: {
                  showId,
                  entry: {
                    id: `entry-${Date.now()}`,
                    type: 'feedback',
                    content: feedback,
                    author: 'teacher',
                    date: new Date().toISOString().split('T')[0],
                    emojiReactions: [],
                  },
                },
              })
            }}>
              👩‍🏫 Add Feedback
            </button>
            <button onClick={() => {
              const result = prompt("Enter exam result (e.g. 'Merit - 85%'):")
              if (!result) return
              dispatch({
                type: 'ADD_SCRAPBOOK_ENTRY',
                payload: {
                  showId,
                  entry: {
                    id: `entry-${Date.now()}`,
                    type: 'examResult',
                    content: result,
                    author: 'parent',
                    date: new Date().toISOString().split('T')[0],
                    emojiReactions: [],
                  },
                },
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
      {lightbox && (
        <div className={styles.lightboxOverlay} onClick={() => setLightbox(null)}>
          <button className={styles.lightboxClose} onClick={() => setLightbox(null)}>✕</button>
          {lightbox.type === 'photo' ? (
            <img src={lightbox.src} alt="" className={styles.lightboxImg} onClick={e => e.stopPropagation()} />
          ) : (
            <video src={lightbox.src} controls autoPlay className={styles.lightboxVideo} onClick={e => e.stopPropagation()} />
          )}
        </div>
      )}
    </div>
  )
}
