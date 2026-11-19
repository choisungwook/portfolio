// A small 5-field cron (minute hour day-of-month month day-of-week) in local time, for bot routines. Each field takes
// `*`, a number, a range `a-b`, a step `*/n` or `a-b/n`, and lists of those joined by commas. Day-of-week 0 and 7 are
// Sunday. When both day fields are restricted, a day matching either one counts, as in standard cron.

interface Field {
  min: number
  max: number
}

const FIELDS: Field[] = [{ min: 0, max: 59 }, { min: 0, max: 23 }, { min: 1, max: 31 }, { min: 1, max: 12 }, { min: 0, max: 7 }]

export interface Cron {
  minutes: Set<number>
  hours: Set<number>
  days: Set<number>
  months: Set<number>
  weekdays: Set<number>
  anyDay: boolean
  anyWeekday: boolean
}

function parseField(text: string, field: Field): Set<number> {
  const out = new Set<number>()
  for (const part of text.split(',')) {
    const [range, stepText] = part.split('/')
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${part}"`)
    let from = field.min
    let to = field.max
    if (range !== '*') {
      const [a, b] = range.split('-')
      from = Number(a)
      to = b === undefined ? (stepText === undefined ? from : field.max) : Number(b)
    }
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < field.min || to > field.max || from > to) {
      throw new Error(`"${part}" is outside ${field.min}-${field.max}`)
    }
    for (let n = from; n <= to; n += step) out.add(n)
  }
  return out
}

export function parseCron(expression: string): Cron {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error('a schedule has 5 fields: minute hour day-of-month month day-of-week (e.g. "0 7 * * *")')
  const [minutes, hours, days, months, weekdays] = parts.map((part, i) => parseField(part, FIELDS[i]))
  if (weekdays.has(7)) weekdays.add(0)
  return { minutes, hours, days, months, weekdays, anyDay: parts[2] === '*', anyWeekday: parts[4] === '*' }
}

function dayMatches(cron: Cron, date: Date): boolean {
  const day = cron.days.has(date.getDate())
  const weekday = cron.weekdays.has(date.getDay())
  if (cron.anyDay && cron.anyWeekday) return true
  if (cron.anyDay) return weekday
  if (cron.anyWeekday) return day
  return day || weekday
}

// The first matching minute strictly after `after` (seconds), searched for up to about four years.
export function nextRun(expression: string, after: number): number | null {
  const cron = parseCron(expression)
  const date = new Date((Math.floor(after / 60) + 1) * 60_000)
  const limit = after + 4 * 366 * 86_400
  while (date.getTime() / 1000 <= limit) {
    if (!cron.months.has(date.getMonth() + 1)) {
      date.setMonth(date.getMonth() + 1, 1)
      date.setHours(0, 0, 0, 0)
      continue
    }
    if (!dayMatches(cron, date)) {
      date.setDate(date.getDate() + 1)
      date.setHours(0, 0, 0, 0)
      continue
    }
    if (!cron.hours.has(date.getHours())) {
      date.setHours(date.getHours() + 1, 0, 0, 0)
      continue
    }
    if (!cron.minutes.has(date.getMinutes())) {
      date.setMinutes(date.getMinutes() + 1, 0, 0)
      continue
    }
    return Math.floor(date.getTime() / 1000)
  }
  return null
}
