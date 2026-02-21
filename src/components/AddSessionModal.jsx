import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import styles from './AddSessionModal.module.css'

const SESSION_TYPES = [
  { value: 'practice', icon: '🎵', label: 'Practice' },
  { value: 'lesson', icon: '👩‍🏫', label: 'Lesson' },
  { value: 'competition', icon: '🏆', label: 'Competition' },
]

const SUB_TYPES = ['together', 'alone', 'private']

export default function AddSessionModal({ onClose }) {
  const { dispatch } = useApp()
  const [type, setType] = useState('practice')
  const [subType, setSubType] = useState('together')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])

  const handleSave = () => {
    if (!title.trim()) return

    const session = {
      id: generateId('session'),
      type,
      subType: type === 'competition' ? null : subType,
      date,
      title: title.trim(),
      videoUrl: '',
      musicUrl: '',
      praise: [],
      workOn: [],
      voiceNotes: [],
      emojiReactions: [],
      chunkRatings: {},
    }

    dispatch({ type: 'ADD_SESSION', payload: session })

    // Log practice date
    dispatch({ type: 'LOG_PRACTICE', payload: date })

    onClose()
  }

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2>Add Session ✨</h2>

        {/* Type */}
        <div className={styles['form-group']}>
          <label>Type</label>
          <div className={styles['type-selector']}>
            {SESSION_TYPES.map((t) => (
              <button
                key={t.value}
                className={`${styles['type-option']} ${type === t.value ? styles.selected : ''}`}
                onClick={() => setType(t.value)}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sub type (not for competitions) */}
        {type !== 'competition' && (
          <div className={styles['form-group']}>
            <label>Practice Type</label>
            <select value={subType} onChange={(e) => setSubType(e.target.value)}>
              {SUB_TYPES.map((st) => (
                <option key={st} value={st}>
                  {st.charAt(0).toUpperCase() + st.slice(1)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Title */}
        <div className={styles['form-group']}>
          <label>Title</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Duet Rehearsal"
            autoFocus
          />
        </div>

        {/* Date */}
        <div className={styles['form-group']}>
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className={styles['button-row']}>
          <button className={styles['cancel-btn']} onClick={onClose}>
            Cancel
          </button>
          <button className={styles['save-btn']} onClick={handleSave}>
            Add Session
          </button>
        </div>
      </div>
    </div>
  )
}
