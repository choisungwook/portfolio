import type { Db } from './open.ts'
import type { EventKind } from '../types.ts'
import { maskDeep } from '../mask.ts'
import { nowSec } from '../time.ts'

export interface EventRow {
  id: number; task_id: string; run_id: string | null; ts: number; kind: string; payload: string
}

export function insertEvent(db: Db, event: {
  task_id: string; run_id: string | null; kind: EventKind; payload: Record<string, unknown>
}): number {
  const payload = JSON.stringify(maskDeep(event.payload))
  const result = db.prepare('INSERT INTO events (task_id, run_id, ts, kind, payload) VALUES (?, ?, ?, ?, ?)')
    .run(event.task_id, event.run_id, nowSec(), event.kind, payload)
  return Number(result.lastInsertRowid)
}

// Oldest first by default. `desc` returns the newest rows first, which is what a task log shows.
export function listEvents(db: Db, filter: {
  task_id?: string; run_id?: string; after?: number; limit?: number; order?: 'asc' | 'desc'
}): EventRow[] {
  const args = [filter.task_id ?? null, filter.task_id ?? null, filter.run_id ?? null, filter.run_id ?? null,
    filter.after ?? 0, filter.limit ?? 500]
  const where = `WHERE (? IS NULL OR task_id = ?) AND (? IS NULL OR run_id = ?) AND id > ?`
  // The ORDER BY text comes from this fixed pair, never from request input.
  const sql = filter.order === 'desc'
    ? `SELECT * FROM events ${where} ORDER BY id DESC LIMIT ?`
    : `SELECT * FROM events ${where} ORDER BY id LIMIT ?`
  return db.prepare(sql).all(...args) as unknown as EventRow[]
}

export function latestEventId(db: Db): number {
  return Number(db.prepare('SELECT COALESCE(MAX(id), 0) AS id FROM events').get()?.id ?? 0)
}

export function listEventsOfRun(db: Db, runId: string): EventRow[] {
  return db.prepare('SELECT * FROM events WHERE run_id = ? ORDER BY id').all(runId) as unknown as EventRow[]
}
