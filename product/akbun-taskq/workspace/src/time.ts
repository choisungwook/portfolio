export function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

// A YYYY-MM-DD string that names a real calendar day. 2026-02-30 and 2026-13-01 are rejected.
export function isDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
}

// Local midnight of a YYYY-MM-DD day, as epoch seconds.
export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(new Date(y, m - 1, d).getTime() / 1000)
}

export function dayKey(ts: number): string {
  const d = new Date(ts * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Local midnight after a YYYY-MM-DD day, as epoch seconds.
export function dayEnd(day: string): number {
  const [y, m, d] = day.split('-').map(Number)
  return Math.floor(new Date(y, m - 1, d + 1).getTime() / 1000)
}
