// Milestone definitions for auto-unlocking stickers
export const milestones = [
  {
    type: "first-practice",
    label: "First Practice! 💪",
    icon: "💪",
    check: (state) => (state.practiceLog || []).length >= 1,
  },
  {
    type: "first-video",
    label: "First Video! 📹",
    icon: "📹",
    check: (state) => (state.routines || []).some((r) => (r.practiceVideos || []).length > 0),
  },
  {
    type: "first-reflection",
    label: "Self-Coach! 🪞",
    icon: "🪞",
    check: (state) => (state.sessions || []).some((s) => s.islaReflection?.note),
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
    type: "first-show",
    label: "Show Star! ⭐",
    icon: "⭐",
    check: (state) => {
      const now = new Date().toISOString().split("T")[0]
      return (state.shows || []).some((s) => s.date <= now)
    },
  },
  {
    type: "first-goal",
    label: "Goal Setter! 🎯",
    icon: "🎯",
    check: (state) => (state.islaProfile?.goals || []).length > 0,
  },
  {
    type: "goal-completed",
    label: "Goal Achieved! 🏆",
    icon: "🏆",
    check: (state) => (state.islaProfile?.goals || []).some((g) => g.completedDate),
  },
  {
    type: "element-mastered",
    label: "Element Mastered! 🌟",
    icon: "🌟",
    check: (state) => (state.disciplines || []).some((d) =>
      (d.elements || []).some((e) => e.status === "mastered")
    ),
  },
  {
    type: "exam-passed",
    label: "Exam Passed! 🎓",
    icon: "🎓",
    check: (state) => (state.disciplines || []).some((d) =>
      (d.gradeHistory || []).some((g) => g.result === "pass" || g.result === "merit" || g.result === "distinction")
    ),
  },
  {
    type: "five-shows",
    label: "5 Shows! 🌟🌟",
    icon: "🌟",
    check: (state) => {
      const now = new Date().toISOString().split("T")[0]
      return (state.shows || []).filter((s) => s.date <= now).length >= 5
    },
  },
  {
    type: "first-scrapbook",
    label: "Scrapbook Started! 📖",
    icon: "📖",
    check: (state) => (state.shows || []).some((s) => (s.scrapbookEntries || []).length > 0),
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
