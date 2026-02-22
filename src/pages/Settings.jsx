import { useState, useRef } from 'react'
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
    userProfile, kidProfiles, saveUserProfile, addKidProfile, editKidProfile, removeKidProfile,
    // Shares
    outgoingShares, incomingShares, sharedDances,
    createShareInvite, acceptShareInvite, revokeShareInvite, removeShare, loadShares,
    // Guardians
    outgoingGuardians, incomingGuardians,
    createGuardianInvite, acceptGuardianInvite, updateGuardianKids, revokeGuardianInvite, removeGuardian,
  } = useApp()
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
  const [guardianRole, setGuardianRole] = useState('co-parent')
  const [guardianKids, setGuardianKids] = useState([])
  const [guardianBusy, setGuardianBusy] = useState(false)
  const [guardianMsg, setGuardianMsg] = useState(null)
  const [guardianLink, setGuardianLink] = useState(null)

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
      const res = await fetchStateFromBackend()
      if (!res?.danceData?.id) throw new Error('No dance data found to share.')
      const share = await createShareInvite({
        danceId: res.danceData.id,
        routineId: shareRoutineId || null,
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

  const handleRevokeShare = async (shareId) => {
    try {
      await revokeShareInvite(shareId)
    } catch (err) {
      alert(err?.message || 'Could not revoke invite')
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
  const handleCreateGuardian = async (e) => {
    e.preventDefault()
    setGuardianBusy(true)
    setGuardianMsg(null)
    setGuardianLink(null)
    try {
      const guardian = await createGuardianInvite({
        kidProfileIds: guardianKids,
        role: guardianRole,
      })
      setGuardianKids([])
      const link = `${window.location.origin}${window.location.pathname}?invite=${guardian.invite_token}`
      setGuardianLink(link)
      setGuardianMsg({ type: 'success', text: 'Invite link created! Share it with the other parent.' })
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

  const handleToggleGuardianKid = async (guardianId, kidId, currentKids) => {
    const updated = currentKids.includes(kidId)
      ? currentKids.filter(k => k !== kidId)
      : [...currentKids, kidId]
    try {
      await updateGuardianKids(guardianId, updated)
    } catch (err) {
      alert(err?.message || 'Could not update kids')
    }
  }

  const handleRevokeGuardian = async (id) => {
    try {
      await revokeGuardianInvite(id)
    } catch (err) {
      alert(err?.message || 'Could not revoke guardian')
    }
  }

  const handleDeleteGuardian = async (id) => {
    try {
      await removeGuardian(id)
    } catch (err) {
      alert(err?.message || 'Could not delete guardian')
    }
  }

  const toggleGuardianKidSelection = (kidId) => {
    setGuardianKids(prev =>
      prev.includes(kidId) ? prev.filter(k => k !== kidId) : [...prev, kidId]
    )
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
      <h1>Settings ⚙️</h1>

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

      {/* Profiles */}
      {hasSupabaseAuth && authUser && (
        <div className={styles['settings-section']}>
          <h3>Profiles</h3>
          <div className={styles['setting-card']}>
            {/* Parent profile */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Your Profile (Parent)</div>
              {editingProfile ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
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
                    >
                      {profileBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button className={styles['data-btn']} onClick={() => setEditingProfile(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '1.4rem' }}>{userProfile?.avatar_emoji || '👤'}</span>
                  <span style={{ fontWeight: 600 }}>{userProfile?.display_name || 'Not set'}</span>
                  <button
                    className={styles['data-btn']}
                    style={{ marginLeft: 'auto', background: '#ede9fe', color: '#7c3aed' }}
                    onClick={() => {
                      setProfileName(userProfile?.display_name || '')
                      setProfileEmoji(userProfile?.avatar_emoji || '👤')
                      setEditingProfile(true)
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}
            </div>

            {/* Kid profiles */}
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Children / Dancers</div>
              {kidProfiles.map((kid) => (
                <div key={kid.id} style={{ marginBottom: 6 }}>
                  {editingKidId === kid.id ? (
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
                      >
                        {profileBusy ? '…' : 'Save'}
                      </button>
                      <button className={styles['data-btn']} onClick={() => setEditingKidId(null)}>Cancel</button>
                    </div>
                  ) : (
                    <div className={styles['item-row']}>
                      <span style={{ fontSize: '1.3rem' }}>{kid.avatar_emoji || '💃'}</span>
                      <span style={{ flex: 1, fontWeight: 600 }}>{kid.display_name || 'Dancer'}</span>
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
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
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
                >
                  + Add Child
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sharing */}
      {hasSupabaseAuth && authUser && isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Share This Dance</h3>
          <div className={styles['setting-card']}>
            {/* Invite form */}
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>
              Invite a parent or guardian to view this dance
            </div>
            <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: 12, lineHeight: 1.4 }}>
              Generate a one-time link to share this dance routine with another parent or guardian. They'll be able to view the routine without needing an account.
            </div>
            <form onSubmit={handleCreateShare} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={shareRoutineId}
                  onChange={(e) => setShareRoutineId(e.target.value)}
                  style={{ flex: 1, padding: '8px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: '0.85rem' }}
                >
                  <option value="">All routines</option>
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
                    <div key={share.id} className={styles['item-row']} style={{ marginBottom: 4 }}>
                      <span style={{ fontSize: '0.88rem', flex: 1 }}>
                        📧 {share.invited_email || (share.invite_token ? 'Invite link' : 'Pending')}
                        {routine && <span style={{ color: '#6b7280' }}> — {routine.name}</span>}
                        {!share.routine_id && <span style={{ color: '#6b7280' }}> — All routines</span>}
                      </span>
                      <span style={{
                        fontSize: '0.75rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: share.status === 'accepted' ? '#dcfce7' : share.status === 'revoked' ? '#fee2e2' : '#fef3c7',
                        color: share.status === 'accepted' ? '#166534' : share.status === 'revoked' ? '#dc2626' : '#92400e',
                      }}>
                        {share.status}
                      </span>
                      {share.status !== 'revoked' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {share.status === 'pending' && share.invite_token && (
                            <button
                              onClick={() => handleCopyShareLink(`${window.location.origin}${window.location.pathname}?share=${share.invite_token}`)}
                              style={{ background: '#dcfce7', color: '#166534', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                            >
                              Copy Link
                            </button>
                          )}
                          <button
                            onClick={() => handleRevokeShare(share.id)}
                            title="Revoke"
                            style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                          >
                            Revoke
                          </button>
                        </div>
                      )}
                      {share.status === 'revoked' && (
                        <button
                          onClick={() => handleDeleteShare(share.id)}
                          title="Delete"
                          style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '4px 8px', fontSize: '0.75rem', border: 'none', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      )}
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

      {/* Guardians / Co-parents */}
      {hasSupabaseAuth && isAdmin && (
        <div className={styles['settings-section']}>
          <h3>Guardians / Co-parents</h3>
          <div className={styles['setting-card']}>

            {/* Invite a guardian */}
            <form onSubmit={handleCreateGuardian} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 2 }}>Invite a parent or guardian</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <label style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600 }}>Role:</label>
                <select
                  value={guardianRole}
                  onChange={(e) => setGuardianRole(e.target.value)}
                  style={{ padding: '6px 10px', borderRadius: 8, border: '2px solid #e5e5e5', fontSize: '0.85rem' }}
                >
                  <option value="co-parent">Co-parent</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              {kidProfiles.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.82rem', color: '#6b7280', fontWeight: 600, marginBottom: 4 }}>Assign children:</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {kidProfiles.map(kid => {
                      const selected = guardianKids.includes(kid.id)
                      return (
                        <button
                          key={kid.id}
                          type="button"
                          onClick={() => toggleGuardianKidSelection(kid.id)}
                          style={{
                            padding: '4px 12px', borderRadius: 12, fontSize: '0.82rem', fontWeight: 600,
                            border: '2px solid', cursor: 'pointer',
                            background: selected ? '#ede9fe' : '#f9fafb',
                            borderColor: selected ? '#a78bfa' : '#e5e7eb',
                            color: selected ? '#7c3aed' : '#6b7280',
                          }}
                        >
                          {kid.avatar_emoji} {kid.display_name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
              <button
                type="submit"
                disabled={guardianBusy}
                className={styles['data-btn']}
                style={{ background: '#f0e6ff', color: '#7c3aed', alignSelf: 'flex-start' }}
              >
                {guardianBusy ? 'Creating…' : '🔗 Generate Invite Link'}
              </button>
              {guardianLink && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f0fdf4', borderRadius: 8, padding: '8px 12px', border: '1px solid #bbf7d0' }}>
                  <input
                    readOnly
                    value={guardianLink}
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: '0.8rem', color: '#166534', outline: 'none' }}
                    onClick={(e) => e.target.select()}
                  />
                  <button
                    type="button"
                    onClick={handleCopyGuardianLink}
                    style={{ background: '#16a34a', color: '#fff', borderRadius: 6, padding: '4px 12px', fontSize: '0.78rem', border: 'none', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}
                  >
                    Copy
                  </button>
                </div>
              )}
              {guardianMsg && (
                <span style={{ fontSize: '0.82rem', color: guardianMsg.type === 'error' ? '#dc2626' : '#16a34a' }}>
                  {guardianMsg.text}
                </span>
              )}
            </form>

            {/* Outgoing guardian invites */}
            {outgoingGuardians.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Your Guardians</div>
                {outgoingGuardians.map(g => (
                  <div key={g.id} style={{ background: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, flex: 1 }}>
                        👥 {g.guardian_email || (g.invite_token ? 'Invite link' : 'Pending')}
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 6 }}>({g.role})</span>
                      </span>
                      <span style={{
                        fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                        background: g.status === 'accepted' ? '#dcfce7' : g.status === 'revoked' ? '#fee2e2' : '#fef3c7',
                        color: g.status === 'accepted' ? '#166534' : g.status === 'revoked' ? '#dc2626' : '#92400e',
                      }}>
                        {g.status}
                      </span>
                      {g.status !== 'revoked' && (
                        <button
                          onClick={() => handleRevokeGuardian(g.id)}
                          style={{ background: '#fee2e2', color: '#dc2626', borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                        >
                          Revoke
                        </button>
                      )}
                      {g.status === 'revoked' && (
                        <button
                          onClick={() => handleDeleteGuardian(g.id)}
                          style={{ background: '#f3f4f6', color: '#6b7280', borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', border: 'none', cursor: 'pointer' }}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {/* Kid assignment chips (editable for accepted) */}
                    {g.status === 'accepted' && kidProfiles.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {kidProfiles.map(kid => {
                          const assigned = (g.kid_profile_ids || []).includes(kid.id)
                          return (
                            <button
                              key={kid.id}
                              onClick={() => handleToggleGuardianKid(g.id, kid.id, g.kid_profile_ids || [])}
                              style={{
                                padding: '2px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600,
                                border: '2px solid', cursor: 'pointer',
                                background: assigned ? '#ede9fe' : '#f9fafb',
                                borderColor: assigned ? '#a78bfa' : '#e5e7eb',
                                color: assigned ? '#7c3aed' : '#9ca3af',
                              }}
                            >
                              {kid.avatar_emoji} {kid.display_name}
                            </button>
                          )
                        })}
                      </div>
                    )}
                    {/* Show assigned kids for non-accepted */}
                    {g.status !== 'accepted' && (g.kid_profile_ids || []).length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(g.kid_profile_ids || []).map(kidId => {
                          const kid = kidProfiles.find(k => k.id === kidId)
                          return kid ? (
                            <span
                              key={kidId}
                              style={{
                                padding: '2px 10px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 600,
                                background: '#ede9fe', color: '#7c3aed',
                              }}
                            >
                              {kid.avatar_emoji} {kid.display_name}
                            </span>
                          ) : null
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Incoming guardian invites (someone invited ME) */}
            {incomingGuardians.length > 0 && (
              <div>
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: 6 }}>Guardian Invites Received</div>
                {incomingGuardians.map(g => (
                  <div key={g.id} className={styles['item-row']} style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: '0.88rem', flex: 1 }}>
                      From family owner
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: 6 }}>({g.role})</span>
                    </span>
                    <span style={{
                      fontSize: '0.72rem', fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                      background: g.status === 'accepted' ? '#dcfce7' : '#fef3c7',
                      color: g.status === 'accepted' ? '#166534' : '#92400e',
                    }}>
                      {g.status}
                    </span>
                    {g.status === 'pending' && (
                      <button
                        onClick={() => handleAcceptGuardian(g.id)}
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
