export function formatDate(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
}

export function formatDateLong(dateStr) {
  const d = new Date(dateStr)
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
}

export function daysUntil(dateStr) {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr)
  target.setHours(0, 0, 0, 0)
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24))
}

export function isToday(dateStr) {
  return dateStr === new Date().toISOString().split("T")[0]
}

export function isPast(dateStr) {
  return dateStr < new Date().toISOString().split("T")[0]
}

export function isFuture(dateStr) {
  return dateStr > new Date().toISOString().split("T")[0]
}

export function getSessionIcon(type) {
  switch (type) {
    case "practice": return "🎵"
    case "lesson": return "👩‍🏫"
    case "competition": return "🏆"
    default: return "📌"
  }
}

export function getSessionColor(type) {
  switch (type) {
    case "practice": return "#a855f7"
    case "lesson": return "#3b82f6"
    case "competition": return "#f59e0b"
    default: return "#737373"
  }
}

export function getTrafficLightColor(rating) {
  switch (rating) {
    case "green": return "#22c55e"
    case "yellow": return "#facc15"
    case "red": return "#ef4444"
    default: return "#e5e5e5"
  }
}

export function getTrafficLightEmoji(rating) {
  switch (rating) {
    case "green": return "🟢"
    case "yellow": return "🟡"
    case "red": return "🔴"
    default: return "⚪"
  }
}

export function generateId(prefix = "item") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

export function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

export function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay()
}
