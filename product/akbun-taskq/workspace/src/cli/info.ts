import { parseArgs } from 'node:util'
import { listAlerts } from '../db/alerts.ts'
import { runsInRange } from '../db/runs.ts'
import { searchHistory } from '../db/search.ts'
import { dayEnd, dayKey, dayStart, isDay, nowSec } from '../time.ts'
import type { Command } from './types.ts'

export const alerts: Command = ({ db }) => {
  for (const alert of listAlerts(db, false)) {
    console.log(`[${alert.severity}] ${alert.kind}  ${alert.task_id ?? '-'}  ${alert.message}`)
  }
}

export const log: Command = ({ db }, args) => {
  const { values } = parseArgs({ args, strict: true, allowPositionals: false, options: { date: { type: 'string' } } })
  const day = values.date ?? dayKey(nowSec())
  if (!isDay(day)) throw new Error('--date must be YYYY-MM-DD')
  for (const run of runsInRange(db, dayStart(day), dayEnd(day)) as { started_at: number; task_type: string; outcome: string | null; summary: string | null }[]) {
    const time = new Date(run.started_at * 1000).toTimeString().slice(0, 8)
    console.log(`${time}  ${run.task_type.padEnd(16)} ${(run.outcome ?? 'running').padEnd(12)} ${run.summary ?? ''}`)
  }
}

export const search: Command = ({ db }, args) => {
  const query = args.join(' ')
  if (!query) throw new Error('search query is required')
  for (const hit of searchHistory(db, query) as { task_id: string; run_id: string; snippet: string }[]) {
    console.log(`${hit.task_id}  ${hit.run_id}  ${hit.snippet.replace(/\n/g, ' ')}`)
  }
}
