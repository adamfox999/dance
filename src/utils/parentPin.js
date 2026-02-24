const PBKDF2_ITERATIONS = 120000
const SALT_LENGTH = 16

function ensureCrypto() {
  if (typeof window === 'undefined' || !window.crypto?.subtle) {
    throw new Error('Secure PIN is unavailable in this environment.')
  }
  return window.crypto
}

function toBase64(uint8) {
  let binary = ''
  for (let i = 0; i < uint8.length; i += 1) binary += String.fromCharCode(uint8[i])
  return btoa(binary)
}

function fromBase64(input) {
  const binary = atob(input)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveHash(pin, saltBytes, iterations = PBKDF2_ITERATIONS) {
  const crypto = ensureCrypto()
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(String(pin || '')),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  )
  return new Uint8Array(bits)
}

export function validateParentPinFormat(pin) {
  const value = String(pin || '').trim()
  if (!/^\d{4,10}$/.test(value)) {
    return 'PIN must be 4-10 digits.'
  }
  return null
}

export async function hashParentPin(pin) {
  const formatError = validateParentPinFormat(pin)
  if (formatError) throw new Error(formatError)

  const crypto = ensureCrypto()
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const hash = await deriveHash(pin, salt, PBKDF2_ITERATIONS)

  return {
    v: 1,
    algo: 'PBKDF2-SHA256',
    iterations: PBKDF2_ITERATIONS,
    salt: toBase64(salt),
    hash: toBase64(hash),
    updatedAt: new Date().toISOString(),
  }
}

export async function verifyParentPin(pin, record) {
  if (!record?.salt || !record?.hash) return false
  const iterations = Number(record.iterations) || PBKDF2_ITERATIONS
  const salt = fromBase64(record.salt)
  const expected = record.hash
  const actualBytes = await deriveHash(pin, salt, iterations)
  const actual = toBase64(actualBytes)
  return actual === expected
}
