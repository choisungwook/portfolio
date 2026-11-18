import type { Db } from './open.ts'
import type { Outcome, RunStats } from '../types.ts'
import { mask } from '../mask.ts'
import { expireApprovals } from './approvals.ts'
import { TASK_TITLE_SQL } from './tasks.ts'

export interface RunFilter { from?: number; to?: number; type?: string; lock_key?: string; outcome?: string }

export function insertRun(db: Db, run: { id: string; task_id: string; session_id: string | null; started_at: number; output_path?: string; bot?: string }): void {
  db.prepare('INSERT INTO runs (id, task_id, session_id, started_at, output_path, bot) VALUES (?, ?, ?, ?, ?, ?)')
    .run(run.id, run.task_id, run.session_id, run.started_at, run.output_path ?? null, run.bot ?? null)
}

export function setRunSession(db: Db, runId: string, sessionId: string): void {
  db.prepare('UPDATE runs SET session_id = ? WHERE id = ?').run(sessionId, runId)
}

// Closes a run and writes its history row. Summary and history body are masked here. With an owner, the run closes
// only while that runner still holds the task's claim, so a late finisher cannot overwrite a recovered run.
// Returns false when nothing was closed.
export function endRun(db: Db, run: {
  id: string; task_id: string; intent: string; outcome: Outcome; summary: string | null; stats: RunStats; ended_at: number
}, owner?: string): boolean {
  const summary = run.summary === null ? null : mask(run.summary)
  const owned = owner === undefined ? '' : 'AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = runs.task_id AND t.claimed_by = ?)'
  const binds = [run.ended_at, run.outcome, summary, JSON.stringify(run.stats), run.id, ...(owner === undefined ? [] : [owner])]
  const changed = db.prepare(`UPDATE runs SET ended_at = ?, outcome = ?, summary = ?, stats = ? WHERE id = ? AND ended_at IS NULL ${owned}`)
    .run(...binds).changes === 1
  if (!changed) return false
  expireApprovals(db, 'run_id', run.id, run.ended_at)
  db.prepare('INSERT INTO history_fts (task_id, run_id, body) VALUES (?, ?, ?)')
    .run(run.task_id, run.id, mask(`${run.intent}\n${summary ?? ''}`))
  return true
}

export function openRunOf(db: Db, taskId: string): { id: string; session_id: string | null } | undefined {
  return db.prepare('SELECT id, session_id FROM runs WHERE task_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
    .get(taskId) as { id: string; session_id: string | null } | undefined
}

// Stale runs since the task's last run that did not end stale. rowid is insertion order, so it orders runs in time.
export function countStaleRuns(db: Db, taskId: string): number {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM runs WHERE task_id = ? AND outcome = 'stale'
    AND rowid > COALESCE((SELECT MAX(rowid) FROM runs WHERE task_id = ? AND outcome IS NOT NULL AND outcome != 'stale'), 0)`)
    .get(taskId, taskId)?.n ?? 0)
}

// Filter values are bound as pairs so a NULL means "no filter" in one statement.
export const FILTER_SQL = `(? IS NULL OR t.type = ?) AND (? IS NULL OR t.lock_key = ?) AND (? IS NULL OR r.outcome = ?)`

export function filterBinds(filter: Omit<RunFilter, 'from' | 'to'>): (string | null)[] {
  const pair = (value?: string) => [value ?? null, value ?? null]
  return [...pair(filter.type), ...pair(filter.lock_key), ...pair(filter.outcome)]
}

export const RUN_CAP = 500

// Runs that overlap [from, to): started before `to` and not ended before `from`. Still-running runs overlap any later range.
export function listRuns(db: Db, filter: RunFilter & { limit: number }) {
  const from = filter.from ?? null
  const to = filter.to ?? null
  return db.prepare(`SELECT r.id, r.task_id, r.session_id, r.started_at, r.ended_at, r.outcome, r.summary, r.stats,
      ${TASK_TITLE_SQL}, t.type AS task_type, t.lock_key AS lock_key
    FROM runs r JOIN tasks t ON t.id = r.task_id
    WHERE (? IS NULL OR r.ended_at IS NULL OR r.ended_at > ?) AND (? IS NULL OR r.started_at < ?) AND ${FILTER_SQL}
    ORDER BY r.started_at DESC LIMIT ?`).all(from, from, to, to, ...filterBinds(filter), filter.limit) as unknown as RunRow[]
}

export interface RunRow {
  id: string; task_id: string; session_id: string | null; started_at: number; ended_at: number | null
  outcome: string | null; summary: string | null; stats: string; task_title: string | null; task_type: string; lock_key: string | null
}

// Runs that started in [from, to), for the daily counts.
export function statsRuns(db: Db, from: number, to: number, filter: Omit<RunFilter, 'from' | 'to'>) {
  return db.prepare(`SELECT r.started_at, r.outcome, r.summary, r.stats, t.type AS task_type
    FROM runs r JOIN tasks t ON t.id = r.task_id WHERE r.started_at >= ? AND r.started_at < ? AND ${FILTER_SQL}
    ORDER BY r.started_at DESC`).all(from, to, ...filterBinds(filter)) as unknown as StatsRunRow[]
}

export interface StatsRunRow {
  started_at: number; outcome: string | null; summary: string | null; stats: string; task_type: string
}

export function getRun(db: Db, id: string) {
  return db.prepare(`SELECT r.*, t.data AS task_data, t.type AS task_type, t.lock_key AS lock_key
    FROM runs r JOIN tasks t ON t.id = r.task_id WHERE r.id = ?`).get(id)
}

export function runsInRange(db: Db, from: number, to: number) {
  return db.prepare(`SELECT r.id, r.started_at, r.outcome, r.summary, r.stats, t.type AS task_type
    FROM runs r JOIN tasks t ON t.id = r.task_id WHERE r.started_at >= ? AND r.started_at < ?
    ORDER BY r.started_at DESC`).all(from, to)
}

export function listRunsOfTask(db: Db, taskId: string) {
  return db.prepare('SELECT id, session_id, started_at, ended_at, outcome, summary, stats FROM runs WHERE task_id = ? ORDER BY started_at DESC')
    .all(taskId)
}
