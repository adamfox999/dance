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
let currentUserScope = 'signed-out'

function getLocalKey(key) {
  return `${currentUserScope}:${key}`
}

export function setFileStorageUserScope(userId) {
  currentUserScope = userId || 'signed-out'
}

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

async function saveFileToIndexedDb(key, blob, meta = {}) {
  const localKey = getLocalKey(key)
  const db = await openDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await runRequest(store.put({
      id: localKey,
      blob,
      meta,
      updatedAt: Date.now(),
    }))
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    return true
  } finally {
    db.close()
  }
}

async function loadFileFromIndexedDb(key) {
  try {
    const localKey = getLocalKey(key)
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const record = await runRequest(store.get(localKey))
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
  const path = getStoragePath(key)
  const contentType = meta?.type || blob?.type || 'application/octet-stream'

  const remoteMeta = {
    ...meta,
    storagePath: path,
    contentType,
    updatedAt: Date.now(),
  }

  await uploadFileToBackend(key, blob, remoteMeta)

  try {
    await saveFileToIndexedDb(key, blob, meta)
  } catch (err) {
    console.warn(`Uploaded ${key} to backend, but local cache failed:`, err)
  }

  return true
}

export async function saveLocalFile(key, blob, meta = {}) {
  await saveFileToIndexedDb(key, blob, meta)
  return true
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
  await deleteFileFromBackend(key)

  try {
    const localKey = getLocalKey(key)
    const db = await openDb()
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      await runRequest(store.delete(localKey))
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error)
      })
    } finally {
      db.close()
    }
  } catch (err) {
    console.warn(`Deleted ${key} from backend, but local cache cleanup failed:`, err)
  }

  return true
}
