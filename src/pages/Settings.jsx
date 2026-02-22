import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { generateId } from '../utils/helpers'
import { fetchStateFromBackend } from '../utils/backendApi'
import { GRADE_LEVELS } from '../data/defaultState'
import { EVENT_TYPES } from '../data/aedEvents'
import styles from './Settings.module.css'

const DISCIPLINE_ICONS = ['🩰', '👞', '💃', '🎭', '🤸', '🕺', '✨', '🌟']
const AVATAR_EMOJIS = ['👤', '💃', '🩰', '👧', '👦', '🧒', '🌟', '✨', '🦋', '🎀', '🕺', '🤸']

export default function Settings() {
  const {
    state, dispatch, isAdmin, hasSupabaseAuth, authUser, signOut,
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
    const routine = state.routines.find(r => r.id === routineId)
    if (!routine) return
    const current = routine.kidProfileIds || []
    const updated = current.includes(kidId)
      ? current.filter(id => id !== kidId)
      : [...current, kidId]
    dispatch({ type: 'UPDATE_ROUTINE', payload: { id: routineId, kidProfileIds: updated } })
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

  // ---- Competitions / Events ----
  const handleAddShow = () => {
    dispatch({
      type: 'ADD_SHOW',
      payload: {
        id: generateId('show'),
        name: 'New Competition',
        date: new Date().toISOString().split('T')[0],
        eventType: 'qualifier',
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
                  {state.routines.map(r => (
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
                  const routine = share.routine_id ? state.routines.find(r => r.id === share.routine_id) : null
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

      {/* Competitions (admin only) */}
      {isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Competitions</h3>
          <div className={styles['setting-card']}>
            {state.shows
              .filter((show) => (show.eventType || 'show') !== 'show')
              .map((show) => (
              <div key={show.id} className={styles['item-row']} style={{ flexWrap: 'wrap', rowGap: 8 }}>
                <select
                  value={show.eventType || 'qualifier'}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, eventType: e.target.value } })}
                  style={{ flex: '1 1 200px', minWidth: 180, fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}
                >
                  {EVENT_TYPES.filter((opt) => opt.value !== 'show').map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.icon} {opt.label}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={show.name}
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, name: e.target.value } })}
                  style={{ flex: '2 1 260px', minWidth: 180, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.9rem' }}
                />
                <div style={{ display: 'flex', gap: 8, flex: '1 1 280px', minWidth: 220 }}>
                  <input
                    type="date"
                    value={show.startDate || show.date || ''}
                    onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, startDate: e.target.value, date: e.target.value } })}
                    style={{ flex: 1, minWidth: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                  />
                  <input
                    type="date"
                    value={show.endDate || ''}
                    onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, endDate: e.target.value } })}
                    style={{ flex: 1, minWidth: 120, padding: '6px 8px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                  />
                </div>
                <input
                  type="text"
                  value={show.venue || ''}
                  placeholder="Venue"
                  onChange={(e) => dispatch({ type: 'UPDATE_SHOW', payload: { id: show.id, venue: e.target.value } })}
                  style={{ flex: '2 1 320px', minWidth: 200, padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e5e5', fontSize: '0.82rem' }}
                />
                <button onClick={() => handleDeleteShow(show.id)} title="Delete" style={{ marginLeft: 'auto', background: '#fee2e2', color: '#dc2626', borderRadius: '50%', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem' }}>✕</button>
              </div>
            ))}
            {state.shows.filter((show) => (show.eventType || 'show') !== 'show').length === 0 && (
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
