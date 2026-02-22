import { useState } from 'react'
import { useApp } from '../context/AppContext'
import styles from './Auth.module.css'

// Steps: 'email' → 'login-sent' | 'create-name' → 'create-sent'
export default function Auth() {
  const { checkUserExists, signInWithMagicLink, signUpWithMagicLink } = useApp()

  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const clearMessage = () => setMessage(null)

  // Step 1 — enter email & continue
  const handleEmailContinue = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    clearMessage()
    try {
      const exists = await checkUserExists(email.trim())
      if (exists) {
        // Returning user — send magic link immediately
        await signInWithMagicLink(email.trim())
        setStep('login-sent')
      } else {
        // New user — collect their name first
        setStep('create-name')
      }
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  // Step 2 (new user) — collect name then create account
  const handleCreateAccount = async (e) => {
    e.preventDefault()
    if (!displayName.trim()) return
    setBusy(true)
    clearMessage()
    try {
      await signUpWithMagicLink(email.trim(), { displayName: displayName.trim() })
      setStep('create-sent')
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => {
    clearMessage()
    setDisplayName('')
    setStep('email')
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <span className={styles.emoji}>💃</span>
          <h1 className={styles.title}>Isla's Dance Journey</h1>
          <p className={styles.subtitle}>Track practice, choreography & achievements</p>
        </div>

        {/* Step 1 — Email */}
        {step === 'email' && (
          <form className={styles.form} onSubmit={handleEmailContinue}>
            <p className={styles.hint}>Enter your email to sign in or create an account.</p>
            <label className={styles.label}>
              Email
              <input
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </label>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Checking…' : 'Continue'}
            </button>
          </form>
        )}

        {/* Login sent */}
        {step === 'login-sent' && (
          <div className={styles.sentBox}>
            <span className={styles.sentIcon}>✉️</span>
            <p className={styles.sentTitle}>Check your email!</p>
            <p className={styles.sentText}>
              We sent a sign-in link to <strong>{email}</strong>.
              Click the link in the email to continue.
            </p>
            <button className={styles.back} onClick={goBack}>← Use a different email</button>
          </div>
        )}

        {/* Create — name step */}
        {step === 'create-name' && (
          <form className={styles.form} onSubmit={handleCreateAccount}>
            <p className={styles.hint}>
              Looks like you're new here! This is for the parent or guardian managing the account.
            </p>
            <label className={styles.label}>
              What shall we call you?
              <input
                type="text"
                className={styles.input}
                placeholder="e.g. Mum, Dad, Sarah"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
                required
              />
            </label>
            <button type="submit" className={styles.submit} disabled={busy}>
              {busy ? 'Creating…' : 'Create Account'}
            </button>
            <button type="button" className={styles.back} onClick={goBack}>← Back</button>
          </form>
        )}

        {/* Create sent */}
        {step === 'create-sent' && (
          <div className={styles.sentBox}>
            <span className={styles.sentIcon}>✨</span>
            <p className={styles.sentTitle}>Almost there!</p>
            <p className={styles.sentText}>
              We sent a link to <strong>{email}</strong>.
              Click it to finish creating your account.
            </p>
            <button className={styles.back} onClick={goBack}>← Use a different email</button>
          </div>
        )}

        {message && (
          <div className={`${styles.message} ${styles[message.type]}`}>
            {message.text}
          </div>
        )}
      </div>

      <p className={styles.footer}>🩰 Keep dancing, keep shining 🌟</p>
    </div>
  )
}
