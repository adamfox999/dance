import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import styles from './LiveViewSelect.module.css'

const ADULT_CODE = '6789'
const ADULT_UNLOCK_KEY = 'adult-live-unlocked'

export default function LiveViewSelect() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')

  const goKidView = () => {
    navigate('/choreography?view=kid')
  }

  const unlockAdult = (e) => {
    e.preventDefault()
    if (code.trim() !== ADULT_CODE) {
      setError('Wrong code. Try again.')
      return
    }
    sessionStorage.setItem(ADULT_UNLOCK_KEY, 'true')
    setError('')
    navigate('/choreography?view=adult')
  }

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <h1>Choose Live View</h1>
        <p className={styles.subtitle}>Pick who is using choreography live mode.</p>

        <button className={styles.kidBtn} onClick={goKidView}>
          Kid View
        </button>

        <form className={styles.adultForm} onSubmit={unlockAdult}>
          <label htmlFor="adult-code">Adult code</label>
          <input
            id="adult-code"
            type="password"
            inputMode="numeric"
            value={code}
            onChange={(e) => {
              setCode(e.target.value)
              if (error) setError('')
            }}
            placeholder="Enter 4-digit code"
          />
          <button type="submit" className={styles.adultBtn}>Adult View</button>
          {error && <p className={styles.error}>{error}</p>}
        </form>
      </div>
    </div>
  )
}
