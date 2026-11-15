import type { Db } from './open.ts'
import { dayKey } from '../time.ts'
import { criticalAlertTimes } from './alerts.ts'
import { statsRuns, type RunFilter } from './runs.ts'

export interface DailyStat {
  date: string
  runs: number
  done: number
  by_type: Record<string, number>
  failed: number
  critical: number
  cost_usd: number
  top: string[]
}

// Computed on read from runs and alerts. Nothing is stored. Days are keyed by run start.
export function dailyStats(db: Db, from: number, to: number, filter: Omit<RunFilter, 'from' | 'to'> = {}): DailyStat[] {
  const days = new Map<string, DailyStat>()
  const get = (date: string): DailyStat => {
    let day = days.get(date)
    if (!day) {
      day = { date, runs: 0, done: 0, by_type: {}, failed: 0, critical: 0, cost_usd: 0, top: [] }
      days.set(date, day)
    }
    return day
  }
  for (const run of statsRuns(db, from, to, filter)) {
    const day = get(dayKey(run.started_at))
    day.runs += 1
    day.by_type[run.task_type] = (day.by_type[run.task_type] ?? 0) + 1
    if (run.outcome === 'done') day.done += 1
    if (run.outcome === 'failed') day.failed += 1
    // Running runs have no stats yet, so the column can be NULL.
    day.cost_usd += Number((JSON.parse(run.stats ?? '{}') as { cost_usd?: number }).cost_usd ?? 0)
    if (run.summary && day.top.length < 3) day.top.push(run.summary)
  }
  for (const createdAt of criticalAlertTimes(db, from, to, filter)) get(dayKey(createdAt)).critical += 1
  return [...days.values()].sort((a, b) => b.date.localeCompare(a.date))
}
