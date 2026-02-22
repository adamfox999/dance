/**
 * Profile & sharing API — talks to Supabase tables:
 *   user_profile, kid_profile, dance_share
 */

import { hasSupabaseConfig, supabase } from './supabaseClient'

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

// ============ USER PROFILE ============

export async function fetchUserProfile() {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('user_profile')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data // null if not yet created
}

export async function upsertUserProfile({ displayName, avatarEmoji }) {
  const client = ensureClient()
  const user = await requireUser()

  const payload = {
    auth_user_id: user.id,
    display_name: displayName ?? '',
    avatar_emoji: avatarEmoji ?? '👤',
  }

  const { data, error } = await client
    .from('user_profile')
    .upsert(payload, { onConflict: 'auth_user_id' })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ============ KID PROFILES ============

export async function fetchKidProfiles() {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('kid_profile')
    .select('*')
    .eq('parent_user_id', user.id)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data || []
}

export async function createKidProfile({ displayName, avatarEmoji }) {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('kid_profile')
    .insert({
      parent_user_id: user.id,
      display_name: displayName ?? '',
      avatar_emoji: avatarEmoji ?? '💃',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateKidProfile(kidId, { displayName, avatarEmoji }) {
  const client = ensureClient()
  await requireUser()

  const updates = {}
  if (displayName !== undefined) updates.display_name = displayName
  if (avatarEmoji !== undefined) updates.avatar_emoji = avatarEmoji

  const { data, error } = await client
    .from('kid_profile')
    .update(updates)
    .eq('id', kidId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteKidProfile(kidId) {
  const client = ensureClient()
  await requireUser()

  const { error } = await client
    .from('kid_profile')
    .delete()
    .eq('id', kidId)

  if (error) throw new Error(error.message)
  return { ok: true }
}

// ============ DANCE SHARES ============

export async function fetchMyShares() {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('dance_share')
    .select('*')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchIncomingShares() {
  const client = ensureClient()
  const user = await requireUser()

  // RLS handles filtering to shares where invited_email or invited_user_id matches
  const { data, error } = await client
    .from('dance_share')
    .select('*, dance!inner(id, name, owner_id, state_data, dancers, theme_color)')
    .or(`invited_user_id.eq.${user.id},invited_email.eq.${user.email}`)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function createShare({ danceId, routineId }) {
  const client = ensureClient()
  const user = await requireUser()
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

  const { data, error } = await client
    .from('dance_share')
    .insert({
      dance_id: danceId,
      routine_id: routineId || null,
      owner_user_id: user.id,
      invite_token: token,
      role: 'viewer',
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function acceptShare(shareId) {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('dance_share')
    .update({ status: 'accepted', invited_user_id: user.id, invited_email: user.email, invite_token: null })
    .eq('id', shareId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function fetchShareByToken(token) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('dance_share')
    .select('*')
    .eq('invite_token', token)
    .eq('status', 'pending')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

export async function acceptShareByToken(token) {
  const client = ensureClient()
  const user = await requireUser()

  const invite = await fetchShareByToken(token)
  if (!invite) throw new Error('Share invite not found or already used.')
  if (invite.owner_user_id === user.id) throw new Error('You cannot accept your own share invite.')

  const { data, error } = await client
    .from('dance_share')
    .update({
      status: 'accepted',
      invited_user_id: user.id,
      invited_email: user.email,
      invite_token: null,
    })
    .eq('id', invite.id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function revokeShare(shareId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('dance_share')
    .update({ status: 'revoked' })
    .eq('id', shareId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteShare(shareId) {
  const client = ensureClient()
  await requireUser()

  const { error } = await client
    .from('dance_share')
    .delete()
    .eq('id', shareId)

  if (error) throw new Error(error.message)
  return { ok: true }
}

/**
 * Fetch the dance row for an accepted share (read-only).
 * RLS on the dance table allows SELECT if there's an accepted share.
 */
export async function fetchSharedDance(danceId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('dance')
    .select('*')
    .eq('id', danceId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Fetch the owner profile for display on shared views.
 */
export async function fetchSharedOwnerProfile(authUserId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('user_profile')
    .select('display_name, avatar_emoji')
    .eq('auth_user_id', authUserId)
    .maybeSingle()

  if (error) return null // graceful — profile may not exist yet
  return data
}

// ============ PARTNER KID PROFILES (via accepted share) ============

/**
 * Fetch kid profiles of a share partner (RLS allows via accepted dance_share).
 */
export async function fetchPartnerKidProfiles(partnerUserId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('kid_profile')
    .select('*')
    .eq('parent_user_id', partnerUserId)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data || []
}

/**
 * Update which of the invited parent's kids are dancing in this shared routine.
 */
export async function updateSharePartnerKids(shareId, partnerKidIds) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('dance_share')
    .update({ partner_kid_ids: partnerKidIds || [] })
    .eq('id', shareId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

// ============ FAMILY GUARDIANS (co-parents) ============

export async function fetchMyGuardians() {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .select('*')
    .eq('owner_user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function fetchIncomingGuardianInvites() {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .select('*')
    .or(`guardian_user_id.eq.${user.id},guardian_email.eq.${user.email}`)
    .in('status', ['pending', 'accepted'])
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function createGuardianInvite({ kidProfileIds, role }) {
  const client = ensureClient()
  const user = await requireUser()

  // Generate a short random invite token
  const token = crypto.randomUUID().replace(/-/g, '').slice(0, 12)

  const { data, error } = await client
    .from('family_guardian')
    .insert({
      owner_user_id: user.id,
      invite_token: token,
      kid_profile_ids: kidProfileIds || [],
      role: role || 'co-parent',
      status: 'pending',
    })
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function acceptGuardianInvite(guardianId) {
  const client = ensureClient()
  const user = await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .update({ status: 'accepted', guardian_user_id: user.id, guardian_email: user.email })
    .eq('id', guardianId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Look up a guardian invite by its one-time token.
 */
export async function fetchGuardianByToken(token) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .select('*')
    .eq('invite_token', token)
    .eq('status', 'pending')
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data
}

/**
 * Accept a guardian invite by its token.
 */
export async function acceptGuardianByToken(token) {
  const client = ensureClient()
  const user = await requireUser()

  // Find the invite first
  const invite = await fetchGuardianByToken(token)
  if (!invite) throw new Error('Invite not found or already used.')
  if (invite.owner_user_id === user.id) throw new Error('You cannot accept your own invite.')

  const { data, error } = await client
    .from('family_guardian')
    .update({
      status: 'accepted',
      guardian_user_id: user.id,
      guardian_email: user.email,
      invite_token: null, // One-time use — clear the token
    })
    .eq('id', invite.id)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function updateGuardianKids(guardianId, kidProfileIds) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .update({ kid_profile_ids: kidProfileIds || [] })
    .eq('id', guardianId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function revokeGuardian(guardianId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('family_guardian')
    .update({ status: 'revoked' })
    .eq('id', guardianId)
    .select()
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function deleteGuardian(guardianId) {
  const client = ensureClient()
  await requireUser()

  const { error } = await client
    .from('family_guardian')
    .delete()
    .eq('id', guardianId)

  if (error) throw new Error(error.message)
  return { ok: true }
}

/**
 * Fetch the owner's user_profile when you are an accepted guardian.
 */
export async function fetchGuardianOwnerProfile(ownerUserId) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('user_profile')
    .select('display_name, avatar_emoji')
    .eq('auth_user_id', ownerUserId)
    .maybeSingle()

  if (error) return null
  return data
}

/**
 * Fetch kid profiles that a guardian has been assigned (via RLS).
 */
export async function fetchGuardianKidProfiles(ownerUserId, kidProfileIds) {
  const client = ensureClient()
  await requireUser()

  const { data, error } = await client
    .from('kid_profile')
    .select('*')
    .eq('parent_user_id', ownerUserId)
    .in('id', kidProfileIds)
    .order('created_at')

  if (error) throw new Error(error.message)
  return data || []
}
