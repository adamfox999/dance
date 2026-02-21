import { createClient } from '@supabase/supabase-js'
import { promises as fs } from 'node:fs'
import path from 'node:path'

const projectRoot = process.cwd()
const publicDir = path.join(projectRoot, 'public')
const envFiles = ['.env.local', '.env']

function parseEnvText(text) {
  const parsed = {}
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

async function loadEnvFromFiles() {
  for (const fileName of envFiles) {
    const filePath = path.join(projectRoot, fileName)
    try {
      const text = await fs.readFile(filePath, 'utf8')
      const parsed = parseEnvText(text)
      for (const [key, value] of Object.entries(parsed)) {
        if (!process.env[key]) {
          process.env[key] = value
        }
      }
    } catch {
      // ignore missing env file
    }
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...await walkFiles(fullPath))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }
  return files
}

async function main() {
  await loadEnvFromFiles()

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const bucket = process.env.DANCE_SUPABASE_BUCKET || 'dance-files'

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment/.env.local')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  try {
    await fs.access(publicDir)
  } catch {
    console.error(`Public directory not found: ${publicDir}`)
    process.exit(1)
  }

  const localFiles = await walkFiles(publicDir)
  if (localFiles.length === 0) {
    console.log('No files found under public/. Nothing to sync.')
    return
  }

  let uploaded = 0
  const failed = []

  for (const absolutePath of localFiles) {
    const relPath = path.relative(publicDir, absolutePath).split(path.sep).join('/')
    const storagePath = `public/${relPath}`

    try {
      const fileBuffer = await fs.readFile(absolutePath)
      const { error } = await supabase.storage
        .from(bucket)
        .upload(storagePath, fileBuffer, {
          upsert: true,
          contentType: undefined,
        })

      if (error) throw error
      uploaded += 1
      console.log(`Uploaded: ${storagePath}`)
    } catch (err) {
      failed.push({ storagePath, message: err?.message || String(err) })
      console.error(`Failed: ${storagePath} -> ${err?.message || err}`)
    }
  }

  console.log(`\nSync complete. Uploaded ${uploaded}/${localFiles.length} file(s) to bucket '${bucket}'.`)

  if (failed.length > 0) {
    console.log(`Failures: ${failed.length}`)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Unexpected sync failure:', err)
  process.exit(1)
})
