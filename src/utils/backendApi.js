const API_BASE = '/.netlify/functions'

async function parseErrorMessage(response) {
  try {
    const data = await response.json()
    return data?.error || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

export async function fetchStateFromBackend() {
  const response = await fetch(`${API_BASE}/state`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json()
}

export async function saveStateToBackend(state) {
  const response = await fetch(`${API_BASE}/state`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ state }),
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json()
}

export async function uploadFileToBackend(key, blob, meta = {}) {
  const metaBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(meta || {}))))

  const response = await fetch(`${API_BASE}/storage-file?key=${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': meta?.type || blob?.type || 'application/octet-stream',
      'X-Meta-Base64': metaBase64,
      Accept: 'application/json',
    },
    body: blob,
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json()
}

export async function getFileFromBackend(key) {
  const response = await fetch(`${API_BASE}/storage-file?key=${encodeURIComponent(key)}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })

  if (response.status === 404) return null

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  const data = await response.json()
  if (!data?.found || !data?.signedUrl) return null

  const fileResponse = await fetch(data.signedUrl)
  if (!fileResponse.ok) return null

  const blob = await fileResponse.blob()
  return {
    blob,
    meta: data.meta || {},
  }
}

export async function deleteFileFromBackend(key) {
  const response = await fetch(`${API_BASE}/storage-file?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response))
  }

  return response.json()
}
