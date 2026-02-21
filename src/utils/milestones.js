// Milestone definitions for auto-unlocking stickers
export const milestones = [
  {
    type: "first-video",
    label: "First Video! 📹",
    icon: "📹",
    check: (state) => state.sessions.some((s) => s.videoUrl),
  },
  {
    type: "first-duet",
    label: "Duet Power! 🤝",
    icon: "🤝",
    check: (state) => state.sessions.some((s) => s.subType === "together" && s.chunkRatings && Object.keys(s.chunkRatings).length > 0),
  },
  {
    type: "streak-3",
    label: "3-Day Streak! 🔥",
    icon: "🔥",
    check: (state) => getMaxStreak(state.practiceLog) >= 3,
  },
  {
    type: "streak-7",
    label: "7-Day Streak! 🔥🔥",
    icon: "🔥",
    check: (state) => getMaxStreak(state.practiceLog) >= 7,
  },
  {
    type: "streak-14",
    label: "14-Day Streak! 🔥🔥🔥",
    icon: "🔥",
    check: (state) => getMaxStreak(state.practiceLog) >= 14,
  },
  {
    type: "streak-30",
    label: "30-Day Streak! 🏅",
    icon: "🏅",
    check: (state) => getMaxStreak(state.practiceLog) >= 30,
  },
  {
    type: "chunk-mastery",
    label: "Chunk Master! 🌟",
    icon: "🌟",
    check: (state) => {
      // Any chunk that's been green in the last session
      const lastSession = [...state.sessions]
        .filter((s) => s.chunkRatings && Object.keys(s.chunkRatings).length > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      if (!lastSession) return false
      return Object.values(lastSession.chunkRatings).some((r) => r === "green")
    },
  },
  {
    type: "all-green",
    label: "Perfect Run! 💎",
    icon: "💎",
    check: (state) => {
      const lastSession = [...state.sessions]
        .filter((s) => s.chunkRatings && Object.keys(s.chunkRatings).length > 0)
        .sort((a, b) => new Date(b.date) - new Date(a.date))[0]
      if (!lastSession) return false
      return (
        Object.keys(lastSession.chunkRatings).length === state.chunks.length &&
        Object.values(lastSession.chunkRatings).every((r) => r === "green")
      )
    },
  },
  {
    type: "competition-done",
    label: "Competition Star! 🏆",
    icon: "🏆",
    check: (state) => {
      const now = new Date().toISOString().split("T")[0]
      return state.sessions.some((s) => s.type === "competition" && s.date <= now && s.emojiReactions.length > 0)
    },
  },
  {
    type: "rhythm-100",
    label: "Rhythm Master! 🎵",
    icon: "🎵",
    check: (state) => state.rhythmScores.some((s) => s.accuracy >= 100),
  },
]

function getMaxStreak(practiceLog) {
  if (!practiceLog || practiceLog.length === 0) return 0
  const sorted = [...practiceLog].sort()
  let maxStreak = 1
  let currentStreak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diff = (curr - prev) / (1000 * 60 * 60 * 24)
    if (diff === 1) {
      currentStreak++
      maxStreak = Math.max(maxStreak, currentStreak)
    } else if (diff > 1) {
      currentStreak = 1
    }
  }
  return maxStreak
}

export function getCurrentStreak(practiceLog) {
  if (!practiceLog || practiceLog.length === 0) return 0
  const sorted = [...practiceLog].sort().reverse()
  const today = new Date().toISOString().split("T")[0]
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0]

  if (sorted[0] !== today && sorted[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1])
    const curr = new Date(sorted[i])
    const diff = (prev - curr) / (1000 * 60 * 60 * 24)
    if (diff === 1) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export function checkForNewStickers(state) {
  const earned = state.stickers.map((s) => s.type)
  const newStickers = []
  for (const m of milestones) {
    if (!earned.includes(m.type) && m.check(state)) {
      newStickers.push({
        id: `sticker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type: m.type,
        label: m.label,
        icon: m.icon,
        earnedDate: new Date().toISOString().split("T")[0],
      })
    }
  }
  return newStickers
}
