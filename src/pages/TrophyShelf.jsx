import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { milestones } from '../utils/milestones'
import { formatDate, generateId } from '../utils/helpers'
import styles from './TrophyShelf.module.css'

const CUSTOM_EMOJIS = ['🌟', '💎', '🦄', '🌈', '🎀', '👑', '💜', '🎊', '🦋', '🌸', '✨', '🍀']

export default function TrophyShelf() {
  const { state, dispatch } = useApp()
  const [customLabel, setCustomLabel] = useState('')
  const [customEmoji, setCustomEmoji] = useState('🌟')

  const earnedTypes = state.stickers.map((s) => s.type)
  const lockedMilestones = milestones.filter((m) => !earnedTypes.includes(m.type))

  const handleAwardCustom = () => {
    if (!customLabel.trim()) return
    dispatch({
      type: 'ADD_CUSTOM_STICKER',
      payload: {
        id: generateId('sticker'),
        type: `custom-${Date.now()}`,
        label: customLabel.trim(),
        icon: customEmoji,
        earnedDate: new Date().toISOString().split('T')[0],
      },
    })
    setCustomLabel('')
  }

  return (
    <div className={styles['trophy-page']}>
      <h1>Trophy Shelf 🏆</h1>
      <p className={styles.subtitle}>All of your hard-earned stickers and badges!</p>

      <div className={styles['trophy-count']}>
        {state.stickers.length} sticker{state.stickers.length !== 1 ? 's' : ''} earned!
      </div>

      {/* Earned trophies */}
      <div className={styles['trophy-grid']}>
        {state.stickers.map((sticker) => (
          <div key={sticker.id} className={styles['trophy-card']}>
            <span className={styles['trophy-icon']}>{sticker.icon}</span>
            <span className={styles['trophy-label']}>{sticker.label}</span>
            <span className={styles['trophy-date']}>
              {formatDate(sticker.earnedDate)}
            </span>
          </div>
        ))}
      </div>

      {/* Locked trophies */}
      {lockedMilestones.length > 0 && (
        <div className={styles['locked-section']}>
          <h3>🔒 Still to unlock</h3>
          <div className={styles['locked-grid']}>
            {lockedMilestones.map((m) => (
              <div key={m.type} className={styles['locked-card']}>
                <span className={styles['locked-icon']}>{m.icon}</span>
                <span className={styles['locked-label']}>{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Custom sticker (parent) */}
      <div className={styles['add-custom']}>
        <h3>🎁 Award a Custom Sticker</h3>
        <div className={styles['custom-form']}>
          <div className={styles['emoji-row']}>
            {CUSTOM_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                className={`${styles['emoji-select-btn']} ${customEmoji === emoji ? styles.selected : ''}`}
                onClick={() => setCustomEmoji(emoji)}
              >
                {emoji}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Sticker name (e.g. Super Smile!)"
            value={customLabel}
            onChange={(e) => setCustomLabel(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAwardCustom()}
          />
          <button className={styles['award-btn']} onClick={handleAwardCustom}>
            Award Sticker ✨
          </button>
        </div>
      </div>
    </div>
  )
}
