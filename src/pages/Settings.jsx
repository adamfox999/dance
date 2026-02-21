import { useState, useRef } from 'react'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import { GRADE_LEVELS } from '../data/defaultState'
import styles from './Settings.module.css'

const DISCIPLINE_ICONS = ['🩰', '👞', '💃', '🎭', '🤸', '🕺', '✨', '🌟']

export default function Settings() {
  const { state, dispatch, isAdmin, unlockAdmin, lockAdmin } = useApp()
  const importRef = useRef(null)
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState(false)

  const handlePinSubmit = (e) => {
    e.preventDefault()
    const ok = unlockAdmin(pinInput)
    if (!ok) {
      setPinError(true)
      setTimeout(() => setPinError(false), 2000)
    }
    setPinInput('')
  }

  const handleSettingsChange = (key, value) => {
    dispatch({ type: 'UPDATE_SETTINGS', payload: { [key]: value } })
  }

  // ---- Disciplines ----
  const handleAddDiscipline = () => {
    dispatch({
      type: 'ADD_DISCIPLINE',
      payload: {
        id: generateId('disc'),
        name: 'New Discipline',
        icon: DISCIPLINE_ICONS[state.disciplines.length % DISCIPLINE_ICONS.length],
        currentGrade: GRADE_LEVELS[0],
        gradeHistory: [],
        elements: [],
      },
    })
  }

  const handleDeleteDiscipline = (id) => {
    if (!window.confirm('Delete this discipline and all its data?')) return
    dispatch({ type: 'DELETE_DISCIPLINE', payload: id })
  }

  // ---- Routines ----
  const handleAddRoutine = () => {
    const versionId = generateId('ver')
    dispatch({
      type: 'ADD_ROUTINE',
      payload: {
        id: generateId('rtn'),
        name: 'New Routine',
        disciplineId: state.disciplines[0]?.id || '',
        type: 'exam',
        formation: 'solo',
        coverPhoto: '',
        showId: null,
        choreographyVersions: [{ id: versionId, label: 'v1', createdAt: new Date().toISOString(), songInstructions: [], cues: [], musicUrl: '', musicFileName: '', duration: 0, videoSyncOffset: 0 }],
        practiceVideos: [],
      },
    })
  }

  const handleDeleteRoutine = (id) => {
    if (!window.confirm('Delete this routine?')) return
    dispatch({ type: 'DELETE_ROUTINE', payload: id })
  }

  const handleRoutineCoverUpload = (routineId, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (ev) => {
      const img = new Image()
      img.onload = () => {
        const MAX_WIDTH = 900
        let width = img.width
        let height = img.height

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width)
          width = MAX_WIDTH
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        dispatch({
          type: 'UPDATE_ROUTINE',
          payload: { id: routineId, coverPhoto: dataUrl },
        })
      }

      img.src = ev.target.result
    }

    reader.readAsDataURL(file)
    event.target.value = ''
  }

  // ---- Shows ----
  const handleAddShow = () => {
    dispatch({
      type: 'ADD_SHOW',
      payload: {
        id: generateId('show'),
        name: 'New Show',
        date: new Date().toISOString().split('T')[0],
        venue: '',
        scrapbook: [],
      },
    })
  }

  const handleDeleteShow = (id) => {
    if (!window.confirm('Delete this show and its scrapbook?')) return
    dispatch({ type: 'DELETE_SHOW', payload: id })
  }

  // ---- Data ----
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

      {/* Admin unlock */}
      <div className={styles['settings-section']}>
        <h3>Admin Mode</h3>
        <div className={styles['setting-card']}>
          {isAdmin ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: '1.2rem' }}>🔓</span>
              <span style={{ fontWeight: 600, color: '#16a34a' }}>Admin unlocked</span>
              <button
                className={styles['data-btn']}
                style={{ marginLeft: 'auto', background: '#fee2e2', color: '#dc2626' }}
                onClick={lockAdmin}
              >
                Lock
              </button>
            </div>
          ) : (
            <form onSubmit={handlePinSubmit} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '1.2rem' }}>🔒</span>
              <input
                type="password"
                inputMode="numeric"
                maxLength={6}
                placeholder="PIN"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                style={{ width: 80, padding: '8px 12px', borderRadius: 8, border: `2px solid ${pinError ? '#ef4444' : '#e5e5e5'}`, fontSize: '1rem', textAlign: 'center' }}
              />
              <button type="submit" className={styles['data-btn']} style={{ background: '#ede9fe', color: '#7c3aed' }}>
                Unlock
              </button>
              {pinError && <span style={{ color: '#ef4444', fontSize: '0.8rem' }}>Wrong PIN</span>}
            </form>
          )}
        </div>
      </div>

      {/* General */}
      <div className={styles['settings-section']}>
        <h3>General</h3>
        <div className={styles['setting-card']}>
          <div className={styles['setting-row']}>
            <label>Dancer Name</label>
            <input
              type="text"
              value={state.settings.dancerName || ''}
              onChange={(e) => handleSettingsChange('dancerName', e.target.value)}
            />
          </div>
          <div className={styles['setting-row']}>
            <label>Theme Colour</label>
            <input
              type="color"
              value={state.settings.themeColor || '#a855f7'}
              onChange={(e) => handleSettingsChange('themeColor', e.target.value)}
              style={{ width: 50, height: 36, padding: 2, cursor: 'pointer' }}
            />
          </div>
          <div className={styles['setting-row']}>
            <label>Prompt Lead (ms)</label>
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

      {/* Disciplines (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Disciplines</h3>
          <div className={styles['setting-card']}>
            {state.disciplines.map((disc) => (
              <div key={disc.id} className={styles['item-row']}>
                <select
                  value={disc.icon}
                  onChange={(e) => dispatch({ type: 'UPDATE_DISCIPLINE', payload: { id: disc.id, icon: e.target.value } })}
                  style={{ width: 50, fontSize: '1.2rem', textAlign: 'center', border: 'none', background: 'transparent' }}
                >
                  {DISCIPLINE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <input
                  type="text"
                  value={disc.name}
                  onChange={(e) => dispatch({ type: 'UPDATE_DISCIPLINE', payload: { id: disc.id, name: e.target.value } })}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <select
                  value={disc.currentGrade}
                  onChange={(e) => dispatch({ type: 'UPDATE_DISCIPLINE', payload: { id: disc.id, currentGrade: e.target.value } })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  {GRADE_LEVELS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button onClick={() => handleDeleteDiscipline(disc.id)} title="Delete" style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            <button className={styles['add-btn']} onClick={handleAddDiscipline}>+ Add Discipline</button>
          </div>
        </div>
      )}

      {/* Routines (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Routines</h3>
          <div className={styles['setting-card']}>
            {state.routines.map((rtn) => (
              <div key={rtn.id} className={styles['item-row']} style={{ flexWrap: 'wrap' }}>
                {rtn.coverPhoto && (
                  <img
                    src={rtn.coverPhoto}
                    alt={`${rtn.name} cover`}
                    style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', border: '1px solid #e5e5e5' }}
                  />
                )}
                <input
                  type="text"
                  value={rtn.name}
                  onChange={(e) => dispatch({ type: 'UPDATE_ROUTINE', payload: { id: rtn.id, name: e.target.value } })}
                  style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <select
                  value={rtn.disciplineId || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_ROUTINE', payload: { id: rtn.id, disciplineId: e.target.value } })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="">No discipline</option>
                  {state.disciplines.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                </select>
                <select
                  value={rtn.formation || 'solo'}
                  onChange={(e) => dispatch({ type: 'UPDATE_ROUTINE', payload: { id: rtn.id, formation: e.target.value } })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="solo">Solo</option>
                  <option value="duet">Duet</option>
                  <option value="trio">Trio</option>
                  <option value="group">Group</option>
                </select>
                <select
                  value={rtn.type || 'exam'}
                  onChange={(e) => dispatch({ type: 'UPDATE_ROUTINE', payload: { id: rtn.id, type: e.target.value } })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="exam">Exam</option>
                  <option value="show">Show</option>
                  <option value="freestyle">Freestyle</option>
                </select>
                <label style={{ fontSize: '0.8rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer' }}>
                  📸 Cover
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={(e) => handleRoutineCoverUpload(rtn.id, e)}
                  />
                </label>
                <button onClick={() => handleDeleteRoutine(rtn.id)} title="Delete" style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            <button className={styles['add-btn']} onClick={handleAddRoutine}>+ Add Routine</button>
          </div>
        </div>
      )}

      {/* Shows (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Shows</h3>
          <div className={styles['setting-card']}>
            {state.shows.map((show) => (
              <div key={show.id} className={styles['item-row']}>
                <input
                  type="text"
                  value={show.name}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, name: e.target.value } })}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <input
                  type="date"
                  value={show.date || ''}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, date: e.target.value } })}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                />
                <input
                  type="text"
                  value={show.venue || ''}
                  placeholder="Venue"
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, venue: e.target.value } })}
                  style={{ width: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                />
                <button onClick={() => handleDeleteShow(show.id)} title="Delete" style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            <button className={styles['add-btn']} onClick={handleAddShow}>+ Add Show</button>
          </div>
        </div>
      )}

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
            {isAdmin && (
              <>
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
              </>
            )}
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
