/**
 * Audio utilities for waveform rendering and cross-correlation sync.
 * Uses the Web Audio API to decode audio files and extract waveform data.
 */

let audioCtx = null

function getAudioContext() {
  if (audioCtx) return audioCtx

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext
  if (!AudioContextCtor) {
    throw new Error('Web Audio API is not supported in this browser.')
  }

  audioCtx = new AudioContextCtor()
  return audioCtx
}

/**
 * Decode an audio file (or video file's audio track) into an AudioBuffer.
 */
export async function decodeAudioFile(file) {
  const arrayBuffer = await file.arrayBuffer()
  const ctx = getAudioContext()
  return ctx.decodeAudioData(arrayBuffer)
}

/**
 * Extract a downsampled waveform from an AudioBuffer for visual rendering.
 * Returns an array of peak values between -1 and 1.
 * @param {AudioBuffer} buffer
 * @param {number} samples - number of output samples (visual width)
 */
export function extractWaveform(buffer, samples = 800) {
  const channelData = buffer.getChannelData(0) // mono or left channel
  const blockSize = Math.floor(channelData.length / samples)
  const peaks = []

  for (let i = 0; i < samples; i++) {
    const start = i * blockSize
    let max = 0
    for (let j = 0; j < blockSize; j++) {
      const abs = Math.abs(channelData[start + j])
      if (abs > max) max = abs
    }
    peaks.push(max)
  }

  return peaks
}

/**
 * Cross-correlate two audio buffers to find the time offset.
 * Downsamples to ~4kHz for speed, returns offset in seconds.
 * Positive offset = video audio starts later than the music.
 *
 * @param {AudioBuffer} musicBuffer - the original music track
 * @param {AudioBuffer} videoBuffer - audio extracted from the video
 * @param {number} maxOffsetSec - maximum offset to search (default 30s)
 * @returns {{ offsetMs: number, confidence: number }}
 */
export function crossCorrelateSync(musicBuffer, videoBuffer, maxOffsetSec = 30) {
  // Downsample to ~4kHz for fast correlation
  const targetRate = 4000
  const musicData = downsample(musicBuffer.getChannelData(0), musicBuffer.sampleRate, targetRate)
  const videoData = downsample(videoBuffer.getChannelData(0), videoBuffer.sampleRate, targetRate)

  const maxOffset = Math.floor(maxOffsetSec * targetRate)
  const windowLen = Math.min(musicData.length, videoData.length, targetRate * 15) // compare up to 15s

  let bestCorr = -Infinity
  let bestOffset = 0
  let totalEnergy = 0

  // Slide video over music
  for (let offset = -maxOffset; offset <= maxOffset; offset += 1) {
    let corr = 0
    let count = 0
    for (let i = 0; i < windowLen; i++) {
      const mi = i
      const vi = i + offset
      if (vi >= 0 && vi < videoData.length && mi < musicData.length) {
        corr += musicData[mi] * videoData[vi]
        count++
      }
    }
    if (count > 0) {
      corr /= count
      totalEnergy += Math.abs(corr)
      if (corr > bestCorr) {
        bestCorr = corr
        bestOffset = offset
      }
    }
  }

  const offsetMs = Math.round((bestOffset / targetRate) * 1000)
  // Confidence: how much the peak stands out from average
  const avgCorr = totalEnergy / (2 * maxOffset + 1)
  const confidence = avgCorr > 0 ? Math.min(100, Math.round((bestCorr / avgCorr) * 25)) : 0

  return { offsetMs, confidence }
}

/**
 * Downsample audio data to a target sample rate.
 */
function downsample(data, fromRate, toRate) {
  const ratio = fromRate / toRate
  const newLen = Math.floor(data.length / ratio)
  const result = new Float32Array(newLen)
  for (let i = 0; i < newLen; i++) {
    result[i] = data[Math.floor(i * ratio)]
  }
  return result
}

/**
 * Format seconds to MM:SS.ms display
 */
export function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`
}
