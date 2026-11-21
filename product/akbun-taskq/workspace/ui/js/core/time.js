// Times arrive as UTC epoch seconds and render in the browser's time zone.
export const HOUR = 3600

export const toEpoch = (date) => Math.floor(date.getTime() / 1000)

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date, n) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n)
}

// Weeks start on Sunday.
export function startOfWeek(date) {
  return addDays(startOfDay(date), -startOfDay(date).getDay())
}

export function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function addMonths(date, n) {
  return new Date(date.getFullYear(), date.getMonth() + n, 1)
}

const pad = (n) => String(n).padStart(2, '0')

// YYYY-MM-DD in local time, the format /api/stats/daily takes.
export function dayKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function fmtDateTime(sec) {
  return new Date(sec * 1000).toLocaleString(undefined, {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

// The exact moment for a tooltip: YY/MM/DD (weekday) hh:mm:ss, the weekday in the page's language.
export function fmtExact(sec) {
  const d = new Date(sec * 1000)
  const weekday = d.toLocaleDateString(document.documentElement.lang || undefined, { weekday: 'short' })
  return `${pad(d.getFullYear() % 100)}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} (${weekday}) ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export function fmtClock(sec) {
  return new Date(sec * 1000).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function fmtDay(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' })
}

export function fmtDuration(seconds) {
  if (seconds === null || seconds === undefined || seconds < 0) return '-'
  if (seconds < 60) return `${Math.round(seconds)}s`
  const m = Math.floor(seconds / 60)
  if (m < 60) return `${m}m ${pad(Math.round(seconds % 60))}s`
  return `${Math.floor(m / 60)}h ${pad(m % 60)}m`
}
