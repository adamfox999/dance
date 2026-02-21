import { getSupabaseAdminClient } from './_supabase.js'

const STORAGE_BUCKET = process.env.DANCE_SUPABASE_BUCKET || 'dance-files'

function getStoragePath(key) {
  return `files/${key}`
}

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

function parseMetaHeader(headerValue) {
  if (!headerValue) return {}
  try {
    const json = Buffer.from(headerValue, 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return {}
  }
}

export async function handler(event) {
  try {
    const supabase = getSupabaseAdminClient()
    const key = event.queryStringParameters?.key

    if (!key) {
      return jsonResponse(400, { error: 'Missing key query parameter.' })
    }

    if (event.httpMethod === 'GET') {
      const { data: metaRow } = await supabase
        .from('file_metadata')
        .select('meta_data')
        .eq('id', key)
        .maybeSingle()

      const storagePath = metaRow?.meta_data?.storagePath || getStoragePath(key)

      const { data: signed, error: signedError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .createSignedUrl(storagePath, 60)

      if (signedError || !signed?.signedUrl) {
        return jsonResponse(404, { found: false })
      }

      return jsonResponse(200, {
        found: true,
        signedUrl: signed.signedUrl,
        meta: metaRow?.meta_data || {},
      })
    }

    if (event.httpMethod === 'PUT') {
      const contentType = event.headers['content-type'] || event.headers['Content-Type'] || 'application/octet-stream'
      const meta = parseMetaHeader(event.headers['x-meta-base64'] || event.headers['X-Meta-Base64'])
      const storagePath = getStoragePath(key)

      const buffer = event.isBase64Encoded
        ? Buffer.from(event.body || '', 'base64')
        : Buffer.from(event.body || '', 'utf8')

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, buffer, {
          upsert: true,
          contentType,
        })

      if (uploadError) {
        return jsonResponse(500, { error: uploadError.message })
      }

      const remoteMeta = {
        ...meta,
        storagePath,
        contentType,
        updatedAt: Date.now(),
      }

      const { error: metaError } = await supabase
        .from('file_metadata')
        .upsert({ id: key, meta_data: remoteMeta })

      if (metaError) {
        return jsonResponse(500, { error: metaError.message })
      }

      return jsonResponse(200, { ok: true })
    }

    if (event.httpMethod === 'DELETE') {
      const storagePath = getStoragePath(key)
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath])
      await supabase.from('file_metadata').delete().eq('id', key)
      return jsonResponse(200, { ok: true })
    }

    return jsonResponse(405, { error: 'Method not allowed' })
  } catch (err) {
    return jsonResponse(500, { error: err?.message || 'Unexpected server error' })
  }
}
