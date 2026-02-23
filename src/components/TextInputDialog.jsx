import { useEffect, useState } from 'react'
import styles from './TextInputDialog.module.css'

export default function TextInputDialog({
  open,
  title,
  message = '',
  placeholder = '',
  initialValue = '',
  confirmLabel = 'Save',
  cancelLabel = 'Cancel',
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState(initialValue)

  useEffect(() => {
    if (open) setValue(initialValue || '')
  }, [open, initialValue])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCancel?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onCancel])

  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onClick={onCancel}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Enter text'}
        onClick={(event) => event.stopPropagation()}
      >
        <h3 className={styles.title}>{title || 'Enter text'}</h3>
        {message ? <p className={styles.message}>{message}</p> : null}
        <textarea
          className={styles.input}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={placeholder}
          rows={4}
          autoFocus
        />
        <div className={styles.actions}>
          <button type="button" className={styles.cancel} onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={styles.confirm} onClick={() => onConfirm?.(value)}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
