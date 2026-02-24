/**
 * Media compression utilities.
 *
 * Images: resizes longest side to max 1920px, outputs JPEG at 85% quality.
 * Videos: 720p max, 50 MB cap, via mediabunny (loaded on demand).
 */

// ─── IMAGE COMPRESSION ───────────────────────────────────────────────

const MAX_IMAGE_LONG_SIDE = 1920

/**
 * Compress an image File/Blob to JPEG ≤ 1920px longest side.
 * Returns a new File (always image/jpeg).
 */
export function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Failed to read image file'))
    reader.onload = (ev) => {
      const img = new Image()
      img.onerror = () => reject(new Error('Failed to decode image'))
      img.onload = () => {
        let w = img.width
        let h = img.height
        const longest = Math.max(w, h)
        if (longest > MAX_IMAGE_LONG_SIDE) {
          const scale = MAX_IMAGE_LONG_SIDE / longest
          w = Math.round(w * scale)
          h = Math.round(h * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(img, 0, 0, w, h)
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error('Canvas toBlob returned null'))
            const name = (file.name || 'photo').replace(/\.[^.]+$/, '') + '.jpg'
            resolve(new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() }))
          },
          'image/jpeg',
          0.85,
        )
      }
      img.src = ev.target.result
    }
    reader.readAsDataURL(file)
  })
}

// ─── VIDEO COMPRESSION ───────────────────────────────────────────────

const MAX_VIDEO_BYTES = 50 * 1024 * 1024 // 50 MB

function getFileNameBase(name) {
  if (!name) return 'video'
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(0, dot) : name
}

/**
 * Compress a video File/Blob to 720p MP4 via mediabunny.
 * If the file is already ≤ 720p and under 50 MB it may still be
 * re-encoded to guarantee a compatible MP4 container.
 *
 * @param {File|Blob} inputFile
 * @param {{ onProgress?: (info: { stage: string, progress: number, elapsed?: number }) => void }} options
 * @returns {Promise<File>}
 */
export async function compressVideo(inputFile, options = {}) {
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null

  if (!(inputFile instanceof File || inputFile instanceof Blob)) {
    throw new Error('Invalid video file.')
  }

  if (onProgress) onProgress({ stage: 'preparing', progress: 0 })

  const {
    Input, Output, Conversion, ALL_FORMATS,
    BlobSource, Mp4OutputFormat, BufferTarget, QUALITY_MEDIUM,
  } = await import('mediabunny')

  const startTime = Date.now()

  const input = new Input({
    source: new BlobSource(inputFile),
    formats: ALL_FORMATS,
  })
  const output = new Output({
    format: new Mp4OutputFormat(),
    target: new BufferTarget(),
  })

  try {
    if (onProgress) onProgress({ stage: 'compressing', progress: 0, elapsed: 0 })

    const conversion = await Conversion.init({
      input,
      output,
      video: (videoTrack) => {
        const opts = { bitrate: QUALITY_MEDIUM }
        if (videoTrack.displayHeight > 720) opts.height = 720
        if (videoTrack.number > 1) return { discard: true }
        return opts
      },
      audio: (audioTrack) => {
        if (audioTrack.number > 1) return { discard: true }
        return { numberOfChannels: 2, sampleRate: 48000, bitrate: QUALITY_MEDIUM }
      },
    })

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks
        .map((t) => `${t.track.type}: ${t.reason}`)
        .join(', ')
      throw new Error(`Video format not supported: ${reasons}`)
    }

    if (onProgress) {
      conversion.onProgress = (progress) => {
        const pct = Math.max(0, Math.min(1, Number(progress) || 0))
        onProgress({ stage: 'compressing', progress: pct, elapsed: Math.round((Date.now() - startTime) / 1000) })
      }
    }

    await conversion.execute()

    if (onProgress) onProgress({ stage: 'finalizing', progress: 1 })

    const buffer = output.target.buffer
    if (!buffer || !buffer.byteLength) throw new Error('Video compression produced an empty file.')

    const compressedBlob = new Blob([buffer], { type: 'video/mp4' })

    if (compressedBlob.size > MAX_VIDEO_BYTES) {
      throw new Error(`Compressed video is ${(compressedBlob.size / 1024 / 1024).toFixed(1)} MB — exceeds the 50 MB limit. Try a shorter clip.`)
    }

    return new File(
      [compressedBlob],
      `${getFileNameBase(inputFile.name || 'video')}-720p.mp4`,
      { type: 'video/mp4', lastModified: Date.now() },
    )
  } finally {
    input.dispose()
  }
}
