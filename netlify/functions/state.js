import { getSupabaseAdminClient } from './_supabase.js'

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(payload),
  }
}

function buildDancePayloadFromState(inputState) {
  const safeState = inputState || {}
  const settings = safeState.settings || {}
  return {
    id: 1,
    name: settings.danceName || 'Dance Routine',
    dancers: Array.isArray(settings.dancers) ? settings.dancers : [],
    theme_color: settings.themeColor || '#a855f7',
    view_mode: settings.viewMode === 'kid' ? 'kid' : 'adult',
    prompt_lead_ms: Number.isFinite(Number(settings.promptLeadMs))
      ? Math.max(0, Number(settings.promptLeadMs))
      : 200,
    state_data: safeState,
  }
}

export async function handler(event) {
  try {
    const supabase = getSupabaseAdminClient()

    if (event.httpMethod === 'GET') {
      const { data: danceData, error: danceError } = await supabase
        .from('dance')
        .select('id, name, dancers, theme_color, view_mode, prompt_lead_ms, state_data, updated_at')
        .eq('id', 1)
        .maybeSingle()

      if (!danceError && danceData?.state_data) {
        return jsonResponse(200, { source: 'dance', danceData })
      }

      const { data: appStateData, error: appStateError } = await supabase
        .from('app_state')
        .select('state_data')
        .eq('id', 1)
        .maybeSingle()

      if (appStateError) {
        return jsonResponse(500, { error: appStateError.message })
      }

      return jsonResponse(200, {
        warning: danceError?.message || null,
        source: appStateData?.state_data ? 'app_state' : 'none',
        appStateData,
      })
    }

    if (event.httpMethod === 'POST') {
      const parsed = event.body ? JSON.parse(event.body) : {}
      const state = parsed?.state || parsed?.state_data

      if (!state || typeof state !== 'object') {
        return jsonResponse(400, { error: 'Missing state payload.' })
      }

      const dancePayload = buildDancePayloadFromState(state)

      const { error: danceError } = await supabase
        .from('dance')
        .upsert(dancePayload)

      const { error: appStateError } = await supabase
        .from('app_state')
        .upsert({ id: 1, state_data: state })

      if (appStateError) {
        return jsonResponse(500, { error: appStateError.message })
      }

      return jsonResponse(200, { ok: true, warning: danceError?.message || null })
    }

    return jsonResponse(405, { error: 'Method not allowed' })
  } catch (err) {
    return jsonResponse(500, { error: err?.message || 'Unexpected server error' })
  }
}
