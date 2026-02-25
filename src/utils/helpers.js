const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
]

function parseDateValue(dateValue) {
  const date = new Date(dateValue)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatOrdinalDay(day) {
  const mod100 = day % 100
  if (mod100 >= 11 && mod100 <= 13) return `${day}th`

  const mod10 = day % 10
  if (mod10 === 1) return `${day}st`
  if (mod10 === 2) return `${day}nd`
  if (mod10 === 3) return `${day}rd`
  return `${day}th`
}

function formatDateLabel(date, includeWeekday = false) {
  const ordinalDay = formatOrdinalDay(date.getDate())
  const month = MONTH_NAMES[date.getMonth()]
  const currentYear = new Date().getFullYear()
  const yearSuffix = date.getFullYear() === currentYear ? "" : ` ${date.getFullYear()}`

  if (includeWeekday) {
    const weekday = WEEKDAY_NAMES[date.getDay()]
    return `${weekday}, ${ordinalDay} ${month}${yearSuffix}`
  }

  return `${ordinalDay} ${month}${yearSuffix}`
}

export function formatDate(dateStr) {
  const date = parseDateValue(dateStr)
  if (!date) return "—"

  return formatDateLabel(date)
}

export function formatDateWithWeekday(dateStr) {
  const date = parseDateValue(dateStr)
  if (!date) return "—"

  return formatDateLabel(date, true)
}

export function formatDateLong(dateStr) {
  return formatDateWithWeekday(dateStr)
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
