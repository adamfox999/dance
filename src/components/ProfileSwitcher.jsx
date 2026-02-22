import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import styles from './ProfileSwitcher.module.css'

/**
 * ProfileSwitcher — modal to switch between adult + kid profiles.
 * - Switching to a kid: instant, no auth
 * - Switching back to adult: requires PIN re-auth
 */
export default function ProfileSwitcher({ open, onClose }) {
  const {
    userProfile,
    kidProfiles,
    activeProfile,
    isKidMode,
    switchToKidProfile,
    switchToAdultProfile,
  } = useApp()

  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState(false)
  const [showPinEntry, setShowPinEntry] = useState(false)
  const navigate = useNavigate()

  if (!open) return null

  console.log('[ProfileSwitcher]', { userProfile, kidProfiles, activeProfile, isKidMode })

  const handleKidClick = (kidId) => {
    switchToKidProfile(kidId)
    onClose()
  }

  const handleAdultClick = () => {
    if (!isKidMode) {
      // Already in adult mode
      onClose()
      return
    }
    // Need PIN to switch back
    setShowPinEntry(true)
    setPin('')
    setPinError(false)
  }

  const handlePinSubmit = (e) => {
    e.preventDefault()
    const ok = switchToAdultProfile(pin)
    if (ok) {
      setShowPinEntry(false)
      setPin('')
      onClose()
    } else {
      setPinError(true)
      setTimeout(() => setPinError(false), 1500)
      setPin('')
    }
  }

  const handleOpenSettings = () => {
    onClose()
    navigate('/settings')
  }

  const adultName = userProfile?.display_name || 'Parent'
  const adultEmoji = userProfile?.avatar_emoji || '👤'

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Who's using the app?</h2>

        <div className={styles.profileList}>
          {/* Adult profile */}
          <button
            className={`${styles.profileBtn} ${!isKidMode ? styles.active : ''}`}
            onClick={handleAdultClick}
          >
            <span className={styles.profileEmoji}>{adultEmoji}</span>
            <div className={styles.profileInfo}>
              <div className={styles.profileName}>{adultName}</div>
              <div className={styles.profileRole}>Parent / Guardian</div>
            </div>
            {!isKidMode && <span className={styles.activeBadge}>Active</span>}
          </button>

          {/* Kid profiles */}
          {kidProfiles.map((kid) => (
            <button
              key={kid.id}
              className={`${styles.profileBtn} ${isKidMode && activeProfile.kidId === kid.id ? styles.active : ''}`}
              onClick={() => handleKidClick(kid.id)}
            >
              <span className={styles.profileEmoji}>{kid.avatar_emoji || '💃'}</span>
              <div className={styles.profileInfo}>
                <div className={styles.profileName}>{kid.display_name || 'Dancer'}</div>
                <div className={styles.profileRole}>Dancer</div>
              </div>
              {isKidMode && activeProfile.kidId === kid.id && (
                <span className={styles.activeBadge}>Active</span>
              )}
            </button>
          ))}
        </div>

        {/* PIN entry for switching back to adult */}
        {showPinEntry && (
          <div className={styles.pinSection}>
            <div className={styles.pinLabel}>Enter PIN to switch to parent view</div>
            <form className={styles.pinRow} onSubmit={handlePinSubmit}>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className={`${styles.pinInput} ${pinError ? styles.error : ''}`}
                autoFocus
              />
              <button type="submit" className={styles.pinSubmit}>
                Unlock
              </button>
            </form>
          </div>
        )}

        {!isKidMode && (
          <button className={styles.settingsBtn} onClick={handleOpenSettings}>
            ⚙️ Settings
          </button>
        )}

        <button className={styles.closeBtn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  )
}

/**
 * Small chip shown in the header to indicate & switch profiles.
 */
export function ProfileChip({ onClick }) {
  const { userProfile, activeProfile, isKidMode, activeKidProfile } = useApp()

  const name = isKidMode
    ? (activeKidProfile?.display_name || 'Dancer')
    : (userProfile?.display_name || 'Parent')
  const emoji = isKidMode
    ? (activeKidProfile?.avatar_emoji || '💃')
    : (userProfile?.avatar_emoji || '👤')

  return (
    <button className={styles.profileChip} onClick={onClick} title="Switch profile">
      <span className={styles.chipEmoji}>{emoji}</span>
      {name}
    </button>
  )
}

/**
 * Kid-mode banner shown at top of screen.
 */
export function KidModeBanner({ onClick }) {
  const { activeKidProfile } = useApp()

  return (
    <div className={styles.kidBanner} onClick={onClick} role="button" tabIndex={0}>
      {activeKidProfile?.avatar_emoji || '💃'} {activeKidProfile?.display_name || 'Dancer'}'s View — Tap to switch
    </div>
  )
}
