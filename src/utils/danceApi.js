/**
 * Normalized dance-data API — talks to the per-entity Supabase tables
 * (discipline, routine, session, event, sticker, etc.) instead of the
 * monolithic dance.state_data JSONB blob.
 *
 * Every write function writes directly to its target table.  RLS policies
 * on each table handle owner / guardian scoping automatically.
 */

import { hasSupabaseConfig, supabase } from './supabaseClient'

// ============ MODULE STATE ============

let _danceOwnerId = null

export function setDanceOwnerId(id) { _danceOwnerId = id || null }
export function getDanceOwnerId()   { return _danceOwnerId }

// ============ HELPERS ============

function ensureClient() {
  if (!hasSupabaseConfig || !supabase) throw new Error('Supabase is not configured.')
  return supabase
}

async function requireUser() {
  const client = ensureClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) throw new Error('Not authenticated.')
  return data.user
}

function ownerId() {
  if (!_danceOwnerId) throw new Error('Dance data not initialized.')
  return _danceOwnerId
}

// ============ MAPPERS  (DB snake_case → client camelCase) ============

function mapDiscipline(r) {
  return {
    id: r.id,
    name: r.name,
    icon: r.icon,
    currentGrade: r.current_grade,
    elements: [],      // filled by fetchDisciplinesWithChildren
    gradeHistory: [],   // filled by fetchDisciplinesWithChildren
  }
}

function mapElement(r) {
  return { id: r.id, disciplineId: r.discipline_id, name: r.name, status: r.status }
}

function mapGrade(r) {
  return {
    id: r.id,
    disciplineId: r.discipline_id,
    grade: r.grade,
    examDate: r.exam_date,
    result: r.result,
    feedback: r.feedback,
  }
}

function mapRoutine(r) {
  return {
    id: r.id,
    name: r.name,
    type: r.routine_type,
    formation: r.formation,
    dancers: r.dancers || [],
    coverPhoto: r.cover_photo || '',
    disciplineId: r.discipline_id,
    kidProfileIds: r.kid_profile_ids || [],
    choreographyVersions: [], // filled by fetchRoutinesWithChildren
    practiceVideos: [],       // filled by fetchRoutinesWithChildren
  }
}

function mapVersion(r) {
  return {
    id: r.id,
    routineId: r.routine_id,
    label: r.label,
    createdAt: r.created_at,
    musicUrl: r.music_url,
    musicFileName: r.music_file_name,
    duration: r.duration,
    songInstructions: r.song_instructions || [],
    cues: r.cues || [],
    videoSyncOffset: r.video_sync_offset,
    videoSyncConfidence: r.video_sync_confidence,
    videoFileName: r.video_file_name,
    videoAnnotations: r.video_annotations || [],
  }
}

function mapPracticeVideo(r) {
  return {
    id: r.id,
    routineId: r.routine_id,
    videoKey: r.video_key,
    videoName: r.video_name,
    dancerNote: r.dancer_note,
    dancerFeeling: r.dancer_feeling,
    recordedAt: r.recorded_at,
  }
}

function mapSession(r) {
  const baseDateTime = r.scheduled_at || r.completed_at || ''
  const derivedDate = typeof baseDateTime === 'string' && baseDateTime.length >= 10
    ? baseDateTime.slice(0, 10)
    : ''
  const derivedStartTime = r.session_start_time
    || r.session_time
    || (typeof r.scheduled_at === 'string' && r.scheduled_at.includes('T') ? r.scheduled_at.slice(11, 16) : '')
  const derivedEndTime = r.session_end_time || ''
  const derivedTime = derivedStartTime

  return {
    id: r.id,
    type: r.session_type,
    status: r.status,
    routineId: r.routine_id,
    disciplineId: r.discipline_id,
    choreographyVersionId: r.choreography_version_id,
    scheduledAt: r.scheduled_at,
    date: derivedDate,
    startTime: derivedStartTime,
    endTime: derivedEndTime,
    time: derivedTime,
    with: r.session_with || '',
    title: 'Practice',
    completedAt: r.completed_at,
    rehearsalVideoKey: r.rehearsal_video_key,
    rehearsalVideoName: r.rehearsal_video_name,
    liveSyncOffsetMs: r.live_sync_offset_ms || 0,
    liveSyncConfidence: r.live_sync_confidence,
    dancerReflection: r.dancer_reflection || { feeling: '', note: '', goals: [] },
    videoAnnotations: r.video_annotations || [],
    emojiReactions: r.emoji_reactions || [],
  }
}

function mapSessionFeedback(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    kidProfileId: r.kid_profile_id,
    dancerReflection: r.dancer_reflection || { feeling: '', note: '', goals: [] },
    videoAnnotations: r.video_annotations || [],
    emojiReactions: r.emoji_reactions || [],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapEvent(r) {
  return {
    id: r.id,
    name: r.name,
    date: r.event_date,
    startDate: r.start_date,
    endDate: r.end_date,
    venue: r.venue,
    eventType: r.event_type,
    competitionOrg: r.competition_org,
    region: r.region,
    place: r.place,
    entries: [],           // filled by fetchEventsWithChildren
    routineIds: [],        // filled by fetchEventsWithChildren
    scrapbookEntries: [],  // filled by fetchEventsWithChildren
  }
}

function mapEventEntry(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    routineId: r.routine_id,
    scheduledDate: r.scheduled_date,
    scheduledTime: r.scheduled_time,
    place: r.place,
    qualified: r.qualified,
    qualifiedForEventId: r.qualified_for_event_id,
    notes: r.notes,
  }
}

function mapScrapbookEntry(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    eventEntryId: r.event_entry_id || null,
    type: r.entry_type,
    content: r.content,
    mediaUrl: r.media_url,
    author: r.author,
    emojiReactions: r.emoji_reactions || [],
    createdAt: r.created_at,
  }
}

function mapSticker(r) {
  return {
    id: r.id,
    type: r.sticker_type,
    label: r.label,
    icon: r.icon,
    earnedDate: r.earned_date,
    isCustom: r.is_custom,
  }
}

function mapDancerProfile(r) {
  return {
    id: r.id,
    name: r.name,
    currentFocus: (r.current_focus_type && r.current_focus_id)
      ? { type: r.current_focus_type, id: r.current_focus_id }
      : null,
  }
}

function mapGoal(r) {
  return {
    id: r.id,
    text: r.goal_text,
    createdDate: r.created_date,
    completedDate: r.completed_date,
  }
}

function mapPracticeReflectionGoal(r) {
  return {
    id: r.id,
    reflectionId: r.reflection_id,
    text: r.goal_text || '',
    sortOrder: Number.isFinite(r.sort_order) ? r.sort_order : 0,
    masteredAt: r.mastered_at || null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapPracticeReflectionCheckin(r) {
  return {
    id: r.id,
    sessionId: r.session_id,
    kidProfileId: r.kid_profile_id || null,
    priorGoalId: r.prior_goal_id,
    rating: Number(r.rating) || 0,
    note: r.note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

function mapPracticeReflection(r, goals = [], checkins = []) {
  return {
    id: r.id,
    sessionId: r.session_id,
    kidProfileId: r.kid_profile_id || null,
    routineId: r.routine_id,
    reflectionNote: r.reflection_note || '',
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    goals,
    checkins,
  }
}

function mapDancerDiscipline(r) {
  return {
    id: r.id,
    kidProfileId: r.kid_profile_id,
    name: r.discipline_name,
    icon: r.discipline_icon || '💃',
    currentGrade: r.current_grade || '',
    startedOn: r.started_on || null,
  }
}

function mapDancerJourneyEvent(r) {
  return {
    id: r.id,
    kidProfileId: r.kid_profile_id,
    disciplineId: r.dancer_discipline_id,
    eventType: r.event_type,
    title: r.title,
    details: r.details || '',
    eventDate: r.event_date,
    examName: r.exam_name || '',
    examGrade: r.exam_grade || '',
    examResult: r.exam_result || '',
    status: r.status || '',
  }
}

function mapSettings(r) {
  if (!r) return { dancerName: 'My Dancing', themeColor: '#a855f7', promptLeadMs: 200 }
  return {
    dancerName: r.dancers?.[0] || r.name || 'My Dancing',
    themeColor: r.theme_color || '#a855f7',
    promptLeadMs: r.prompt_lead_ms ?? 200,
  }
}


// ================================================================
// INITIALIZATION — determine owner + migrate from state_data blob
// ================================================================

export async function initializeDanceData() {
  const client = ensureClient()
  const user = await requireUser()

  // 1. Do we already have data in the new tables?
  const { count, error: countErr } = await client
    .from('discipline')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', user.id)
  if (countErr) throw new Error(countErr.message)

  if (count > 0) {
    _danceOwnerId = user.id
    return { source: 'normalized', ownerId: user.id }
  }

  // 2. Unmigrated state_data in the old dance table?
  const { data: ownDance, error: ownErr } = await client
    .from('dance')
    .select('id, owner_id, state_data')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (ownErr) throw new Error(ownErr.message)

  if (ownDance?.state_data && Object.keys(ownDance.state_data).length > 1) {
    await migrateFromStateData(ownDance.state_data, user.id)
    _danceOwnerId = user.id
    return { source: 'migrated', ownerId: user.id }
  }

  // 3. Guardian access — check for normalized data from another owner
  const { data: guardianDisc } = await client
    .from('discipline')
    .select('owner_id')
    .neq('owner_id', user.id)
    .limit(1)

  if (guardianDisc?.length > 0) {
    _danceOwnerId = guardianDisc[0].owner_id
    return { source: 'guardian', ownerId: guardianDisc[0].owner_id }
  }

  // 4. Guardian access to un-migrated dance (owner hasn't logged in yet)
  const { data: guardianDance } = await client
    .from('dance')
    .select('owner_id, state_data')
    .neq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (guardianDance?.[0]?.owner_id) {
    _danceOwnerId = guardianDance[0].owner_id
    return { source: 'guardian-legacy', ownerId: guardianDance[0].owner_id }
  }

  // 5. Brand-new user
  _danceOwnerId = user.id
  return { source: 'new', ownerId: user.id }
}

/**
 * One-time migration: explode the JSONB blob into individual tables.
 * Builds an ID mapping so cross-references (routine→discipline, etc.) survive.
 */
async function migrateFromStateData(state, migrateOwnerId) {
  const client = ensureClient()
  const idMap = {} // oldTextId → newUuid

  // ---- disciplines ----
  for (const disc of (state.disciplines || [])) {
    const { data, error } = await client.from('discipline').insert({
      owner_id: migrateOwnerId,
      name: disc.name || '',
      icon: disc.icon || '💃',
      current_grade: disc.currentGrade || '',
    }).select('id').single()
    if (error) { console.warn('migrate discipline:', error.message); continue }
    idMap[disc.id] = data.id

    for (const el of (disc.elements || [])) {
      const { data: elRow, error: elErr } = await client.from('discipline_element').insert({
        discipline_id: data.id, owner_id: migrateOwnerId,
        name: el.name || '', status: el.status || 'learning',
      }).select('id').single()
      if (!elErr && elRow) idMap[el.id] = elRow.id
    }

    for (const gh of (disc.gradeHistory || [])) {
      await client.from('grade_history').insert({
        discipline_id: data.id, owner_id: migrateOwnerId,
        grade: gh.grade || '', exam_date: gh.examDate || null,
        result: gh.result || '', feedback: gh.feedback || '',
      })
    }
  }

  // ---- routines ----
  for (const r of (state.routines || [])) {
    const discId = r.disciplineId ? (idMap[r.disciplineId] || null) : null
    const { data, error } = await client.from('routine').insert({
      owner_id: migrateOwnerId,
      name: r.name || '',
      routine_type: r.type || 'practice',
      formation: r.formation || 'solo',
      dancers: r.dancers || [],
      cover_photo: r.coverPhoto || '',
      discipline_id: discId,
      kid_profile_ids: r.kidProfileIds || [],
    }).select('id').single()
    if (error) { console.warn('migrate routine:', error.message); continue }
    idMap[r.id] = data.id

    for (const v of (r.choreographyVersions || [])) {
      const { data: vRow, error: vErr } = await client.from('choreography_version').insert({
        routine_id: data.id, owner_id: migrateOwnerId,
        label: v.label || v.versionName || 'v1',
        music_url: v.musicUrl || '', music_file_name: v.musicFileName || '',
        duration: v.duration || 0,
        song_instructions: v.songInstructions || [],
        cues: v.cues || [],
        video_sync_offset: v.videoSyncOffset || 0,
        video_sync_confidence: Number.isFinite(v.videoSyncConfidence) ? v.videoSyncConfidence : null,
        video_file_name: v.videoFileName || '',
        video_annotations: v.videoAnnotations || [],
      }).select('id').single()
      if (!vErr && vRow) idMap[v.id] = vRow.id
    }

    for (const pv of (r.practiceVideos || [])) {
      await client.from('practice_video').insert({
        routine_id: data.id, owner_id: migrateOwnerId,
        video_key: pv.videoKey || pv.key || '',
        video_name: pv.videoName || pv.name || '',
        dancer_note: pv.dancerNote || '', dancer_feeling: pv.dancerFeeling || '',
        recorded_at: pv.recordedAt || pv.date || null,
      })
    }
  }

  // ---- sessions ----
  for (const s of (state.sessions || [])) {
    const { data, error } = await client.from('session').insert({
      owner_id: migrateOwnerId,
      session_type: s.type || 'practice',
      status: s.status || 'scheduled',
      routine_id: s.routineId ? (idMap[s.routineId] || null) : null,
      discipline_id: s.disciplineId ? (idMap[s.disciplineId] || null) : null,
      choreography_version_id: s.choreographyVersionId ? (idMap[s.choreographyVersionId] || null) : null,
      scheduled_at: s.scheduledAt || s.date || '',
      session_start_time: s.startTime || s.time || '',
      session_end_time: s.endTime || '',
      session_time: s.startTime || s.time || '',
      session_with: s.with || '',
      completed_at: s.completedAt || null,
      rehearsal_video_key: s.rehearsalVideoKey || '',
      rehearsal_video_name: s.rehearsalVideoName || '',
      live_sync_offset_ms: s.liveSyncOffsetMs || s.videoSyncOffset || 0,
      live_sync_confidence: Number.isFinite(s.liveSyncConfidence)
        ? s.liveSyncConfidence
        : (Number.isFinite(s.videoSyncConfidence) ? s.videoSyncConfidence : null),
      dancer_reflection: s.dancerReflection || { feeling: '', note: '', goals: [] },
      video_annotations: s.videoAnnotations || [],
      emoji_reactions: s.emojiReactions || [],
    }).select('id').single()
    if (!error && data) idMap[s.id] = data.id
  }

  // ---- events (shows) — pass 1: insert events ----
  for (const ev of (state.shows || [])) {
    const { data, error } = await client.from('event').insert({
      owner_id: migrateOwnerId,
      name: ev.name || 'Untitled Event',
      event_date: ev.date || null,
      start_date: ev.startDate || ev.date || null,
      end_date: ev.endDate || null,
      venue: ev.venue || '',
      event_type: ev.eventType || 'show',
      competition_org: ev.competitionOrg || '',
      region: ev.region || '',
      place: ev.place ?? null,
    }).select('id').single()
    if (!error && data) idMap[ev.id] = data.id
  }

  // ---- events — pass 2: entries + scrapbook ----
  for (const ev of (state.shows || [])) {
    const eventId = idMap[ev.id]
    if (!eventId) continue

    for (const en of (ev.entries || [])) {
      await client.from('event_entry').insert({
        event_id: eventId, owner_id: migrateOwnerId,
        routine_id: en.routineId ? (idMap[en.routineId] || null) : null,
        scheduled_date: en.scheduledDate || null,
        scheduled_time: en.scheduledTime || '',
        place: en.place ?? null,
        qualified: Boolean(en.qualified),
        qualified_for_event_id: en.qualifiedForEventId ? (idMap[en.qualifiedForEventId] || null) : null,
        notes: en.notes || '',
      })
    }

    for (const sc of (ev.scrapbookEntries || [])) {
      await client.from('scrapbook_entry').insert({
        event_id: eventId, owner_id: migrateOwnerId,
        event_entry_id: sc.eventEntryId ? (idMap[sc.eventEntryId] || sc.eventEntryId) : null,
        entry_type: sc.type || 'note',
        content: sc.content || sc.text || '',
        media_url: sc.mediaUrl || sc.url || '',
        author: sc.author || '',
        emoji_reactions: sc.emojiReactions || [],
      })
    }
  }

  // ---- stickers ----
  for (const st of (state.stickers || [])) {
    await client.from('sticker').insert({
      owner_id: migrateOwnerId,
      sticker_type: st.type || 'custom',
      label: st.label || '', icon: st.icon || '⭐',
      earned_date: st.earnedDate || null,
      is_custom: st.type === 'custom',
    })
  }

  // ---- practice log ----
  for (const d of (state.practiceLog || [])) {
    await client.from('practice_log').insert({
      owner_id: migrateOwnerId, practice_date: d,
    }).catch(() => {}) // skip dupes
  }

  // ---- dancer profile + goals ----
  const dp = state.dancerProfile || {}
  await client.from('dancer_profile').upsert({
    owner_id: migrateOwnerId,
    name: dp.name || 'My Dancing',
    current_focus_type: dp.currentFocus?.type || null,
    current_focus_id: dp.currentFocus?.id ? (idMap[dp.currentFocus.id] || dp.currentFocus.id) : null,
  }, { onConflict: 'owner_id' })

  for (const g of (dp.goals || [])) {
    await client.from('dancer_goal').insert({
      owner_id: migrateOwnerId,
      goal_text: g.text || '',
      created_date: g.createdDate || new Date().toISOString().split('T')[0],
      completed_date: g.completedDate || null,
    })
  }

  console.log('[migrateFromStateData] done — mapped', Object.keys(idMap).length, 'IDs')
  return idMap
}


// ================================================================
// DISCIPLINES
// ================================================================

export async function fetchDisciplines() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client
    .from('discipline').select('*')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data || []).map(mapDiscipline)
}

export async function fetchDisciplinesWithChildren() {
  const client = ensureClient()
  await requireUser()
  const [discRows, elemRows, gradeRows] = await Promise.all([
    client.from('discipline').select('*').order('created_at'),
    client.from('discipline_element').select('*').order('created_at'),
    client.from('grade_history').select('*').order('exam_date'),
  ])
  if (discRows.error) throw new Error(discRows.error.message)
  const elems = (elemRows.data || []).map(mapElement)
  const grades = (gradeRows.data || []).map(mapGrade)
  return (discRows.data || []).map(r => {
    const d = mapDiscipline(r)
    d.elements = elems.filter(e => e.disciplineId === d.id)
    d.gradeHistory = grades.filter(g => g.disciplineId === d.id)
    return d
  })
}

export async function createDiscipline({ name, icon, currentGrade }) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('discipline').insert({
    owner_id: ownerId(), name, icon: icon || '💃', current_grade: currentGrade || '',
  }).select().single()
  if (error) throw new Error(error.message)
  return mapDiscipline(data)
}

export async function updateDiscipline(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.icon !== undefined) payload.icon = updates.icon
  if (updates.currentGrade !== undefined) payload.current_grade = updates.currentGrade
  const { data, error } = await client.from('discipline')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapDiscipline(data)
}

export async function deleteDiscipline(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('discipline').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// DISCIPLINE ELEMENTS
// ================================================================

export async function createDisciplineElement(disciplineId, { name, status }) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('discipline_element').insert({
    discipline_id: disciplineId, owner_id: ownerId(),
    name, status: status || 'learning',
  }).select().single()
  if (error) throw new Error(error.message)
  return mapElement(data)
}

export async function updateDisciplineElement(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.status !== undefined) payload.status = updates.status
  const { data, error } = await client.from('discipline_element')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapElement(data)
}

export async function deleteDisciplineElement(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('discipline_element').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// GRADE HISTORY
// ================================================================

export async function createGradeHistoryEntry(disciplineId, { grade, examDate, result, feedback }) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('grade_history').insert({
    discipline_id: disciplineId, owner_id: ownerId(),
    grade, exam_date: examDate || null,
    result: result || '', feedback: feedback || '',
  }).select().single()
  if (error) throw new Error(error.message)
  return mapGrade(data)
}

export async function deleteGradeHistoryEntry(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('grade_history').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// ROUTINES
// ================================================================

export async function fetchRoutines() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client
    .from('routine').select('*')
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data || []).map(mapRoutine)
}

export async function fetchRoutinesWithChildren() {
  const client = ensureClient()
  await requireUser()
  const [rRows, vRows, pvRows] = await Promise.all([
    client.from('routine').select('*').order('created_at'),
    client.from('choreography_version').select('*').order('created_at'),
    client.from('practice_video').select('*').order('created_at'),
  ])
  if (rRows.error) throw new Error(rRows.error.message)
  const versions = (vRows.data || []).map(mapVersion)
  const videos = (pvRows.data || []).map(mapPracticeVideo)
  return (rRows.data || []).map(r => {
    const rt = mapRoutine(r)
    rt.choreographyVersions = versions.filter(v => v.routineId === rt.id)
    rt.practiceVideos = videos.filter(v => v.routineId === rt.id)
    return rt
  })
}

export async function createRoutine({ name, type, formation, dancers, coverPhoto, disciplineId, kidProfileIds }) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('routine').insert({
    owner_id: ownerId(),
    name: name || '',
    routine_type: type || 'practice',
    formation: formation || 'solo',
    dancers: dancers || [],
    cover_photo: coverPhoto || '',
    discipline_id: disciplineId || null,
    kid_profile_ids: kidProfileIds || [],
  }).select().single()
  if (error) throw new Error(error.message)
  const rt = mapRoutine(data)
  rt.choreographyVersions = []
  rt.practiceVideos = []
  return rt
}

export async function updateRoutine(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.type !== undefined) payload.routine_type = updates.type
  if (updates.formation !== undefined) payload.formation = updates.formation
  if (updates.dancers !== undefined) payload.dancers = updates.dancers
  if (updates.coverPhoto !== undefined) payload.cover_photo = updates.coverPhoto || ''
  if (updates.disciplineId !== undefined) payload.discipline_id = updates.disciplineId || null
  if (updates.kidProfileIds !== undefined) payload.kid_profile_ids = updates.kidProfileIds
  const { data, error } = await client.from('routine')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapRoutine(data)
}

export async function deleteRoutine(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('routine').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// CHOREOGRAPHY VERSIONS
// ================================================================

export async function createChoreographyVersion(routineId, fields = {}) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('choreography_version').insert({
    routine_id: routineId, owner_id: ownerId(),
    label: fields.label || 'v1',
    music_url: fields.musicUrl || '',
    music_file_name: fields.musicFileName || '',
    duration: fields.duration || 0,
    song_instructions: fields.songInstructions || [],
    cues: fields.cues || [],
    video_sync_offset: fields.videoSyncOffset || 0,
    video_sync_confidence: Number.isFinite(fields.videoSyncConfidence) ? fields.videoSyncConfidence : null,
    video_file_name: fields.videoFileName || '',
    video_annotations: fields.videoAnnotations || [],
  }).select().single()
  if (error) throw new Error(error.message)
  return mapVersion(data)
}

export async function updateChoreographyVersion(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.label !== undefined) payload.label = updates.label
  if (updates.musicUrl !== undefined) payload.music_url = updates.musicUrl
  if (updates.musicFileName !== undefined) payload.music_file_name = updates.musicFileName
  if (updates.duration !== undefined) payload.duration = updates.duration
  if (updates.songInstructions !== undefined) payload.song_instructions = updates.songInstructions
  if (updates.cues !== undefined) payload.cues = updates.cues
  if (updates.videoSyncOffset !== undefined) payload.video_sync_offset = updates.videoSyncOffset
  if (updates.videoSyncConfidence !== undefined)
    payload.video_sync_confidence = Number.isFinite(updates.videoSyncConfidence)
      ? updates.videoSyncConfidence : null
  if (updates.videoFileName !== undefined) payload.video_file_name = updates.videoFileName
  if (updates.videoAnnotations !== undefined) payload.video_annotations = updates.videoAnnotations
  const { data, error } = await client.from('choreography_version')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapVersion(data)
}

export async function deleteChoreographyVersion(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('choreography_version').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// PRACTICE VIDEOS
// ================================================================

export async function createPracticeVideo(routineId, fields = {}) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('practice_video').insert({
    routine_id: routineId, owner_id: ownerId(),
    video_key: fields.videoKey || '', video_name: fields.videoName || '',
    dancer_note: fields.dancerNote || '', dancer_feeling: fields.dancerFeeling || '',
    recorded_at: fields.recordedAt || null,
  }).select().single()
  if (error) throw new Error(error.message)
  return mapPracticeVideo(data)
}

// ================================================================
// SESSIONS
// ================================================================

export async function fetchSessions() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('session').select('*')
    .order('scheduled_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapSession)
}

export async function createSession(fields) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('session').insert({
    owner_id: ownerId(),
    session_type: fields.type || 'practice',
    status: fields.status || 'scheduled',
    routine_id: fields.routineId || null,
    discipline_id: fields.disciplineId || null,
    choreography_version_id: fields.choreographyVersionId || null,
    scheduled_at: fields.scheduledAt || '',
    session_start_time: fields.startTime || fields.time || '',
    session_end_time: fields.endTime || '',
    session_time: fields.startTime || fields.time || '',
    session_with: fields.with || '',
    completed_at: fields.completedAt || null,
    rehearsal_video_key: fields.rehearsalVideoKey || '',
    rehearsal_video_name: fields.rehearsalVideoName || '',
    live_sync_offset_ms: fields.liveSyncOffsetMs || 0,
    live_sync_confidence: Number.isFinite(fields.liveSyncConfidence) ? fields.liveSyncConfidence : null,
    dancer_reflection: fields.dancerReflection || { feeling: '', note: '', goals: [] },
    video_annotations: fields.videoAnnotations || [],
    emoji_reactions: fields.emojiReactions || [],
  }).select().single()
  if (error) throw new Error(error.message)
  return mapSession(data)
}

export async function updateSession(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.type !== undefined) payload.session_type = updates.type
  if (updates.status !== undefined) payload.status = updates.status
  if (updates.routineId !== undefined) payload.routine_id = updates.routineId || null
  if (updates.disciplineId !== undefined) payload.discipline_id = updates.disciplineId || null
  if (updates.choreographyVersionId !== undefined) payload.choreography_version_id = updates.choreographyVersionId || null
  if (updates.scheduledAt !== undefined) payload.scheduled_at = updates.scheduledAt
  if (updates.startTime !== undefined || updates.time !== undefined) {
    const nextStartTime = updates.startTime !== undefined ? updates.startTime : updates.time
    payload.session_start_time = nextStartTime
    payload.session_time = nextStartTime
  }
  if (updates.endTime !== undefined) payload.session_end_time = updates.endTime
  if (updates.with !== undefined) payload.session_with = updates.with
  if (updates.completedAt !== undefined) payload.completed_at = updates.completedAt
  if (updates.rehearsalVideoKey !== undefined) payload.rehearsal_video_key = updates.rehearsalVideoKey
  if (updates.rehearsalVideoName !== undefined) payload.rehearsal_video_name = updates.rehearsalVideoName
  if (updates.liveSyncOffsetMs !== undefined) payload.live_sync_offset_ms = updates.liveSyncOffsetMs || 0
  if (updates.liveSyncConfidence !== undefined)
    payload.live_sync_confidence = Number.isFinite(updates.liveSyncConfidence)
      ? updates.liveSyncConfidence : null
  if (updates.dancerReflection !== undefined) payload.dancer_reflection = updates.dancerReflection
  if (updates.videoAnnotations !== undefined) payload.video_annotations = updates.videoAnnotations
  if (updates.emojiReactions !== undefined) payload.emoji_reactions = updates.emojiReactions
  const { data, error } = await client.from('session')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapSession(data)
}

export async function fetchSessionFeedback(sessionId, kidProfileId) {
  const client = ensureClient()
  await requireUser()
  if (!sessionId || !kidProfileId) {
    return {
      sessionId: sessionId || null,
      kidProfileId: kidProfileId || null,
      dancerReflection: { feeling: '', note: '', goals: [] },
      videoAnnotations: [],
      emojiReactions: [],
    }
  }

  const { data, error } = await client
    .from('session_feedback')
    .select('*')
    .eq('session_id', sessionId)
    .eq('kid_profile_id', kidProfileId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (data) return mapSessionFeedback(data)

  // Legacy fallback while old session-level feedback data still exists.
  const { data: legacy, error: legacyError } = await client
    .from('session')
    .select('dancer_reflection, video_annotations, emoji_reactions')
    .eq('id', sessionId)
    .maybeSingle()
  if (legacyError) throw new Error(legacyError.message)

  return {
    sessionId,
    kidProfileId,
    dancerReflection: legacy?.dancer_reflection || { feeling: '', note: '', goals: [] },
    videoAnnotations: legacy?.video_annotations || [],
    emojiReactions: legacy?.emoji_reactions || [],
  }
}

export async function upsertSessionFeedback(sessionId, kidProfileId, updates = {}) {
  const client = ensureClient()
  await requireUser()
  if (!sessionId || !kidProfileId) throw new Error('Session and dancer are required.')

  const payload = {
    session_id: sessionId,
    kid_profile_id: kidProfileId,
  }
  if (updates.dancerReflection !== undefined) payload.dancer_reflection = updates.dancerReflection || { feeling: '', note: '', goals: [] }
  if (updates.videoAnnotations !== undefined) payload.video_annotations = updates.videoAnnotations || []
  if (updates.emojiReactions !== undefined) payload.emoji_reactions = updates.emojiReactions || []

  const { data, error } = await client
    .from('session_feedback')
    .upsert(payload, { onConflict: 'session_id,kid_profile_id' })
    .select('*')
    .single()

  if (error) throw new Error(error.message)
  return mapSessionFeedback(data)
}

export async function deleteSession(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('session').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// PRACTICE REFLECTION FLOW
// ================================================================

export async function fetchSessionPracticeReflection(sessionId, kidProfileId = null) {
  const client = ensureClient()
  await requireUser()

  let reflectionQuery = client
    .from('practice_reflection')
    .select('*')
    .eq('session_id', sessionId)

  if (kidProfileId) {
    reflectionQuery = reflectionQuery.eq('kid_profile_id', kidProfileId)
  }

  const { data: reflection, error: reflectionError } = await reflectionQuery.maybeSingle()

  if (reflectionError) throw new Error(reflectionError.message)
  if (!reflection) return null

  const { data: goals, error: goalsError } = await client
    .from('practice_reflection_goal')
    .select('*')
    .eq('reflection_id', reflection.id)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (goalsError) throw new Error(goalsError.message)

  let checkinsQuery = client
    .from('practice_reflection_goal_checkin')
    .select('*')
    .eq('session_id', sessionId)

  if (kidProfileId) {
    checkinsQuery = checkinsQuery.eq('kid_profile_id', kidProfileId)
  }

  const { data: checkins, error: checkinsError } = await checkinsQuery

  if (checkinsError) throw new Error(checkinsError.message)

  return mapPracticeReflection(
    reflection,
    (goals || []).map(mapPracticeReflectionGoal),
    (checkins || []).map(mapPracticeReflectionCheckin)
  )
}

export async function fetchRoutineLivingGoals(routineId, kidProfileId = null) {
  if (!routineId) return []

  const client = ensureClient()
  await requireUser()

  // Get all reflections for this routine
  let reflectionsQuery = client
    .from('practice_reflection')
    .select('id')
    .eq('routine_id', routineId)

  if (kidProfileId) {
    reflectionsQuery = reflectionsQuery.eq('kid_profile_id', kidProfileId)
  }

  const { data: reflections, error: refError } = await reflectionsQuery

  if (refError) throw new Error(refError.message)
  if (!reflections || reflections.length === 0) return []

  const reflectionIds = reflections.map((r) => r.id)

  // Get all active (un-mastered) goals across all reflections for this routine
  const { data: goals, error: goalsError } = await client
    .from('practice_reflection_goal')
    .select('*')
    .in('reflection_id', reflectionIds)
    .is('mastered_at', null)
    .order('created_at', { ascending: true })

  if (goalsError) throw new Error(goalsError.message)
  return (goals || []).map(mapPracticeReflectionGoal)
}

export async function upsertSessionPracticeReflection(sessionId, payload = {}) {
  const client = ensureClient()
  await requireUser()

  const kidProfileId = payload.kidProfileId || null

  if (!kidProfileId) throw new Error('Kid profile is required for session reflections.')

  const { data: reflection, error: reflectionError } = await client
    .from('practice_reflection')
    .upsert({
      session_id: sessionId,
      kid_profile_id: kidProfileId,
      routine_id: payload.routineId || null,
      reflection_note: payload.reflectionNote || '',
    }, { onConflict: 'session_id,kid_profile_id' })
    .select('*')
    .single()

  if (reflectionError) throw new Error(reflectionError.message)

  // Insert only NEW goals added this session (don't delete existing living goals)
  const newGoals = (payload.newGoals || [])
    .map((g) => (typeof g === 'string' ? g.trim() : ''))
    .filter(Boolean)

  if (newGoals.length > 0) {
    const rows = newGoals.map((goalText, index) => ({
      reflection_id: reflection.id,
      goal_text: goalText,
      sort_order: index,
    }))
    const { error: insertGoalsError } = await client
      .from('practice_reflection_goal')
      .insert(rows)
    if (insertGoalsError) throw new Error(insertGoalsError.message)
  }

  // Save goal reactions (1=tough, 2=ok, 3=nailed) and mark mastered
  const reactions = (payload.goalReactions || [])
    .filter((item) => item?.goalId && [1, 2, 3].includes(item.rating))

  if (reactions.length > 0) {
    const checkinRows = reactions.map((item) => ({
      session_id: sessionId,
      kid_profile_id: kidProfileId,
      prior_goal_id: item.goalId,
      rating: item.rating,
      note: '',
    }))

    const { error: checkinError } = await client
      .from('practice_reflection_goal_checkin')
      .upsert(checkinRows, { onConflict: 'session_id,prior_goal_id,kid_profile_id' })
    if (checkinError) throw new Error(checkinError.message)

    // Mark goals with rating 3 as mastered
    const masteredIds = reactions
      .filter((item) => item.rating === 3)
      .map((item) => item.goalId)
    if (masteredIds.length > 0) {
      const { error: masterError } = await client
        .from('practice_reflection_goal')
        .update({ mastered_at: new Date().toISOString() })
        .in('id', masteredIds)
        .is('mastered_at', null)
      if (masterError) throw new Error(masterError.message)
    }
  }

  return fetchSessionPracticeReflection(sessionId, kidProfileId)
}

// savePracticeGoalCheckins is no longer used — reactions are saved inline
// via upsertSessionPracticeReflection. Keeping as a no-op export for safety.
export async function savePracticeGoalCheckins() {
  return []
}

// ================================================================
// EVENTS (shows / competitions / exams)
// ================================================================

export async function fetchEvents() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('event').select('*')
    .order('start_date', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapEvent)
}

export async function fetchEventsWithChildren() {
  const client = ensureClient()
  await requireUser()
  const [evRows, enRows, scRows] = await Promise.all([
    client.from('event').select('*').order('start_date', { ascending: false }),
    client.from('event_entry').select('*').order('created_at'),
    client.from('scrapbook_entry').select('*').order('created_at'),
  ])
  if (evRows.error) throw new Error(evRows.error.message)
  const entries = (enRows.data || []).map(mapEventEntry)
  const scraps = (scRows.data || []).map(mapScrapbookEntry)
  return (evRows.data || []).map(r => {
    const ev = mapEvent(r)
    ev.entries = entries.filter(e => e.eventId === ev.id)
    ev.routineIds = [...new Set(ev.entries.map(e => e.routineId).filter(Boolean))]
    ev.scrapbookEntries = scraps.filter(s => s.eventId === ev.id)
    return ev
  })
}

export async function createEvent(fields) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('event').insert({
    owner_id: ownerId(),
    name: fields.name || 'Untitled Event',
    event_date: fields.date || null,
    start_date: fields.startDate || fields.date || null,
    end_date: fields.endDate || null,
    venue: fields.venue || '',
    event_type: fields.eventType || 'show',
    competition_org: fields.competitionOrg || '',
    region: fields.region || '',
    place: fields.place ?? null,
  }).select().single()
  if (error) throw new Error(error.message)
  const ev = mapEvent(data)
  ev.entries = []
  ev.routineIds = []
  ev.scrapbookEntries = []
  return ev
}

export async function updateEvent(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.name !== undefined) payload.name = updates.name
  if (updates.date !== undefined) payload.event_date = updates.date
  if (updates.startDate !== undefined) payload.start_date = updates.startDate
  if (updates.endDate !== undefined) payload.end_date = updates.endDate
  if (updates.venue !== undefined) payload.venue = updates.venue
  if (updates.eventType !== undefined) payload.event_type = updates.eventType
  if (updates.competitionOrg !== undefined) payload.competition_org = updates.competitionOrg
  if (updates.region !== undefined) payload.region = updates.region
  if (updates.place !== undefined) payload.place = updates.place
  const { data, error } = await client.from('event')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapEvent(data)
}

export async function deleteEvent(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('event').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// EVENT ENTRIES
// ================================================================

export async function createEventEntry(eventId, fields) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('event_entry').insert({
    event_id: eventId, owner_id: ownerId(),
    routine_id: fields.routineId || null,
    scheduled_date: fields.scheduledDate || null,
    scheduled_time: fields.scheduledTime || '',
    place: fields.place ?? null,
    qualified: Boolean(fields.qualified),
    qualified_for_event_id: fields.qualifiedForEventId || null,
    notes: fields.notes || '',
  }).select().single()
  if (error) throw new Error(error.message)
  return mapEventEntry(data)
}

export async function updateEventEntry(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.routineId !== undefined) payload.routine_id = updates.routineId
  if (updates.scheduledDate !== undefined) payload.scheduled_date = updates.scheduledDate
  if (updates.scheduledTime !== undefined) payload.scheduled_time = updates.scheduledTime
  if (updates.place !== undefined) payload.place = updates.place
  if (updates.qualified !== undefined) payload.qualified = Boolean(updates.qualified)
  if (updates.qualifiedForEventId !== undefined) payload.qualified_for_event_id = updates.qualifiedForEventId || null
  if (updates.notes !== undefined) payload.notes = updates.notes
  const { data, error } = await client.from('event_entry')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapEventEntry(data)
}

export async function deleteEventEntry(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('event_entry').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// SCRAPBOOK ENTRIES
// ================================================================

export async function createScrapbookEntry(eventId, fields) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('scrapbook_entry').insert({
    event_id: eventId, owner_id: ownerId(),
    event_entry_id: fields.eventEntryId || null,
    entry_type: fields.type || 'note',
    content: fields.content || '', media_url: fields.mediaUrl || '',
    author: fields.author || '',
    emoji_reactions: fields.emojiReactions || [],
  }).select().single()
  if (error) throw new Error(error.message)
  return mapScrapbookEntry(data)
}

export async function updateScrapbookEntry(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.emojiReactions !== undefined) payload.emoji_reactions = updates.emojiReactions
  if (updates.content !== undefined) payload.content = updates.content
  if (updates.eventEntryId !== undefined) payload.event_entry_id = updates.eventEntryId || null
  const { data, error } = await client.from('scrapbook_entry')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapScrapbookEntry(data)
}

export async function deleteScrapbookEntry(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('scrapbook_entry').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// STICKERS
// ================================================================

export async function fetchStickers() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('sticker').select('*')
    .eq('owner_id', ownerId()).order('created_at')
  if (error) throw new Error(error.message)
  return (data || []).map(mapSticker)
}

export async function createSticker(fields) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('sticker').insert({
    owner_id: ownerId(),
    sticker_type: fields.type || 'custom',
    label: fields.label || '', icon: fields.icon || '⭐',
    earned_date: fields.earnedDate || null,
    is_custom: fields.type === 'custom',
  }).select().single()
  if (error) throw new Error(error.message)
  return mapSticker(data)
}

export async function createStickers(arr) {
  const client = ensureClient()
  await requireUser()
  const id = ownerId()
  const rows = arr.map(s => ({
    owner_id: id,
    sticker_type: s.type || 'custom',
    label: s.label || '', icon: s.icon || '⭐',
    earned_date: s.earnedDate || null,
    is_custom: s.type === 'custom',
  }))
  const { data, error } = await client.from('sticker').insert(rows).select()
  if (error) throw new Error(error.message)
  return (data || []).map(mapSticker)
}

// ================================================================
// PRACTICE LOG
// ================================================================

export async function fetchPracticeLog() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('practice_log').select('practice_date')
    .eq('owner_id', ownerId()).order('practice_date')
  if (error) throw new Error(error.message)
  return (data || []).map(r => r.practice_date)
}

export async function logPractice(dateStr) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('practice_log')
    .upsert({ owner_id: ownerId(), practice_date: dateStr }, { onConflict: 'owner_id,practice_date' })
  if (error) throw new Error(error.message)
}

// ================================================================
// DANCER PROFILE
// ================================================================

export async function fetchDancerProfile() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('dancer_profile').select('*')
    .eq('owner_id', ownerId()).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? mapDancerProfile(data) : { name: 'My Dancing', currentFocus: null }
}

export async function upsertDancerProfile(fields) {
  const client = ensureClient()
  await requireUser()
  const payload = { owner_id: ownerId() }
  if (fields.name !== undefined) payload.name = fields.name
  if (fields.currentFocus !== undefined) {
    payload.current_focus_type = fields.currentFocus?.type || null
    payload.current_focus_id = fields.currentFocus?.id || null
  }
  const { data, error } = await client.from('dancer_profile')
    .upsert(payload, { onConflict: 'owner_id' }).select().single()
  if (error) throw new Error(error.message)
  return mapDancerProfile(data)
}

// ================================================================
// DANCER GOALS
// ================================================================

export async function fetchDancerGoals() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('dancer_goal').select('*')
    .eq('owner_id', ownerId()).order('created_date')
  if (error) throw new Error(error.message)
  return (data || []).map(mapGoal)
}

export async function createDancerGoal({ text }) {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('dancer_goal').insert({
    owner_id: ownerId(), goal_text: text || '',
    created_date: new Date().toISOString().split('T')[0],
  }).select().single()
  if (error) throw new Error(error.message)
  return mapGoal(data)
}

export async function updateDancerGoal(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.text !== undefined) payload.goal_text = updates.text
  if (updates.completedDate !== undefined) payload.completed_date = updates.completedDate
  const { data, error } = await client.from('dancer_goal')
    .update(payload).eq('id', id).select().single()
  if (error) throw new Error(error.message)
  return mapGoal(data)
}

export async function deleteDancerGoal(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client.from('dancer_goal').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// DANCER JOURNEY (per-kid discipline progression + timeline events)
// ================================================================

export async function fetchDancerDisciplines() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client
    .from('dancer_discipline')
    .select('*')
    .eq('owner_id', ownerId())
    .order('discipline_name')
  if (error) throw new Error(error.message)
  return (data || []).map(mapDancerDiscipline)
}

export async function createDancerDiscipline(fields) {
  const client = ensureClient()
  await requireUser()
  const payload = {
    owner_id: ownerId(),
    kid_profile_id: fields.kidProfileId,
    discipline_name: (fields.name || '').trim(),
    discipline_icon: fields.icon || '💃',
    current_grade: fields.currentGrade || '',
    started_on: fields.startedOn || null,
  }
  const { data, error } = await client
    .from('dancer_discipline')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapDancerDiscipline(data)
}

export async function updateDancerDiscipline(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.name !== undefined) payload.discipline_name = updates.name
  if (updates.icon !== undefined) payload.discipline_icon = updates.icon
  if (updates.currentGrade !== undefined) payload.current_grade = updates.currentGrade
  if (updates.startedOn !== undefined) payload.started_on = updates.startedOn
  const { data, error } = await client
    .from('dancer_discipline')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapDancerDiscipline(data)
}

export async function deleteDancerDiscipline(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client
    .from('dancer_discipline')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function fetchDancerJourneyEvents() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client
    .from('dancer_journey_event')
    .select('*')
    .eq('owner_id', ownerId())
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data || []).map(mapDancerJourneyEvent)
}

export async function createDancerJourneyEvent(fields) {
  const client = ensureClient()
  await requireUser()
  const payload = {
    owner_id: ownerId(),
    kid_profile_id: fields.kidProfileId,
    dancer_discipline_id: fields.disciplineId || null,
    event_type: fields.eventType || 'class',
    title: fields.title || '',
    details: fields.details || '',
    event_date: fields.eventDate || new Date().toISOString().split('T')[0],
    exam_name: fields.examName || null,
    exam_grade: fields.examGrade || null,
    exam_result: fields.examResult || null,
    status: fields.status || null,
  }
  const { data, error } = await client
    .from('dancer_journey_event')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapDancerJourneyEvent(data)
}

export async function updateDancerJourneyEvent(id, updates) {
  const client = ensureClient()
  await requireUser()
  const payload = {}
  if (updates.disciplineId !== undefined) payload.dancer_discipline_id = updates.disciplineId || null
  if (updates.eventType !== undefined) payload.event_type = updates.eventType
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.details !== undefined) payload.details = updates.details
  if (updates.eventDate !== undefined) payload.event_date = updates.eventDate
  if (updates.examName !== undefined) payload.exam_name = updates.examName || null
  if (updates.examGrade !== undefined) payload.exam_grade = updates.examGrade || null
  if (updates.examResult !== undefined) payload.exam_result = updates.examResult || null
  if (updates.status !== undefined) payload.status = updates.status || null
  const { data, error } = await client
    .from('dancer_journey_event')
    .update(payload)
    .eq('id', id)
    .select()
    .single()
  if (error) throw new Error(error.message)
  return mapDancerJourneyEvent(data)
}

export async function deleteDancerJourneyEvent(id) {
  const client = ensureClient()
  await requireUser()
  const { error } = await client
    .from('dancer_journey_event')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ================================================================
// SETTINGS (read/write the dance table columns — NOT state_data)
// ================================================================

export async function fetchSettings() {
  const client = ensureClient()
  await requireUser()
  const { data, error } = await client.from('dance')
    .select('name, dancers, theme_color, view_mode, prompt_lead_ms')
    .eq('owner_id', ownerId()).maybeSingle()
  if (error) throw new Error(error.message)
  return mapSettings(data)
}

export async function updateSettings(updates) {
  const client = ensureClient()
  const user = await requireUser()
  const id = ownerId()
  const payload = {}
  if (updates.dancerName !== undefined) {
    payload.name = updates.dancerName
    payload.dancers = [updates.dancerName]
  }
  if (updates.themeColor !== undefined) payload.theme_color = updates.themeColor
  if (updates.promptLeadMs !== undefined) payload.prompt_lead_ms = updates.promptLeadMs

  let result
  if (id === user.id) {
    result = await client.from('dance')
      .upsert({ owner_id: id, ...payload }, { onConflict: 'owner_id' }).select().single()
  } else {
    result = await client.from('dance')
      .update(payload).eq('owner_id', id).select().single()
  }
  if (result.error) throw new Error(result.error.message)
  return mapSettings(result.data)
}
