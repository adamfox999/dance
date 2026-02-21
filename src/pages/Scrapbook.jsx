import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import styles from './Scrapbook.module.css'

export default function Scrapbook() {
  const { showId } = useParams()
  const { state, dispatch, isAdmin } = useApp()
  const navigate = useNavigate()
  const photoInputRef = useRef(null)
  const [uploading, setUploading] = useState(false)

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
          author: 'isla',
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
    try {
      const reader = new FileReader()
      reader.onload = (ev) => {
        // Resize to max 1200px wide to save space in state
        const img = new Image()
        img.onload = () => {
          const MAX = 1200
          let w = img.width, h = img.height
          if (w > MAX) { h = Math.round(h * MAX / w); w = MAX }
          const canvas = document.createElement('canvas')
          canvas.width = w; canvas.height = h
          canvas.getContext('2d').drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          dispatch({
            type: 'ADD_SCRAPBOOK_ENTRY',
            payload: {
              showId,
              entry: {
                id: `entry-${Date.now()}`,
                type: 'photo',
                content: dataUrl,
                author: 'isla',
                date: new Date().toISOString().split('T')[0],
                emojiReactions: [],
              },
            },
          })
          setUploading(false)
        }
        img.src = ev.target.result
      }
      reader.readAsDataURL(file)
    } catch {
      setUploading(false)
    }
    // Reset input so same file can be re-selected
    e.target.value = ''
  }

  return (
    <div className={styles.scrapbook}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.backBtn} onClick={() => navigate(-1)}>←</button>
        <div>
          <h1 className={styles.showName}>{show.name}</h1>
          <p className={styles.showMeta}>
            📅 {new Date(show.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            {show.venue && ` · 📍 ${show.venue}`}
          </p>
        </div>
      </div>

      {/* Scrapbook entries */}
      <div className={styles.entriesGrid}>
        {entries.map(entry => (
          <div key={entry.id} className={`${styles.entryCard} ${styles[entry.type]}`}>
            {entry.type === 'note' && (
              <>
                <div className={styles.entryAuthor}>
                  {entry.author === 'isla' ? '✏️ Isla' : entry.author === 'teacher' ? '👩‍🏫 Teacher' : '👨‍👩‍👧 Family'}
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
            {entry.type === 'photo' && (
              <>
                <img src={entry.content} alt="show photo" className={styles.entryPhoto} />
              </>
            )}
            {entry.type === 'video' && (
              <>
                <video src={entry.content} controls className={styles.entryVideo} />
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

      {/* Add note + photo buttons — always available to Isla */}
      <div className={styles.islaActions}>
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
        <input
          ref={photoInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={handlePhotoUpload}
        />
      </div>

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
    </div>
  )
}
