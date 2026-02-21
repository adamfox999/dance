/**
 * Persistent local file storage using IndexedDB (browser/device only).
 *
 * Usage:
 *   await saveFile('choreo-music', file)
 *   const { blob, meta } = await loadFile('choreo-music')
 *   await deleteFile('choreo-music')
 */

import {
  uploadFileToBackend,
  getFileFromBackend,
  deleteFileFromBackend,
} from './backendApi'

const DB_NAME = 'dance-tracker-local-files'
const STORE_NAME = 'files'
const DB_VERSION = 1

function getStoragePath(key) {
  return `files/${key}`
}

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this browser.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function runRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function loadFileFromIndexedDb(key) {
  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await runRequest(store.get(key))
      if (!record?.blob) return null
      return {
        blob: record.blob,
        meta: record.meta || {},
      }
    } finally {
      db.close()
    }
  } catch {
    return null
  }
}

export async function saveFile(key, blob, meta = {}) {
  let localSaved = false

  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      await runRequest(store.put({
        id: key,
        blob,
        meta,
        updatedAt: Date.now(),
      }))
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      localSaved = true
    } finally {
      db.close()
    }
  } catch {
    localSaved = false
  }

  try {
    const path = getStoragePath(key)
    const contentType = meta?.type || blob?.type || 'application/octet-stream'

    const remoteMeta = {
      ...meta,
      storagePath: path,
      contentType,
      updatedAt: Date.now(),
    }

    await uploadFileToBackend(key, blob, remoteMeta)
    return true
  } catch (err) {
    if (localSaved) {
      console.warn(`Saved ${key} locally, but failed to upload to backend:`, err)
      return true
    }
    throw err
  }
}

export async function loadFile(key) {
  try {
    const remoteFile = await getFileFromBackend(key)
    if (remoteFile?.blob) return remoteFile
  } catch {
    // fall through to local storage
  }

  return loadFileFromIndexedDb(key)
}

export async function loadLocalFile(key) {
  return loadFileFromIndexedDb(key)
}

export async function deleteFile(key) {
  let localDeleted = false

  try {
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      await runRequest(store.delete(key))
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
      localDeleted = true
    } finally {
      db.close()
    }
  } catch {
    localDeleted = false
  }

  try {
    await deleteFileFromBackend(key)
    return true
  } catch (err) {
    if (localDeleted) return true
    throw err
  }
}

export async function findFirstExistingMediaUrl(candidates = []) {
  for (const candidate of candidates) {
    if (!candidate) continue
    const url = encodeURI(candidate)
    try {
      const headRes = await fetch(url, { method: 'HEAD' })
      if (headRes.ok) return url
      if (headRes.status === 405) {
        const getRes = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
        })
        if (getRes.ok || getRes.status === 206) return url
      }
    } catch {
      // Ignore and try next candidate.
    }
  }
  return null
}
