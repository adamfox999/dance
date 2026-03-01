import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import styles from './ProfileSwitcher.module.css'

/**
 * ProfileSwitcher — modal to switch between adult + kid profiles.
 * - Switching to a kid: instant, no auth
 * - Switching back to adult: requires email re-auth
 */
export default function ProfileSwitcher({ open, onClose }) {
  const {
    userProfile,
    kidProfiles,
    activeProfile,
    isKidMode,
    isAdmin,
    authUser,
    sendParentReauthCode,
    switchToAdultProfileWithEmailCode,
    switchToKidProfile,
  } = useApp()

  const [showPinEntry, setShowPinEntry] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailMsg, setEmailMsg] = useState(null)
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
    // Need email re-auth to switch back
    setShowPinEntry(true)
    setEmailCode('')
    setEmailCodeSent(false)
    setEmailMsg(null)
  }

  const handleOpenSettings = () => {
    onClose()
    navigate('/settings')
  }

  const handleSendEmailCode = async () => {
    const email = String(authUser?.email || '').trim()
    if (!email) {
      setEmailMsg({ type: 'error', text: 'No parent email is available for this account.' })
      return
    }
    setEmailBusy(true)
    setEmailMsg(null)
    try {
      await sendParentReauthCode()
      setEmailCode('')
      setEmailCodeSent(true)
      setEmailMsg({ type: 'success', text: `We sent a re-authentication code to ${email}.` })
    } catch (err) {
      setEmailMsg({ type: 'error', text: err?.message || 'Could not send email code.' })
    } finally {
      setEmailBusy(false)
    }
  }

  const handleEmailUnlock = async (e) => {
    e.preventDefault()
    const normalizedCode = String(emailCode || '').replace(/\D/g, '').slice(0, 6)
    if (normalizedCode.length !== 6) {
      setEmailMsg({ type: 'error', text: 'Enter the 6-digit code from your email.' })
      return
    }
    setEmailBusy(true)
    setEmailMsg(null)
    try {
      await switchToAdultProfileWithEmailCode(authUser?.email, normalizedCode)
      setShowPinEntry(false)
      setEmailCode('')
      setEmailCodeSent(false)
      onClose()
    } catch (err) {
      setEmailMsg({ type: 'error', text: err?.message || 'Invalid code. Please try again.' })
    } finally {
      setEmailBusy(false)
    }
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

        {/* Email re-auth entry for switching back to adult */}
        {showPinEntry && (
          <div className={styles.pinSection}>
            <div className={styles.pinLabel}>Send a re-authentication code to unlock parent mode.</div>

            <button
              type="button"
              className={styles.emailReauthBtn}
              onClick={handleSendEmailCode}
              disabled={emailBusy}
            >
              {emailBusy ? 'Sending…' : (emailCodeSent ? 'Resend email code' : 'Re-auth with email code')}
            </button>

            {emailCodeSent && (
              <form className={styles.emailCodeRow} onSubmit={handleEmailUnlock}>
                <label className={styles.emailCodeLabel}>
                  6-digit code
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="123456"
                    value={emailCode}
                    onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className={styles.emailCodeInput}
                    disabled={emailBusy}
                    required
                  />
                </label>
                <button type="submit" className={styles.pinSubmit} disabled={emailBusy}>
                  {emailBusy ? 'Verifying…' : 'Unlock'}
                </button>
              </form>
            )}

            {emailMsg && (
              <div className={`${styles.emailMsg} ${emailMsg.type === 'error' ? styles.emailMsgError : styles.emailMsgSuccess}`}>
                {emailMsg.text}
              </div>
            )}
          </div>
        )}

        {isAdmin && !isKidMode && (
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
export function ProfileChip({ onClick, syncState = 'online', syncTitle = 'Online · all synced' }) {
  const { userProfile, activeProfile, isKidMode, activeKidProfile } = useApp()

  const displayName = isKidMode
    ? (activeKidProfile?.display_name || 'Dancer')
    : (userProfile?.display_name || 'Parent')
  const emoji = isKidMode
    ? (activeKidProfile?.avatar_emoji || '💃')
    : (userProfile?.avatar_emoji || '👤')

  return (
    <button className={styles.profileChip} onClick={onClick} title={`Switch profile · ${syncTitle}`}>
      <span className={styles.chipEmojiWrap}>
        <span className={styles.chipEmoji}>{emoji}</span>
        <span
          className={`${styles.chipSyncBadge} ${
            syncState === 'syncing'
              ? styles.chipSyncBadgeSyncing
              : (syncState === 'offline' ? styles.chipSyncBadgeOffline : styles.chipSyncBadgeOnline)
          }`}
          aria-hidden="true"
        >
          {syncState === 'syncing' ? '↻' : ''}
        </span>
      </span>
      <span className={styles.chipTextWrap}>
        <span className={styles.chipName}>{displayName}</span>
        {!isKidMode && <span className={styles.chipSubtext}>Parent / Guardian</span>}
      </span>
    </button>
  )
}
