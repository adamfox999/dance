import { useRef } from 'react'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import styles from './Settings.module.css'

const CHUNK_EMOJIS = ['🌟', '🦋', '⚡', '🌈', '💃', '🌸', '🎵', '🌊', '🦄', '👑', '🎀', '🍀']

export default function Settings() {
  const { state, dispatch } = useApp()
  const importRef = useRef(null)

  const handleSettingsChange = (key, value) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } })
  }

  const handleDancerChange = (index, value) => {
    const newDancers = [...state.settings.dancers]
    newDancers[index] = value
    dispatch({ type: 'UPDATE_SETTINGS', payload: { dancers: newDancers } })
  }

  const handleChunkUpdate = (id, field, value) => {
    dispatch({ type: 'UPDATE_CHUNK', payload: { id, [field]: value } })
  }

  const handleAddChunk = () => {
    const newChunk = {
      id: generateId('chunk'),
      name: 'New Section',
      emoji: CHUNK_EMOJIS[state.chunks.length % CHUNK_EMOJIS.length],
      color: '#a855f7',
      story: '',
      startTime: 0,
      endTime: 8,
    }
    dispatch({ type: 'ADD_CHUNK', payload: newChunk })
  }

  const handleDeleteChunk = (id) => {
    if (state.chunks.length <= 1) return
    dispatch({ type: 'DELETE_CHUNK', payload: id })
  }

  const handleExport = () => {
    const data = JSON.stringify(state, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `dance-tracker-backup-${new Date().toISOString().split('T')[0]}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleImport = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target.result)
        dispatch({ type: 'IMPORT_STATE', payload: data })
        alert('Data imported successfully! ✨')
      } catch {
        alert('Failed to import — invalid file format')
      }
    }
    reader.readAsText(file)
  }

  const handleReset = () => {
    if (window.confirm('Are you sure? This will delete all your data!')) {
      dispatch({ type: 'RESET_STATE' })
    }
  }

  return (
    <div className={styles['settings-page']}>
      <h1>Settings ⚙️</h1>

      {/* General */}
      <div className={styles['settings-section']}>
        <h3>General</h3>
        <div className={styles['setting-card']}>
          <div className={styles['setting-row']}>
            <label>Dance Name</label>
            <input
              type="text"
              value={state.settings.danceName}
              onChange={(e) => handleSettingsChange('danceName', e.target.value)}
            />
          </div>
          <div className={styles['setting-row']}>
            <label>Dancer 1</label>
            <input
              type="text"
              value={state.settings.dancers[0] || ''}
              onChange={(e) => handleDancerChange(0, e.target.value)}
            />
          </div>
          <div className={styles['setting-row']}>
            <label>Dancer 2</label>
            <input
              type="text"
              value={state.settings.dancers[1] || ''}
              onChange={(e) => handleDancerChange(1, e.target.value)}
            />
          </div>
          <div className={styles['setting-row']}>
            <label>View Mode</label>
            <select
              value={state.settings.viewMode || 'adult'}
              onChange={(e) => handleSettingsChange('viewMode', e.target.value)}
            >
              <option value="adult">Adult View (full app)</option>
              <option value="kid">Kid View (timeline only)</option>
            </select>
          </div>
          <div className={styles['setting-row']}>
            <label>Rhythm Prompt Lead (ms)</label>
            <input
              type="number"
              value={state.settings.promptLeadMs ?? 200}
              onChange={(e) => handleSettingsChange('promptLeadMs', Math.max(0, Math.min(600, Number(e.target.value) || 0)))}
              min={0}
              max={600}
              step={10}
            />
          </div>
        </div>
      </div>

      {/* Dance Chunks */}
      <div className={styles['settings-section']}>
        <h3>Dance Sections (Chunks)</h3>
        <div className={styles['setting-card']}>
          <div className={styles['chunk-editor-list']}>
            {state.chunks.map((chunk) => (
              <div key={chunk.id} className={styles['chunk-editor-item']}>
                <div className={styles['chunk-editor-header']}>
                  <span className={styles['chunk-emoji-display']}>{chunk.emoji}</span>
                  <input
                    type="text"
                    value={chunk.name}
                    onChange={(e) => handleChunkUpdate(chunk.id, 'name', e.target.value)}
                    placeholder="Section name"
                  />
                  <select
                    value={chunk.emoji}
                    onChange={(e) => handleChunkUpdate(chunk.id, 'emoji', e.target.value)}
                    style={{ width: 50, padding: '4px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                  >
                    {CHUNK_EMOJIS.map((em) => (
                      <option key={em} value={em}>{em}</option>
                    ))}
                  </select>
                  <button
                    className={styles['delete-chunk-btn']}
                    onClick={() => handleDeleteChunk(chunk.id)}
                    title="Delete section"
                  >
                    ✕
                  </button>
                </div>
                <input
                  className={styles['chunk-story-input']}
                  type="text"
                  value={chunk.story}
                  onChange={(e) => handleChunkUpdate(chunk.id, 'story', e.target.value)}
                  placeholder="Story text (e.g. The butterfly opens her wings...)"
                />
              </div>
            ))}
          </div>
          <button className={styles['add-chunk-btn']} onClick={handleAddChunk}>
            + Add Section
          </button>
        </div>
      </div>

      {/* Data */}
      <div className={styles['settings-section']}>
        <h3>Data</h3>
        <div className={styles['setting-card']}>
          <div className={styles['data-actions']}>
            <button
              className={`${styles['data-btn']} ${styles['export-btn']}`}
              onClick={handleExport}
            >
              📦 Export Backup
            </button>
            <button
              className={`${styles['data-btn']} ${styles['import-btn']}`}
              onClick={() => importRef.current?.click()}
            >
              📥 Import Backup
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <button
              className={`${styles['data-btn']} ${styles['reset-btn']}`}
              onClick={handleReset}
            >
              🗑 Reset Everything
            </button>
          </div>
          <div className={styles['data-warning']}>
            Export regularly to keep a backup of your progress!
          </div>
          <div className={styles['ipad-help']}>
            <strong>iPad setup:</strong> Open this app in Safari, tap Share, then choose <em>Add to Home Screen</em>. Use that home-screen icon each time so Isla keeps the same saved data.
          </div>
        </div>
      </div>
    </div>
  )
}
