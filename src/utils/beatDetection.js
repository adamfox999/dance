/**
 * Beat detection for dance music.
 * Analyses audio to find BPM and individual beat positions,
 * then groups them into 8-counts for choreography.
 *
 * Uses spectral-flux onset detection → auto-correlation BPM → beat grid.
 */

/**
 * Detect beats in an AudioBuffer.
 * Returns { bpm, beats[], eightCounts[] }
 *
 * @param {AudioBuffer} buffer - decoded audio
 * @returns {{ bpm: number, firstBeat: number, beats: number[], eightCounts: { start: number, end: number, number: number }[] }}
 */
export function detectBeats(buffer) {
  const sampleRate = buffer.sampleRate
  const channelData = buffer.getChannelData(0)

  // ─── 1. Compute onset strength (energy flux) ───
  const hopSize = Math.floor(sampleRate * 0.01) // 10ms hops
  const frameSize = hopSize * 2
  const numFrames = Math.floor((channelData.length - frameSize) / hopSize)
  const onsetStrength = new Float32Array(numFrames)

  let prevEnergy = 0
  for (let i = 0; i < numFrames; i++) {
    const start = i * hopSize
    let energy = 0
    for (let j = 0; j < frameSize; j++) {
      energy += channelData[start + j] ** 2
    }
    energy /= frameSize
    // Half-wave rectified difference — only increases count
    onsetStrength[i] = Math.max(0, energy - prevEnergy)
    prevEnergy = energy
  }

  // ─── 2. Auto-correlation to find BPM ───
  // Search between 60 and 200 BPM
  const minBPM = 60
  const maxBPM = 200
  const hopDuration = hopSize / sampleRate
  const minLag = Math.floor(60 / (maxBPM * hopDuration))
  const maxLag = Math.floor(60 / (minBPM * hopDuration))

  let bestLag = minLag
  let bestCorr = -Infinity

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0
    const len = Math.min(numFrames - lag, numFrames)
    for (let i = 0; i < len; i++) {
      corr += onsetStrength[i] * onsetStrength[i + lag]
    }
    // Also check double-lag (strong sub-harmonic)
    if (corr > bestCorr) {
      bestCorr = corr
      bestLag = lag
    }
  }

  const bpm = 60 / (bestLag * hopDuration)

  // ─── 3. Find first beat via onset peaks ───
  // Smooth onset strengths
  const smoothed = new Float32Array(numFrames)
  const smoothWindow = 3
  for (let i = 0; i < numFrames; i++) {
    let sum = 0
    let count = 0
    for (let j = -smoothWindow; j <= smoothWindow; j++) {
      const idx = i + j
      if (idx >= 0 && idx < numFrames) {
        sum += onsetStrength[idx]
        count++
      }
    }
    smoothed[i] = sum / count
  }

  // Find peaks in the first few seconds to determine the phase/offset
  const beatInterval = 60 / bpm // seconds per beat
  const searchFrames = Math.min(numFrames, Math.floor(4 * beatInterval / hopDuration))

  // Collect peaks
  const threshold = computeThreshold(smoothed, 0.6)
  const peaks = []
  for (let i = 1; i < searchFrames - 1; i++) {
    if (smoothed[i] > smoothed[i - 1] && smoothed[i] > smoothed[i + 1] && smoothed[i] > threshold) {
      peaks.push(i * hopDuration)
    }
  }

  // Find the phase that best aligns with a regular beat grid
  let bestPhase = peaks.length > 0 ? peaks[0] : 0
  let bestScore = -Infinity

  for (const candidatePhase of peaks) {
    let score = 0
    const len = Math.min(smoothed.length, Math.floor(10 / hopDuration)) // score over 10s
    for (let i = 0; i < len; i++) {
      const t = i * hopDuration
      const dist = ((t - candidatePhase) % beatInterval + beatInterval) % beatInterval
      const nearBeat = Math.min(dist, beatInterval - dist)
      if (nearBeat < hopDuration * 3) {
        score += smoothed[i]
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestPhase = candidatePhase
    }
  }

  const firstBeat = bestPhase

  // ─── 4. Generate beat grid ───
  const totalDuration = buffer.duration
  const beats = []
  let t = firstBeat
  while (t < totalDuration) {
    beats.push(Math.round(t * 1000) / 1000) // round to ms
    t += beatInterval
  }

  // ─── 5. Group into 8-counts ───
  const eightCounts = []
  for (let i = 0; i < beats.length; i += 8) {
    const groupEnd = Math.min(i + 7, beats.length - 1)
    eightCounts.push({
      number: Math.floor(i / 8) + 1,
      start: beats[i],
      end: beats[groupEnd],
      beats: beats.slice(i, i + 8),
    })
  }

  return {
    bpm: Math.round(bpm * 10) / 10,
    firstBeat,
    beats,
    eightCounts,
  }
}

/**
 * Given the current playback time, return the current beat number (1-8)
 * and which 8-count group we're in, plus sub-beat ("and") info.
 * @param {number} time - current time in seconds
 * @param {{ bpm: number, firstBeat: number, beats: number[] }} beatData
 */
export function getCurrentBeatInfo(time, beatData) {
  if (!beatData || !beatData.beats.length) return null

  const { bpm, firstBeat, beats, eightCounts } = beatData
  const beatInterval = 60 / bpm

  // Find closest beat index
  let beatIndex = -1
  for (let i = 0; i < beats.length; i++) {
    if (time >= beats[i] - beatInterval * 0.5) {
      beatIndex = i
    } else {
      break
    }
  }

  if (beatIndex < 0) return null

  const countInGroup = (beatIndex % 8) + 1 // 1-8
  const groupNumber = Math.floor(beatIndex / 8) + 1
  const currentBeatTime = beats[beatIndex]
  const nextBeatTime = beatIndex + 1 < beats.length ? beats[beatIndex + 1] : null
  const progress = nextBeatTime
    ? (time - currentBeatTime) / (nextBeatTime - currentBeatTime)
    : 0
  const clampedProgress = Math.max(0, Math.min(1, progress))

  // Sub-beat: are we past the halfway point between this beat and the next? (the "and")
  const isAnd = clampedProgress >= 0.5

  // The active "slot key" for syncopated mode: e.g. "3" or "3&"
  const slotKey = isAnd ? `${countInGroup}&` : `${countInGroup}`

  // Fractional beat position for freeform mode (e.g. 3.72)
  const fractionalBeat = countInGroup + clampedProgress

  return {
    beatIndex,
    count: countInGroup,        // 1-8
    group: groupNumber,         // which 8-count (1, 2, 3…)
    progress: clampedProgress,  // 0-1 within current beat
    isDownbeat: countInGroup === 1,
    isAnd,                      // true when in the "&" half of the beat
    slotKey,                    // "3" or "3&" — the active instruction slot
    fractionalBeat,             // e.g. 3.72 — continuous position within 8-count
  }
}

// ─── Helpers ───

function computeThreshold(array, percentile) {
  const sorted = [...array].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length * percentile)] || 0
}
