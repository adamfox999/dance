import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { fetchStateFromBackend, listMediaFromBackend, getFileFromBackend } from '../utils/backendApi'
import { saveFile } from '../utils/fileStorage'
import MediaPickerDialog from '../components/MediaPickerDialog'
import { GRADE_LEVELS } from '../data/defaultState'
import { EVENT_TYPES } from '../data/aedEvents'
import styles from './Settings.module.css'

const DISCIPLINE_ICONS = ['🩰', '👞', '💃', '🎭', '🤸', '🕺', '✨', '🌟']
const AVATAR_EMOJIS = ['👤', '💃', '🩰', '👧', '👦', '🧒', '🌟', '✨', '🦋', '🎀', '🕺', '🤸']

export default function Settings() {
  const {
    disciplines, routines, events, settings,
    addDiscipline, editDiscipline, removeDiscipline,
    addRoutine, editRoutine, removeRoutine,
    addShow, editShow, removeShow,
    resetState,
    isAdmin, hasSupabaseAuth, authUser, signOut,
    // Profiles
    userProfile, kidProfiles, ownKidProfiles, familyUnits,
    saveUserProfile, addKidProfile, editKidProfile, removeKidProfile,
    createFamilyUnit, updateFamilyUnit, deleteFamilyUnit,
    // Shares
    outgoingShares, incomingShares, sharedDances,
    createShareInvite, acceptShareInvite, removeShare, loadShares,
    // Guardians
    outgoingGuardians, incomingGuardians,
    createGuardianInvite, acceptGuardianInvite, revokeGuardianInvite, removeGuardian,
  } = useApp()
  const navigate = useNavigate()
  const importRef = useRef(null)
  const [authBusy, setAuthBusy] = useState(false)

  // Profile editing state
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileName, setProfileName] = useState(userProfile?.display_name || '')
  const [profileEmoji, setProfileEmoji] = useState(userProfile?.avatar_emoji || '👤')
  const [newKidName, setNewKidName] = useState('')
  const [newKidEmoji, setNewKidEmoji] = useState('💃')
  const [profileBusy, setProfileBusy] = useState(false)

  // Share invite state
  const [shareRoutineId, setShareRoutineId] = useState('')
  const [shareBusy, setShareBusy] = useState(false)
  const [shareMsg, setShareMsg] = useState(null)
  const [shareLink, setShareLink] = useState(null)

  // Guardian state
  const [guardianBusy, setGuardianBusy] = useState(false)
  const [guardianMsg, setGuardianMsg] = useState(null)
  const [guardianLink, setGuardianLink] = useState(null)
  const [invitingUnitId, setInvitingUnitId] = useState(null)  // which unit is showing invite form

  // Family unit creation / editing state
  const [creatingUnit, setCreatingUnit] = useState(false)
  const [newUnitName, setNewUnitName] = useState('')
  const [newUnitKids, setNewUnitKids] = useState([])
  const [editingUnitId, setEditingUnitId] = useState(null)
  const [editUnitName, setEditUnitName] = useState('')
  const [editUnitKids, setEditUnitKids] = useState([])
  const [unitBusy, setUnitBusy] = useState(false)

  // Kid profile editing state
  const [editingKidId, setEditingKidId] = useState(null)
  const [editKidName, setEditKidName] = useState('')
  const [editKidEmoji, setEditKidEmoji] = useState('💃')
  const coverUploadInputRef = useRef(null)
  const [coverPickerRoutineId, setCoverPickerRoutineId] = useState(null)
  const [coverMediaItems, setCoverMediaItems] = useState([])
  const [coverPickerLoading, setCoverPickerLoading] = useState(false)
  const [coverPickerError, setCoverPickerError] = useState('')
  const [coverPickerApplyingKey, setCoverPickerApplyingKey] = useState(null)
  const [coverUploadBusy, setCoverUploadBusy] = useState(false)
  const [coverUploadStatus, setCoverUploadStatus] = useState('')
  const [coverUploadProgress, setCoverUploadProgress] = useState(null)
  const [coverPreviewUrls, setCoverPreviewUrls] = useState({})
  const coverPreviewUrlsRef = useRef({})
  const coverAutoCloseTimerRef = useRef(null)

  const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })

  const updateCoverPreviewUrls = (nextMap) => {
    Object.values(coverPreviewUrlsRef.current).forEach((url) => {
      try { URL.revokeObjectURL(url) } catch {}
    })
    coverPreviewUrlsRef.current = nextMap
    setCoverPreviewUrls(nextMap)
  }

  useEffect(() => {
    return () => {
      if (coverAutoCloseTimerRef.current) {
        clearTimeout(coverAutoCloseTimerRef.current)
        coverAutoCloseTimerRef.current = null
      }
      Object.values(coverPreviewUrlsRef.current).forEach((url) => {
        try { URL.revokeObjectURL(url) } catch {}
      })
      coverPreviewUrlsRef.current = {}
    }
  }, [])

  useEffect(() => {
    if (!coverPickerRoutineId || coverMediaItems.length === 0) {
      updateCoverPreviewUrls({})
      return
    }

    let cancelled = false
    const loadPreviews = async () => {
      const entries = await Promise.all(coverMediaItems.map(async (item) => {
        const itemKey = item.key || item.id
        if (!itemKey) return null
        try {
          const file = await getFileFromBackend(itemKey)
          if (!file?.blob) return null
          return [itemKey, URL.createObjectURL(file.blob)]
        } catch {
          return null
        }
      }))

      const nextMap = Object.fromEntries(entries.filter(Boolean))
      if (cancelled) {
        Object.values(nextMap).forEach((url) => {
          try { URL.revokeObjectURL(url) } catch {}
        })
        return
      }
      updateCoverPreviewUrls(nextMap)
    }

    loadPreviews()
    return () => { cancelled = true }
  }, [coverPickerRoutineId, coverMediaItems])

  const handleSignOut = async () => {
    setAuthBusy(true)
    try {
      await signOut()
    } catch (err) {
      alert(err?.message || 'Could not sign out')
    } finally {
      setAuthBusy(false)
    }
  }

  // ---- Profile handlers ----
  const handleSaveProfile = async () => {
    setProfileBusy(true)
    try {
      await saveUserProfile({ displayName: profileName, avatarEmoji: profileEmoji })
      setEditingProfile(false)
    } catch (err) {
      alert(err?.message || 'Could not save profile')
    } finally {
      setProfileBusy(false)
    }
  }

  const handleAddKid = async () => {
    if (!newKidName.trim()) return
    setProfileBusy(true)
    try {
      await addKidProfile({ displayName: newKidName.trim(), avatarEmoji: newKidEmoji })
      setNewKidName('')
      setNewKidEmoji('💃')
    } catch (err) {
      alert(err?.message || 'Could not add child profile')
    } finally {
      setProfileBusy(false)
    }
  }

  const handleDeleteKid = async (kidId) => {
    if (!window.confirm('Remove this child profile?')) return
    try {
      await removeKidProfile(kidId)
    } catch (err) {
      alert(err?.message || 'Could not remove profile')
    }
  }

  const handleEditKid = async () => {
    if (!editingKidId || !editKidName.trim()) return
    setProfileBusy(true)
    try {
      await editKidProfile(editingKidId, { displayName: editKidName.trim(), avatarEmoji: editKidEmoji })
      setEditingKidId(null)
    } catch (err) {
      alert(err?.message || 'Could not update profile')
    } finally {
      setProfileBusy(false)
    }
  }

  const handleToggleKidOnRoutine = (routineId, kidId) => {
    const routine = routines.find(r => r.id === routineId)
    if (!routine) return
    const current = routine.kidProfileIds || []
    const updated = current.includes(kidId)
      ? current.filter(id => id !== kidId)
      : [...current, kidId]
    editRoutine(routineId, { kidProfileIds: updated })
  }

  // ---- Share handlers ----
  const handleCreateShare = async (e) => {
    e.preventDefault()
    setShareBusy(true)
    setShareMsg(null)
    setShareLink(null)
    try {
      if (!shareRoutineId) throw new Error('Please select a dance to share.')
      const res = await fetchStateFromBackend()
      if (!res?.danceData?.id) throw new Error('No dance data found to share.')
      const share = await createShareInvite({
        danceId: res.danceData.id,
        routineId: shareRoutineId,
      })
      setShareRoutineId('')
      const link = `${window.location.origin}${window.location.pathname}?share=${share.invite_token}`
      setShareLink(link)
      setShareMsg({ type: 'success', text: 'Share link created! Send it to the other parent.' })
    } catch (err) {
      setShareMsg({ type: 'error', text: err?.message || 'Could not create share link' })
    } finally {
      setShareBusy(false)
    }
  }

  const handleCopyShareLink = async (value) => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setShareMsg({ type: 'success', text: 'Link copied!' })
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setShareMsg({ type: 'success', text: 'Link copied!' })
    }
  }

  const handleAcceptShare = async (shareId) => {
    try {
      await acceptShareInvite(shareId)
    } catch (err) {
      alert(err?.message || 'Could not accept invite')
    }
  }

  const handleDeleteShare = async (shareId) => {
    try {
      await removeShare(shareId)
    } catch (err) {
      alert(err?.message || 'Could not delete invite')
    }
  }

  // ---- Guardian handlers ----
  const handleCreateGuardian = async (e, familyUnitId) => {
    e.preventDefault()
    setGuardianBusy(true)
    setGuardianMsg(null)
    setGuardianLink(null)
    try {
      const guardian = await createGuardianInvite({
        familyUnitId,
        kidProfileIds: [],
        role: 'guardian',
      })
      const link = `${window.location.origin}${window.location.pathname}?invite=${guardian.invite_token}`
      setGuardianLink(link)
      setInvitingUnitId(familyUnitId)
      setGuardianMsg({ type: 'success', text: 'Invite link created! Share it with your parent or guardian.' })
    } catch (err) {
      setGuardianMsg({ type: 'error', text: err?.message || 'Could not create invite' })
    } finally {
      setGuardianBusy(false)
    }
  }

  const handleCopyGuardianLink = async () => {
    if (!guardianLink) return
    try {
      await navigator.clipboard.writeText(guardianLink)
      setGuardianMsg({ type: 'success', text: 'Link copied!' })
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea')
      ta.value = guardianLink
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setGuardianMsg({ type: 'success', text: 'Link copied!' })
    }
  }

  const handleAcceptGuardian = async (id) => {
    try {
      await acceptGuardianInvite(id)
    } catch (err) {
      alert(err?.message || 'Could not accept invite')
    }
  }

  const handleRevokeGuardian = async (id) => {
    try {
      await revokeGuardianInvite(id)
    } catch (err) {
      alert(err?.message || 'Could not revoke guardian')
    }
  }

  const handleDeleteUnit = async (unitId) => {
    if (!window.confirm('Delete this family unit? Members will lose access.')) return
    try {
      await deleteFamilyUnit(unitId)
    } catch (err) {
      alert(err?.message || 'Could not delete family unit')
    }
  }

  const handleCreateUnit = async () => {
    if (!newUnitName.trim()) return
    setUnitBusy(true)
    try {
      await createFamilyUnit({ name: newUnitName.trim(), kidProfileIds: newUnitKids })
      setNewUnitName('')
      setNewUnitKids([])
      setCreatingUnit(false)
    } catch (err) {
      alert(err?.message || 'Could not create family unit')
    } finally {
      setUnitBusy(false)
    }
  }

  const handleUpdateUnit = async (unitId) => {
    if (!editUnitName.trim()) return
    setUnitBusy(true)
    try {
      await updateFamilyUnit(unitId, { name: editUnitName.trim(), kidProfileIds: editUnitKids })
      setEditingUnitId(null)
    } catch (err) {
      alert(err?.message || 'Could not update family unit')
    } finally {
      setUnitBusy(false)
    }
  }

  // ---- Disciplines ----
  const handleAddDiscipline = () => {
    addDiscipline({
      name: 'New Discipline',
      icon: DISCIPLINE_ICONS[disciplines.length % DISCIPLINE_ICONS.length],
      currentGrade: GRADE_LEVELS[0],
    })
  }

  const handleDeleteDiscipline = (id) => {
    if (!window.confirm('Delete this discipline and all its data?')) return
    removeDiscipline(id)
  }

  // ---- Routines ----
  const handleAddRoutine = () => {
    addRoutine({
      name: 'New Routine',
      disciplineId: disciplines[0]?.id || '',
      type: 'exam',
      formation: 'solo',
      coverPhoto: '',
    })
  }

  const handleDeleteRoutine = (id) => {
    if (!window.confirm('Delete this routine?')) return
    removeRoutine(id)
  }

  const handleRoutineCoverUpload = async (routineId, event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setCoverPickerError('')
    setCoverUploadBusy(true)
    setCoverUploadProgress(0)
    setCoverUploadStatus('Reading image…')

    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onprogress = (ev) => {
          if (ev.lengthComputable) {
            const pct = Math.round((ev.loaded / ev.total) * 30)
            setCoverUploadProgress(Math.max(5, Math.min(30, pct)))
          }
        }
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error || new Error('Could not read image file'))
        reader.readAsDataURL(file)
      })

      setCoverUploadStatus('Compressing image…')
      setCoverUploadProgress(45)

      const img = await new Promise((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve(image)
        image.onerror = () => reject(new Error('Could not decode image'))
        image.src = dataUrl
      })

      const MAX_LONG_SIDE = 1920
      let width = img.width
      let height = img.height
      const longSide = Math.max(width, height)
      if (longSide > MAX_LONG_SIDE) {
        const scale = MAX_LONG_SIDE / longSide
        width = Math.max(1, Math.round(width * scale))
        height = Math.max(1, Math.round(height * scale))
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('Could not initialize image compressor')
      ctx.drawImage(img, 0, 0, width, height)

      setCoverUploadProgress(70)
      const blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b) resolve(b)
          else reject(new Error('Could not create image blob'))
        }, 'image/jpeg', 0.85)
      })

      setCoverUploadStatus('Applying cover…')
      setCoverUploadProgress(82)
      const compressedDataUrl = await blobToDataUrl(blob)
      await editRoutine(routineId, { coverPhoto: compressedDataUrl })

      setCoverUploadStatus('Uploading to library…')
      setCoverUploadProgress(90)
      const ts = Date.now()
      const mediaKey = `routine-covers/${routineId}/${ts}.jpg`
      await saveFile(mediaKey, blob, {
        fileName: `${routineId}-${ts}.jpg`,
        type: 'image/jpeg',
        size: blob.size,
      })

      setCoverUploadStatus('Done')
      setCoverUploadProgress(100)
      if (coverAutoCloseTimerRef.current) {
        clearTimeout(coverAutoCloseTimerRef.current)
      }
      coverAutoCloseTimerRef.current = setTimeout(() => {
        handleCloseCoverPicker()
      }, 700)
    } catch (err) {
      setCoverPickerError(err?.message || 'Could not upload cover image')
      setCoverUploadStatus('')
      setCoverUploadProgress(null)
    } finally {
      setCoverUploadBusy(false)
      event.target.value = ''
    }
  }

  const handleOpenCoverPicker = async (routineId) => {
    setCoverPickerRoutineId(routineId)
    setCoverPickerLoading(true)
    setCoverPickerError('')
    try {
      const media = await listMediaFromBackend()
      const images = media.filter((m) => String(m.type || '').startsWith('image/'))
      setCoverMediaItems(images)
    } catch (err) {
      setCoverPickerError(err?.message || 'Could not load image library')
      setCoverMediaItems([])
    } finally {
      setCoverPickerLoading(false)
    }
  }

  const handleCloseCoverPicker = () => {
    if (coverAutoCloseTimerRef.current) {
      clearTimeout(coverAutoCloseTimerRef.current)
      coverAutoCloseTimerRef.current = null
    }
    setCoverPickerRoutineId(null)
    setCoverPickerApplyingKey(null)
    setCoverPickerError('')
    setCoverUploadBusy(false)
    setCoverUploadStatus('')
    setCoverUploadProgress(null)
    updateCoverPreviewUrls({})
  }

  const handleCoverDialogUploadClick = () => {
    coverUploadInputRef.current?.click()
  }

  const handleCoverPickerFileInput = (event) => {
    if (!coverPickerRoutineId) {
      event.target.value = ''
      return
    }
    handleRoutineCoverUpload(coverPickerRoutineId, event)
  }

  const handleSelectCoverFromMedia = async (routineId, mediaKey) => {
    if (!routineId || !mediaKey) return
    setCoverPickerError('')
    setCoverPickerApplyingKey(mediaKey)
    try {
      const file = await getFileFromBackend(mediaKey)
      if (!file?.blob) throw new Error('File not found')
      const dataUrl = await blobToDataUrl(file.blob)
      await editRoutine(routineId, { coverPhoto: dataUrl })
      handleCloseCoverPicker()
    } catch (err) {
      setCoverPickerError(err?.message || 'Could not apply selected image')
    } finally {
      setCoverPickerApplyingKey(null)
    }
  }

  // ---- Competitions / Events ----
  const handleAddShow = () => {
    addShow({
      name: 'New Competition',
      date: new Date().toISOString().split('T')[0],
      eventType: 'qualifier',
      venue: '',
    })
  }

  const handleDeleteShow = (id) => {
    if (!window.confirm('Delete this show and its scrapbook?')) return
    removeShow(id)
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
        JSON.parse(event.target.result) // validate JSON
        alert('Import is not supported in normalized mode. Use Supabase directly.')
      } catch {
        alert('Failed to import — invalid file format')
      }
    }
    reader.readAsText(file)
  }

  const handleReset = () => {
    if (window.confirm('Are you sure? This will delete all your data!')) {
      resetState()
    }
  }

  return (
    <div className={styles['settings-page']}>
      <h1 className={styles['page-title']}>
        <button
          type="button"
          className={styles['back-arrow']}
          onClick={() => navigate('/')}
          aria-label="Back to home"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="22" height="22">
            <path fillRule="evenodd" d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 0 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 0 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z" clipRule="evenodd" />
          </svg>
        </button>
        Settings ⚙️
      </h1>

      {hasSupabaseAuth && authUser && (
        <div className={styles['settings-section']}>
          <h3>Account</h3>
          <div className={styles['setting-card']}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.2rem' }}>✅</span>
              <span style={{ fontWeight: 600, color: '#166534' }}>
                Signed in as {authUser.email || 'user'}
              </span>
              <button
                className={styles['data-btn']}
                style={{ marginLeft: 'auto', background: '#fee2e2', color: '#dc2626' }}
                onClick={handleSignOut}
                disabled={authBusy}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Family Units */}
      {hasSupabaseAuth && authUser && (
        <div className={styles['settings-section']}>
          <h3>Family Units 👨‍👩‍👧‍👦</h3>

          {/* My profile (always visible, outside of units) */}
          <div className={styles['setting-card']} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>Your Profile</div>
            {editingProfile ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={profileEmoji}
                  onChange={(e) => setProfileEmoji(e.target.value)}
                  style={{ width: 50, fontSize: '1.3rem', textAlign: 'center', border: 'none', background: 'transparent' }}
                >
                  {AVATAR_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Your name"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.95rem' }}
                />
                <button
                  className={styles['data-btn']}
                  style={{ background: '#ede9fe', color: '#7c3aed' }}
                  onClick={handleSaveProfile}
                  disabled={profileBusy}
                >{profileBusy ? 'Saving…' : 'Save'}</button>
                <button className={styles['data-btn']} onClick={() => setEditingProfile(false)}>Cancel</button>
              </div>
            ) : (
              <div className={styles['item-row']}>
                <span style={{ fontSize: '1.3rem' }}>{userProfile?.avatar_emoji || '👤'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{userProfile?.display_name || 'Parent'}</div>
                  <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{authUser?.email}</div>
                </div>
                <button
                  className={styles['data-btn']}
                  style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem' }}
                  onClick={() => {
                    setProfileName(userProfile?.display_name || '')
                    setProfileEmoji(userProfile?.avatar_emoji || '👤')
                    setEditingProfile(true)
                  }}
                >Edit</button>
              </div>
            )}
          </div>

          {/* Add child (global, not per-unit) */}
          {isAdmin && (
            <div className={styles['setting-card']} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.78rem', fontWeight: 600, color: '#9ca3af', marginBottom: 6 }}>Your Children</div>
              {ownKidProfiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {ownKidProfiles.map(kid => {
                    const isEditing = editingKidId === kid.id
                    return isEditing ? (
                      <div key={kid.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <select
                          value={editKidEmoji}
                          onChange={(e) => setEditKidEmoji(e.target.value)}
                          style={{ width: 50, fontSize: '1.3rem', textAlign: 'center', border: 'none', background: 'transparent' }}
                        >
                          {AVATAR_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                        </select>
                        <input
                          type="text"
                          value={editKidName}
                          onChange={(e) => setEditKidName(e.target.value)}
                          style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                        />
                        <button
                          className={styles['data-btn']}
                          style={{ background: '#ede9fe', color: '#7c3aed' }}
                          onClick={handleEditKid}
                          disabled={profileBusy || !editKidName.trim()}
                        >{profileBusy ? '…' : 'Save'}</button>
                        <button className={styles['data-btn']} onClick={() => setEditingKidId(null)}>Cancel</button>
                      </div>
                    ) : (
                      <div key={kid.id} className={styles['item-row']}>
                        <span style={{ fontSize: '1.3rem' }}>{kid.avatar_emoji || '💃'}</span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600 }}>{kid.display_name}</div>
                        </div>
                        <button
                          className={styles['data-btn']}
                          style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.75rem' }}
                          onClick={() => {
                            setEditingKidId(kid.id)
                            setEditKidName(kid.display_name || '')
                            setEditKidEmoji(kid.avatar_emoji || '💃')
                          }}
                        >Edit</button>
                        <button
                          onClick={() => handleDeleteKid(kid.id)}
                          title="Remove"
                          style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}
                        >✕</button>
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <select
                  value={newKidEmoji}
                  onChange={(e) => setNewKidEmoji(e.target.value)}
                  style={{ width: 50, fontSize: '1.3rem', textAlign: 'center', border: 'none', background: 'transparent' }}
                >
                  {AVATAR_EMOJIS.map(e => <option key={e} value={e}>{e}</option>)}
                </select>
                <input
                  type="text"
                  placeholder="Child's name"
                  value={newKidName}
                  onChange={(e) => setNewKidName(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.95rem' }}
                />
                <button
                  className={styles['add-btn']}
                  onClick={handleAddKid}
                  disabled={profileBusy || !newKidName.trim()}
                  style={{ whiteSpace: 'nowrap' }}
                >+ Add Child</button>
              </div>
            </div>
          )}

          {/* Each family unit as a card */}
          {familyUnits.map(unit => (
            <div key={unit.id} className={styles['setting-card']} style={{ marginBottom: 12, border: '2px solid #e5e7eb' }}>
              {/* Unit header */}
              {editingUnitId === unit.id ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                  <input
                    type="text"
                    value={editUnitName}
                    onChange={(e) => setEditUnitName(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.95rem', fontWeight: 600 }}
                  />
                  <button
                    className={styles['data-btn']}
                    style={{ background: '#ede9fe', color: '#7c3aed' }}
                    onClick={() => handleUpdateUnit(unit.id)}
                    disabled={unitBusy || !editUnitName.trim()}
                  >{unitBusy ? '…' : 'Save'}</button>
                  <button className={styles['data-btn']} onClick={() => setEditingUnitId(null)}>Cancel</button>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ flex: 1, fontWeight: 700, fontSize: '1rem' }}>{unit.name}</div>
                  {unit.isOwner && isAdmin && (
                    <>
                      <button
                        className={styles['data-btn']}
                        style={{ background: '#ede9fe', color: '#7c3aed', fontSize: '0.72rem', marginRight: 4 }}
                        onClick={() => {
                          setEditingUnitId(unit.id)
                          setEditUnitName(unit.name)
                          setEditUnitKids(unit.kidProfileIds || [])
                        }}
                      >Edit</button>
                      <button
                        onClick={() => handleDeleteUnit(unit.id)}
                        title="Delete unit"
                        style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', border: 'none', cursor: 'pointer' }}
                      >✕</button>
                    </>
                  )}
                  {!unit.isOwner && (
                    <span style={{ fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: '#dbeafe', color: '#1d4ed8' }}>Guardian</span>
                  )}
                </div>
              )}

              {/* Edit unit kids */}
              {editingUnitId === unit.id && unit.isOwner && ownKidProfiles.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Children in this unit:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {ownKidProfiles.map(kid => {
                      const selected = editUnitKids.includes(kid.id)
                      return (
                        <button
                          key={kid.id}
                          type="button"
                          onClick={() => setEditUnitKids(prev => selected ? prev.filter(k => k !== kid.id) : [...prev, kid.id])}
                          style={{
                            padding: '4px 12px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
                            border: '2px solid', cursor: 'pointer',
                            background: selected ? '#ede9fe' : '#f9fafb',
                            borderColor: selected ? '#a78bfa' : '#e5e7eb',
                            color: selected ? '#7c3aed' : '#6b7280',
                          }}
                        >{kid.avatar_emoji} {kid.display_name}</button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Members list */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {unit.members.map((member, idx) => (
                  <div key={member.profile.id || idx} className={styles['item-row']} style={{ padding: '4px 0' }}>
                    <span style={{ fontSize: '1.2rem' }}>{member.profile.avatar_emoji || (member.type === 'adult' ? '👤' : '💃')}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{member.profile.display_name || (member.type === 'adult' ? 'Parent' : 'Dancer')}</div>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{member.relationship}</div>
                    </div>
                    {member.guardianId && unit.isOwner && (
                      <button
                        onClick={() => handleRevokeGuardian(member.guardianId)}
                        title="Remove"
                        style={{ background: 'none', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px', lineHeight: 1 }}
                      >✕</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Pending invites for this unit */}
              {unit.pendingInvites && unit.pendingInvites.length > 0 && (
                <div style={{ marginTop: 8, borderTop: '1px solid #f3f4f6', paddingTop: 8 }}>
                  <div style={{ fontSize: '0.72rem', fontWeight: 600, color: '#9ca3af', marginBottom: 4 }}>Pending Invites</div>
                  {unit.pendingInvites.map(g => (
                    <div key={g.id} className={styles['item-row']} style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: '0.82rem', flex: 1 }}>🔗 Invite link</span>
                      <button
                        onClick={() => handleRevokeGuardian(g.id)}
                        title="Remove"
                        style={{ background: 'none', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px', lineHeight: 1 }}
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Invite someone to this unit */}
              {unit.isOwner && isAdmin && (
                <div style={{ marginTop: 10, borderTop: '1px solid #f3f4f6', paddingTop: 10 }}>
                  <button
                    className={styles['data-btn']}
                    style={{ background: '#f0e6ff', color: '#7c3aed', fontSize: '0.78rem' }}
                    onClick={(e) => handleCreateGuardian(e, unit.id)}
                    disabled={guardianBusy}
                  >{guardianBusy && invitingUnitId === unit.id ? 'Creating…' : '🔗 Invite Adult'}</button>
                  {invitingUnitId === unit.id && guardianLink && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', border: '1px solid #bbf7d0', marginTop: 8 }}>
                      <input
                        readOnly
                        value={guardianLink}
                        style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#166534', outline: 'none' }}
                        onClick={(e) => e.target.select()}
                      />
                      <button
                        onClick={handleCopyGuardianLink}
                        style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                      >Copy</button>
                    </div>
                  )}
                  {invitingUnitId === unit.id && guardianMsg && (
                    <div style={{ fontSize: '0.78rem', color: guardianMsg.type === 'error' ? '#dc2626' : '#16a34a', marginTop: 4 }}>
                      {guardianMsg.text}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}

          {/* Create new family unit */}
          {isAdmin && (
            <div className={styles['setting-card']} style={{ marginBottom: 12 }}>
              {creatingUnit ? (
                <div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 8 }}>New Family Unit</div>
                  <input
                    type="text"
                    placeholder="Unit name (e.g. Main Family)"
                    value={newUnitName}
                    onChange={(e) => setNewUnitName(e.target.value)}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.95rem', marginBottom: 10, boxSizing: 'border-box' }}
                  />
                  {ownKidProfiles.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: '0.78rem', color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Children in this unit:</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {ownKidProfiles.map(kid => {
                          const selected = newUnitKids.includes(kid.id)
                          return (
                            <button
                              key={kid.id}
                              type="button"
                              onClick={() => setNewUnitKids(prev => selected ? prev.filter(k => k !== kid.id) : [...prev, kid.id])}
                              style={{
                                padding: '4px 12px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
                                border: '2px solid', cursor: 'pointer',
                                background: selected ? '#ede9fe' : '#f9fafb',
                                borderColor: selected ? '#a78bfa' : '#e5e7eb',
                                color: selected ? '#7c3aed' : '#6b7280',
                              }}
                            >{kid.avatar_emoji} {kid.display_name}</button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      className={styles['add-btn']}
                      onClick={handleCreateUnit}
                      disabled={unitBusy || !newUnitName.trim()}
                    >{unitBusy ? 'Creating…' : 'Create Unit'}</button>
                    <button className={styles['data-btn']} onClick={() => { setCreatingUnit(false); setNewUnitName(''); setNewUnitKids([]) }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  className={styles['add-btn']}
                  onClick={() => setCreatingUnit(true)}
                  style={{ width: '100%' }}
                >+ Create Family Unit</button>
              )}
            </div>
          )}

          {/* Incoming guardian invites (someone invited ME) */}
          {incomingGuardians.filter(g => g.status === 'pending').length > 0 && (
            <div className={styles['setting-card']} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Pending Invites</div>
              {incomingGuardians.filter(g => g.status === 'pending').map(g => (
                <div key={g.id} className={styles['item-row']} style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: '0.88rem', flex: 1 }}>Family invite</span>
                  <button
                    onClick={() => handleAcceptGuardian(g.id)}
                    style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                  >Accept</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sharing */}
      {hasSupabaseAuth && authUser && isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Share a Dance</h3>
          <div className={styles['setting-card']}>
            {/* Invite form */}
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              Share a specific dance with another parent or guardian
            </div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: 12, lineHeight: 1.4 }}>
              Generate a link to share a dance routine. They'll only be able to see that dance and any of their children assigned to it.
            </div>
            <form onSubmit={handleCreateShare} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={shareRoutineId}
                  onChange={(e) => setShareRoutineId(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.85rem' }}
                >
                  <option value="">Select a dance…</option>
                  {routines.map(r => (
                    <option key={r.id} value={r.id}>{r.name}</option>
                  ))}
                </select>
                <button
                  type="submit"
                  className={styles['add-btn']}
                  disabled={shareBusy}
                  style={{ whiteSpace: 'nowrap' }}
                >
                  {shareBusy ? 'Creating…' : '🔗 Generate Link'}
                </button>
              </div>
              {shareLink && (
                <div>
                  <div style={{ fontSize: '0.78rem', color: '#6b7280', marginBottom: 6 }}>
                    ✓ Link created! Copy and share it with the other parent/guardian:
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', border: '1px solid #bbf7d0' }}>
                    <input
                      readOnly
                      value={shareLink}
                      style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#166534', outline: 'none' }}
                      onClick={(e) => e.target.select()}
                    />
                    <button
                      type="button"
                      onClick={() => handleCopyShareLink(shareLink)}
                      style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {shareMsg && (
                <div style={{ fontSize: '0.85rem', color: shareMsg.type === 'error' ? '#dc2626' : '#16a34a', fontWeight: 500 }}>
                  {shareMsg.text}
                </div>
              )}
            </form>

            {/* Outgoing shares */}
            {outgoingShares.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Sent Invites</div>
                {outgoingShares.map(share => {
                  const routine = share.routine_id ? routines.find(r => r.id === share.routine_id) : null
                  return (
                    <div key={share.id} className={styles['item-row']} style={{ marginBottom: 4, alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem', flex: 1 }}>
                        {share.status === 'accepted' ? '✅' : '🔗'} {share.invited_email || (share.invite_token ? 'Invite link' : 'Pending')}
                        {routine && <span style={{ color: '#6b7280' }}> — {routine.name}</span>}
                      </span>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: share.status === 'accepted' ? '#dcfce7' : share.status === 'revoked' ? '#fee2e2' : '#fef3c7',
                        color: share.status === 'accepted' ? '#166534' : share.status === 'revoked' ? '#dc2626' : '#92400e',
                      }}>
                        {share.status}
                      </span>
                      {share.status === 'pending' && share.invite_token && (
                        <button
                          onClick={() => handleCopyShareLink(`${window.location.origin}${window.location.pathname}?share=${share.invite_token}`)}
                          style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Copy Link
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteShare(share.id)}
                        title="Remove share"
                        style={{ background: 'none', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: '1.1rem', padding: '2px 6px', lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Incoming shares (invites TO me) */}
            {incomingShares.length > 0 && (
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Invites Received</div>
                {incomingShares.map(share => (
                  <div key={share.id} className={styles['item-row']} style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '0.88rem', flex: 1 }}>
                      From {share.dance?.name || 'a dancer'}
                    </span>
                    <span style={{
                      fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: share.status === 'accepted' ? '#dcfce7' : '#fef3c7',
                      color: share.status === 'accepted' ? '#166534' : '#92400e',
                    }}>
                      {share.status}
                    </span>
                    {share.status === 'pending' && (
                      <button
                        onClick={() => handleAcceptShare(share.id)}
                        style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 10px', fontSize: '0.8rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Accept
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Disciplines (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Disciplines</h3>
          <div className={styles['setting-card']}>
            {disciplines.map((disc) => (
              <div key={disc.id} className={styles['item-row']}>
                <select
                  value={disc.icon}
                  onChange={(e) => editDiscipline(disc.id, { icon: e.target.value })}
                  style={{ width: 50, fontSize: '1.2rem', textAlign: 'center', border: 'none', background: 'transparent' }}
                >
                  {DISCIPLINE_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
                </select>
                <input
                  type="text"
                  value={disc.name}
                  onChange={(e) => editDiscipline(disc.id, { name: e.target.value })}
                  style={{ flex: 1, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <select
                  value={disc.currentGrade}
                  onChange={(e) => editDiscipline(disc.id, { currentGrade: e.target.value })}
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
            {routines.map((rtn) => (
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
                  onChange={(e) => editRoutine(rtn.id, { name: e.target.value })}
                  style={{ flex: 1, minWidth: 120, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <select
                  value={rtn.disciplineId || ''}
                  onChange={(e) => editRoutine(rtn.id, { disciplineId: e.target.value })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="">No discipline</option>
                  {disciplines.map((d) => <option key={d.id} value={d.id}>{d.icon} {d.name}</option>)}
                </select>
                <select
                  value={rtn.formation || 'solo'}
                  onChange={(e) => editRoutine(rtn.id, { formation: e.target.value })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="solo">Solo</option>
                  <option value="duet">Duet</option>
                  <option value="trio">Trio</option>
                  <option value="group">Group</option>
                </select>
                <select
                  value={rtn.type || 'exam'}
                  onChange={(e) => editRoutine(rtn.id, { type: e.target.value })}
                  style={{ fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  <option value="exam">Exam</option>
                  <option value="show">Show</option>
                  <option value="freestyle">Freestyle</option>
                </select>
                <button
                  type="button"
                  onClick={() => handleOpenCoverPicker(rtn.id)}
                  style={{ fontSize: '0.8rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer' }}
                >
                  📸 Cover
                </button>
                <button onClick={() => handleDeleteRoutine(rtn.id)} title="Delete" style={{ background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
                {/* Kid assignment chips */}
                {kidProfiles.length > 0 && (
                  <div style={{ width: '100%', display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: rtn.coverPhoto ? 56 : 0 }}>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', alignSelf: 'center' }}>Dancers:</span>
                    {kidProfiles.map(kid => {
                      const assigned = (rtn.kidProfileIds || []).includes(kid.id)
                      return (
                        <button
                          key={kid.id}
                          onClick={() => handleToggleKidOnRoutine(rtn.id, kid.id)}
                          style={{
                            padding: '3px 10px', borderRadius: 20, fontSize: '0.78rem', fontWeight: 600,
                            border: assigned ? '2px solid #7c3aed' : '1px solid #d1d5db',
                            background: assigned ? '#ede9fe' : '#f9fafb',
                            color: assigned ? '#7c3aed' : '#6b7280',
                            cursor: 'pointer',
                          }}
                        >
                          {kid.avatar_emoji} {kid.display_name}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
            <button className={styles['add-btn']} onClick={handleAddRoutine}>+ Add Routine</button>
          </div>
        </div>
      )}

      <input
        ref={coverUploadInputRef}
        type="file"
        accept="image/*"
        onChange={handleCoverPickerFileInput}
        style={{ display: 'none' }}
      />

      <MediaPickerDialog
        open={Boolean(coverPickerRoutineId)}
        title="📸 Routine Cover"
        uploadLabel={coverUploadBusy
          ? `⏳ Processing${Number.isFinite(coverUploadProgress) ? ` (${coverUploadProgress}%)` : ''}`
          : '📁 Upload new cover'}
        onClose={handleCloseCoverPicker}
        onUpload={handleCoverDialogUploadClick}
        uploadDisabled={coverUploadBusy}
        uploadStatus={coverUploadStatus}
        uploadProgress={coverUploadProgress}
        subtitle="Or pick existing images"
        loading={coverPickerLoading}
        error={coverPickerError}
        emptyText="No images found in your media folder."
        items={coverMediaItems}
        selectingId={coverPickerApplyingKey}
        onSelect={(item) => handleSelectCoverFromMedia(coverPickerRoutineId, item.key || item.id)}
        getItemId={(item) => item.key || item.id}
        listClassName={styles['cover-media-grid']}
        renderItem={({ item, itemId, isSelecting, onSelect }) => (
          <button
            key={itemId}
            type="button"
            className={styles['cover-media-card']}
            onClick={onSelect}
            disabled={isSelecting}
            title={item.fileName || item.key || item.id}
          >
            {coverPreviewUrls[itemId] ? (
              <img
                src={coverPreviewUrls[itemId]}
                alt={item.fileName || 'Cover image'}
                className={styles['cover-media-thumb']}
              />
            ) : (
              <div className={styles['cover-media-thumb']} />
            )}
            <div className={styles['cover-media-name']}>
              {isSelecting ? 'Applying…' : (item.fileName || item.key || item.id)}
            </div>
          </button>
        )}
        getMetaText={null}
        getPrimaryText={null}
      />

      {/* Competitions (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Competitions</h3>
          <div className={styles['setting-card']}>
            {events
              .filter((show) => (show.eventType || 'show') !== 'show')
              .map((show) => (
              <div key={show.id} className={styles['item-row']} style={{ flexWrap: 'wrap', rowGap: 8 }}>
                <select
                  value={show.eventType || 'qualifier'}
                  onChange={(e) => editShow(show.id, { eventType: e.target.value })}
                  style={{ flex: '1 1 200px', minWidth: 180, fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  {EVENT_TYPES.filter((opt) => opt.value !== 'show').map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={show.name}
                  onChange={(e) => editShow(show.id, { name: e.target.value })}
                  style={{ flex: '2 1 260px', minWidth: 180, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <div style={{ display: 'flex', gap: 8, flex: '1 1 280px', minWidth: 220 }}>
                  <input
                    type="date"
                    value={show.startDate || show.date || ''}
                    onChange={(e) => editShow(show.id, { startDate: e.target.value, date: e.target.value })}
                    style={{ flex: 1, minWidth: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                  />
                  <input
                    type="date"
                    value={show.endDate || ''}
                    onChange={(e) => editShow(show.id, { endDate: e.target.value })}
                    style={{ flex: 1, minWidth: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                  />
                </div>
                <input
                  type="text"
                  value={show.venue || ''}
                  placeholder="Venue"
                  onChange={(e) => editShow(show.id, { venue: e.target.value })}
                  style={{ flex: '2 1 320px', minWidth: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                />
                <button onClick={() => handleDeleteShow(show.id)} title="Delete" style={{ marginLeft: 'auto', background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            {events.filter((show) => (show.eventType || 'show') !== 'show').length === 0 && (
              <div style={{ fontSize: '0.82rem', color: '#6b7280' }}>
                No competitions yet.
              </div>
            )}
            <button className={styles['add-btn']} onClick={handleAddShow}>+ Add Competition</button>
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
            <strong>iPad setup:</strong> Open this app in Safari, tap Share, then choose <em>Add to Home Screen</em>. Use that home-screen icon each time so My Dancing keeps the same saved data.
          </div>
        </div>
      </div>
    </div>
  )
}
