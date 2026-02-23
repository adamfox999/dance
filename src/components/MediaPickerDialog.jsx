import { useEffect } from 'react'
import styles from './MediaPickerDialog.module.css'

function defaultItemId(item) {
  return item?.id || item?.key || ''
}

export default function MediaPickerDialog({
  open,
  title,
  uploadLabel,
  onClose,
  onUpload,
  uploadDisabled = false,
  subtitle = 'Or pick existing media',
  loading = false,
  error = '',
  emptyText = 'No files found.',
  items = [],
  selectingId = '',
  onSelect,
  getItemId = defaultItemId,
  getPrimaryText,
  getMetaText,
  renderItem,
  listClassName = '',
  uploadStatus = '',
  uploadProgress = null,
}) {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose?.()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className={styles.overlay} role="presentation" onClick={onClose}>
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Choose media'}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h3>{title || 'Choose media'}</h3>
          <button type="button" className={styles.close} onClick={onClose}>✕</button>
        </div>

        <div className={styles.body}>
          <button type="button" className={styles.upload} onClick={onUpload} disabled={uploadDisabled}>
            {uploadLabel || 'Upload new file'}
          </button>

          {(uploadStatus || Number.isFinite(uploadProgress)) ? (
            <div className={styles.uploadStatusWrap}>
              {uploadStatus ? <div className={styles.uploadStatusText}>{uploadStatus}</div> : null}
              {Number.isFinite(uploadProgress) ? (
                <div className={styles.uploadProgressTrack}>
                  <div
                    className={styles.uploadProgressBar}
                    style={{ width: `${Math.max(0, Math.min(100, uploadProgress))}%` }}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}

          {loading ? (
            <div className={styles.loading}>Loading media…</div>
          ) : (
            <div className={`${styles.list} ${listClassName}`.trim()}>
              {items.length === 0 ? (
                <div className={styles.empty}>{emptyText}</div>
              ) : (
                items.map((item) => {
                  const itemId = getItemId(item)
                  const isSelecting = selectingId && itemId === selectingId
                  const primary = getPrimaryText ? getPrimaryText(item) : (item?.fileName || itemId)
                  const meta = getMetaText ? getMetaText(item, isSelecting) : (isSelecting ? 'Loading…' : '')
                  if (typeof renderItem === 'function') {
                    return renderItem({
                      item,
                      itemId,
                      isSelecting,
                      primary,
                      meta,
                      onSelect: () => onSelect?.(item),
                      disabled: Boolean(isSelecting),
                    })
                  }
                  return (
                    <button
                      key={itemId}
                      type="button"
                      className={styles.item}
                      onClick={() => onSelect?.(item)}
                      disabled={Boolean(isSelecting)}
                      title={primary}
                    >
                      <span className={styles.itemPrimary}>{primary}</span>
                      {meta ? <span className={styles.itemMeta}>{meta}</span> : null}
                    </button>
                  )
                })
              )}
            </div>
          )}

          {error ? <div className={styles.error}>{error}</div> : null}
        </div>
      </div>
    </div>
  )
}
