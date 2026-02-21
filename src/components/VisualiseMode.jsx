import { useState } from 'react'
import styles from './VisualiseMode.module.css'

export default function VisualiseMode({ chunks, onClose }) {
  const [step, setStep] = useState(-1) // -1 = intro, chunks.length = finish

  const isIntro = step === -1
  const isFinish = step >= chunks.length
  const currentChunk = !isIntro && !isFinish ? chunks[step] : null

  const next = () => setStep((s) => Math.min(s + 1, chunks.length))
  const prev = () => setStep((s) => Math.max(s - 1, -1))

  return (
    <div className={styles.overlay}>
      <button className={styles['close-btn']} onClick={onClose}>
        ✕
      </button>

      <div className={styles['visualise-content']}>
        {isIntro && (
          <>
            <span className={styles['chunk-emoji']}>🧘</span>
            <div className={styles['intro-text']}>Visualise Your Dance</div>
            <div className={styles['intro-sub']}>
              Close your eyes between each section.
              <br />
              Imagine doing each move perfectly.
            </div>
            <div className={styles['nav-buttons']}>
              <button className={`${styles['nav-btn']} ${styles.primary}`} onClick={next}>
                Start ✨
              </button>
            </div>
          </>
        )}

        {currentChunk && (
          <>
            <div className={styles.prompt}>
              Close your eyes and imagine...
            </div>
            <span className={styles['chunk-emoji']}>{currentChunk.emoji}</span>
            <div className={styles['chunk-name']}>{currentChunk.name}</div>
            <div className={styles['chunk-story']}>{currentChunk.story}</div>

            <div className={styles['nav-dots']}>
              {chunks.map((_, i) => (
                <div
                  key={i}
                  className={`${styles.dot} ${i === step ? styles.active : ''}`}
                />
              ))}
            </div>

            <div className={styles['nav-buttons']}>
              <button className={styles['nav-btn']} onClick={prev}>
                ← Back
              </button>
              <button className={`${styles['nav-btn']} ${styles.primary}`} onClick={next}>
                {step === chunks.length - 1 ? 'Finish ✨' : 'Next →'}
              </button>
            </div>
          </>
        )}

        {isFinish && (
          <>
            <span className={styles['finish-emoji']}>🌟</span>
            <div className={styles['finish-text']}>Amazing!</div>
            <div className={styles['finish-sub']}>
              You just rehearsed the whole dance in your mind!
            </div>
            <div className={styles['nav-buttons']}>
              <button className={styles['nav-btn']} onClick={() => setStep(-1)}>
                Do it again
              </button>
              <button className={`${styles['nav-btn']} ${styles.primary}`} onClick={onClose}>
                Done 💃
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
