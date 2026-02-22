import { useState } from 'react'
import { useApp } from '../context/AppContext'
import styles from './Auth.module.css'

// Steps: 'email' → 'login-code' | 'create-name' → 'create-code'
export default function Auth() {
  const { signInWithMagicLink, signUpWithMagicLink, verifyEmailOtp } = useApp()

  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [code, setCode] = useState('')
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
      await signInWithMagicLink(email.trim())
      setCode('')
      setStep('login-code')
    } catch (err) {
      const msg = String(err?.message || '').toLowerCase()
      const likelyNewUser = msg.includes('signup') || msg.includes('sign up') || msg.includes('user not found')
      if (likelyNewUser) {
        setStep('create-name')
      } else {
        setMessage({ type: 'error', text: err?.message || 'Something went wrong' })
      }
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
      setCode('')
      setStep('create-code')
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Something went wrong' })
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyCode = async (e) => {
    e.preventDefault()
    const normalizedCode = code.replace(/\s+/g, '')
    if (normalizedCode.length !== 6) {
      setMessage({ type: 'error', text: 'Enter the 6-digit code from your email.' })
      return
    }
    setBusy(true)
    clearMessage()
    try {
      await verifyEmailOtp(email.trim(), normalizedCode)
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Invalid code. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  const resendLoginCode = async () => {
    setBusy(true)
    clearMessage()
    try {
      await signInWithMagicLink(email.trim())
      setMessage({ type: 'success', text: 'A new 6-digit code was sent.' })
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not resend code.' })
    } finally {
      setBusy(false)
    }
  }

  const resendSignupCode = async () => {
    setBusy(true)
    clearMessage()
    try {
      await signUpWithMagicLink(email.trim(), { displayName: displayName.trim() })
      setMessage({ type: 'success', text: 'A new 6-digit code was sent.' })
    } catch (err) {
      setMessage({ type: 'error', text: err?.message || 'Could not resend code.' })
    } finally {
      setBusy(false)
    }
  }

  const goBack = () => {
    clearMessage()
    setDisplayName('')
    setCode('')
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

        {/* Login code */}
        {step === 'login-code' && (
          <form className={styles.form} onSubmit={handleVerifyCode}>
            <p className={styles.hint}>Enter the 6-digit code we sent to <strong>{email}</strong>.</p>
            <label className={styles.label}>
              6-digit code
              <input
                type="text"
                className={styles.input}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
            <button type="submit" className={styles.submit} disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" className={styles.back} onClick={resendLoginCode} disabled={busy}>Resend code</button>
            <button type="button" className={styles.back} onClick={goBack} disabled={busy}>← Use a different email</button>
          </form>
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

        {/* Create code */}
        {step === 'create-code' && (
          <form className={styles.form} onSubmit={handleVerifyCode}>
            <p className={styles.hint}>Enter the 6-digit code we sent to <strong>{email}</strong> to finish account setup.</p>
            <label className={styles.label}>
              6-digit code
              <input
                type="text"
                className={styles.input}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                required
              />
            </label>
            <button type="submit" className={styles.submit} disabled={busy || code.length !== 6}>
              {busy ? 'Verifying…' : 'Verify code'}
            </button>
            <button type="button" className={styles.back} onClick={resendSignupCode} disabled={busy}>Resend code</button>
            <button type="button" className={styles.back} onClick={goBack} disabled={busy}>← Use a different email</button>
          </form>
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
