import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import { newId } from '../ids.ts'
import { nowSec } from '../time.ts'
import { jobsChanged } from '../wake.ts'

export type JobStatus = 'queued' | 'running' | 'cancelled' | 'done' | 'failed'

export interface Job {
  id: string
  kind: string
  status: JobStatus
  params: Record<string, unknown>
  checkpoint: Record<string, unknown> | null
  done: number
  total: number | null
  message: string | null
  result: Record<string, unknown> | null
  error: string | null
  cancel_requested: boolean
  created_at: number
  updated_at: number
  ended_at: number | null
}

const json = (value: unknown) => (value === null || value === undefined ? null : JSON.parse(String(value)))

function toJob(row: Record<string, unknown>): Job {
  return {
    id: String(row.id), kind: String(row.kind), status: row.status as JobStatus, params: json(row.params) ?? {},
    checkpoint: json(row.checkpoint), done: Number(row.done), total: row.total === null ? null : Number(row.total),
    message: row.message === null ? null : String(row.message), result: json(row.result), error: row.error === null ? null : String(row.error),
    cancel_requested: row.cancel_requested === 1, created_at: Number(row.created_at), updated_at: Number(row.updated_at),
    ended_at: row.ended_at === null ? null : Number(row.ended_at),
  }
}

export function createJob(db: Db, kind: string, params: Record<string, unknown>): Job {
  const id = newId()
  const now = nowSec()
  db.prepare(`INSERT INTO jobs (id, kind, status, params, created_at, updated_at) VALUES (?, ?, 'queued', ?, ?, ?)`).run(id, kind, JSON.stringify(params), now, now)
  jobsChanged.notify()
  return getJob(db, id)!
}

export function getJob(db: Db, id: string): Job | undefined {
  const row = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id)
  return row ? toJob(row) : undefined
}

export function listJobs(db: Db, limit = 50, kind?: string): Job[] {
  const rows = kind
    ? db.prepare('SELECT * FROM jobs WHERE kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(kind, limit)
    : db.prepare('SELECT * FROM jobs ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit)
  return rows.map(toJob)
}

// The oldest queued job becomes running. One process runs jobs at a time; the update guards against a second one.
export function claimNextJob(db: Db): Job | undefined {
  return inTransaction(db, () => {
    const row = db.prepare(`SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at, rowid LIMIT 1`).get()
    if (!row) return undefined
    const changed = db.prepare(`UPDATE jobs SET status = 'running', cancel_requested = 0, error = NULL, updated_at = ? WHERE id = ? AND status = 'queued'`)
      .run(nowSec(), String(row.id)).changes
    return changed === 1 ? getJob(db, String(row.id)) : undefined
  })
}

export function saveProgress(db: Db, id: string, progress: { done: number; total?: number | null; checkpoint?: unknown; message?: string }): void {
  db.prepare(`UPDATE jobs SET done = ?, total = COALESCE(?, total), checkpoint = COALESCE(?, checkpoint), message = COALESCE(?, message), updated_at = ?
    WHERE id = ?`).run(progress.done, progress.total ?? null, progress.checkpoint === undefined ? null : JSON.stringify(progress.checkpoint),
    progress.message ?? null, nowSec(), id)
}

export function isCancelRequested(db: Db, id: string): boolean {
  return db.prepare('SELECT cancel_requested FROM jobs WHERE id = ?').get(id)?.cancel_requested === 1
}

export function endJob(db: Db, id: string, end: { status: 'done' | 'failed' | 'cancelled'; result?: unknown; error?: string; message?: string }): void {
  db.prepare(`UPDATE jobs SET status = ?, result = COALESCE(?, result), error = ?, message = COALESCE(?, message), cancel_requested = 0, updated_at = ?, ended_at = ?
    WHERE id = ?`).run(end.status, end.result === undefined ? null : JSON.stringify(end.result), end.error?.slice(0, 1000) ?? null,
    end.message ?? null, nowSec(), nowSec(), id)
  jobsChanged.notify()
}

// A queued job is cancelled at once; a running one stops after its current step, keeping its checkpoint.
export function cancelJob(db: Db, id: string): Job | undefined {
  const job = getJob(db, id)
  if (!job) return undefined
  if (job.status === 'queued') endJob(db, id, { status: 'cancelled', message: 'cancelled before it started' })
  else if (job.status === 'running') db.prepare('UPDATE jobs SET cancel_requested = 1, updated_at = ? WHERE id = ?').run(nowSec(), id)
  jobsChanged.notify()
  return getJob(db, id)
}

// A cancelled or failed job goes back to the queue and continues from its checkpoint.
export function resumeJob(db: Db, id: string): Job | undefined {
  const changed = db.prepare(`UPDATE jobs SET status = 'queued', error = NULL, ended_at = NULL, updated_at = ? WHERE id = ? AND status IN ('cancelled', 'failed')`)
    .run(nowSec(), id).changes
  if (changed) jobsChanged.notify()
  return changed ? getJob(db, id) : undefined
}

// After a restart nothing is running in this process: running jobs go back to the queue and continue from their checkpoint.
export function recoverJobs(db: Db): number {
  return Number(db.prepare(`UPDATE jobs SET status = 'queued', updated_at = ? WHERE status = 'running'`).run(nowSec()).changes)
}
