import { hasSupabaseConfig, supabase } from './supabaseClient'

const STORAGE_BUCKET = 'dance-files'

// Tracks the actual owner of the dance data we are working with.
// Set after fetchStateFromBackend resolves — overrides user.id for all
// file and save operations so guardians co-own the same data.
let _danceOwnerId = null

/**
 * Set the effective dance-data owner.  Called from AppContext after hydration.
 */
export function setDanceOwnerId(id) {
  _danceOwnerId = id || null
}

export function getDanceOwnerId() {
  return _danceOwnerId
}

function ensureSupabaseClient() {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error('Supabase client is not configured.')
  }
  return supabase
}

async function requireUser() {
  const client = ensureSupabaseClient()
  const { data, error } = await client.auth.getUser()
  if (error || !data?.user) {
    throw new Error('Not authenticated.')
  }
  return data.user
}

/** Return the effective owner ID — the dance owner if set, otherwise the logged-in user. */
async function effectiveOwnerId() {
  const user = await requireUser()
  return _danceOwnerId || user.id
}

function getStoragePath(ownerId, key, fileName) {
  const base = `users/${ownerId}/files/${String(key || '').replace(/^files\//, '')}`
  if (fileName) {
    const safe = String(fileName).replace(/[^a-zA-Z0-9._-]/g, '_')
    return `${base}/${safe}`
  }
  return base
}

export async function fetchStateFromBackend() {
  const client = ensureSupabaseClient()
  const user = await requireUser()

  // 1. Try the user's own dance row first
  const { data: ownDance, error: ownError } = await client
    .from('dance')
    .select('id, owner_id, name, dancers, theme_color, view_mode, prompt_lead_ms, state_data, updated_at')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (ownError) throw new Error(ownError.message)
  if (ownDance?.state_data) {
    _danceOwnerId = user.id
    return { source: 'dance', danceData: ownDance }
  }

  // 2. Fallback: find a dance row accessible via RLS (guardian / shared)
  const { data: accessibleRows, error: accessibleError } = await client
    .from('dance')
    .select('id, owner_id, name, dancers, theme_color, view_mode, prompt_lead_ms, state_data, updated_at')
    .neq('owner_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)

  if (accessibleError) throw new Error(accessibleError.message)

  const danceData = Array.isArray(accessibleRows) ? accessibleRows[0] : null
  if (danceData?.state_data) {
    // We are a guardian/co-owner: remember the real owner
    _danceOwnerId = danceData.owner_id
    return { source: 'dance', danceData }
  }

  return { source: 'none', danceData: null }
}

export async function saveStateToBackend(state) {
  const client = ensureSupabaseClient()
  await requireUser()
  const ownerId = await effectiveOwnerId()
  const settings = state?.settings || {}

  const payload = {
    owner_id: ownerId,
    name: settings.danceName || 'Dance Routine',
    dancers: Array.isArray(settings.dancers) ? settings.dancers : [],
    theme_color: settings.themeColor || '#a855f7',
    view_mode: settings.viewMode === 'kid' ? 'kid' : 'adult',
    prompt_lead_ms: Number.isFinite(Number(settings.promptLeadMs))
      ? Math.max(0, Number(settings.promptLeadMs))
      : 200,
    state_data: state,
  }

  const { error } = await client
    .from('dance')
    .upsert(payload, { onConflict: 'owner_id' })

  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function uploadFileToBackend(key, blob, meta = {}) {
  const client = ensureSupabaseClient()
  await requireUser()
  const ownerId = await effectiveOwnerId()
  const normalizedKey = String(key || '').replace(/^files\//, '')
  const storagePath = getStoragePath(ownerId, normalizedKey, meta?.fileName)
  const contentType = meta?.type || blob?.type || 'application/octet-stream'

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, blob, {
      upsert: true,
      contentType,
    })

  if (uploadError) throw new Error(uploadError.message)

  const remoteMeta = {
    ...meta,
    storagePath,
    contentType,
    updatedAt: Date.now(),
  }

  const { error: metaError } = await client
    .from('file_metadata')
    .upsert({ owner_id: ownerId, id: normalizedKey, meta_data: remoteMeta }, { onConflict: 'owner_id,id' })

  if (metaError) throw new Error(metaError.message)
  return { ok: true }
}

export async function getFileFromBackend(key) {
  const client = ensureSupabaseClient()
  await requireUser()
  const ownerId = await effectiveOwnerId()
  const normalizedKey = String(key || '').replace(/^files\//, '')

  const { data: metaRow, error: metaError } = await client
    .from('file_metadata')
    .select('meta_data')
    .eq('owner_id', ownerId)
    .eq('id', normalizedKey)
    .maybeSingle()

  if (metaError) throw new Error(metaError.message)

  const storagePath = metaRow?.meta_data?.storagePath || getStoragePath(ownerId, normalizedKey)
  const { data, error } = await client.storage
    .from(STORAGE_BUCKET)
    .download(storagePath)

  if (error) return null
  if (!data) return null

  return {
    blob: data,
    meta: metaRow?.meta_data || {},
  }
}

export async function deleteFileFromBackend(key) {
  const client = ensureSupabaseClient()
  await requireUser()
  const ownerId = await effectiveOwnerId()
  const normalizedKey = String(key || '').replace(/^files\//, '')

  const { data: metaRow } = await client
    .from('file_metadata')
    .select('meta_data')
    .eq('owner_id', ownerId)
    .eq('id', normalizedKey)
    .maybeSingle()

  const storagePath = metaRow?.meta_data?.storagePath || getStoragePath(ownerId, normalizedKey)

  await client.storage.from(STORAGE_BUCKET).remove([storagePath])

  const { error } = await client
    .from('file_metadata')
    .delete()
    .eq('owner_id', ownerId)
    .eq('id', normalizedKey)

  if (error) throw new Error(error.message)
  return { ok: true }
}

export async function listMediaFromBackend(type) {
  const client = ensureSupabaseClient()
  await requireUser()
  const ownerId = await effectiveOwnerId()
  const normalizedType = type === 'audio' || type === 'video' ? type : null

  const { data, error } = await client
    .from('file_metadata')
    .select('id, owner_id, meta_data, updated_at')
    .eq('owner_id', ownerId)
    .order('updated_at', { ascending: false })

  if (error) throw new Error(error.message)

  return (data || [])
    .map((row) => {
      const meta = row?.meta_data || {}
      const contentType = String(meta.type || meta.contentType || '')
      return {
        id: row.id,
        key: row.id,
        storagePath: meta.storagePath || getStoragePath(ownerId, row.id),
        fileName: meta.fileName || row.id,
        type: contentType,
        size: Number(meta.size || 0),
        updatedAt: meta.updatedAt || row.updated_at || null,
      }
    })
    .filter((item) => !normalizedType || item.type.startsWith(`${normalizedType}/`))
}
