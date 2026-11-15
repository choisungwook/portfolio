import type { Db } from './open.ts'
import type { AlertKind, Severity } from '../types.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'
import { TASK_TITLE_SQL } from './tasks.ts'
import { filterBinds, type RunFilter } from './runs.ts'

export interface AlertRow {
  id: number; task_id: string | null; run_id: string | null; severity: Severity; kind: AlertKind
  message: string; created_at: number; acked_at: number | null; task_title: string | null; ref: string | null
}

export function insertAlert(db: Db, alert: {
  task_id: string | null; run_id: string | null; severity: Severity; kind: AlertKind; message: string; ref?: string | null
}): number {
  const result = db.prepare(`INSERT INTO alerts (task_id, run_id, severity, kind, message, created_at, ref)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(alert.task_id, alert.run_id, alert.severity, alert.kind, mask(alert.message), nowSec(), alert.ref ?? null)
  return Number(result.lastInsertRowid)
}

// Unacked first, then by severity, then newest first.
export function listAlerts(db: Db, all: boolean): AlertRow[] {
  return db.prepare(`SELECT a.*, ${TASK_TITLE_SQL} FROM alerts a LEFT JOIN tasks t ON t.id = a.task_id
    WHERE ? = 1 OR a.acked_at IS NULL
    ORDER BY a.acked_at IS NOT NULL, CASE a.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, a.created_at DESC
    LIMIT 500`).all(all ? 1 : 0) as unknown as AlertRow[]
}

// Acknowledges a task's open alerts of one kind. Used when a task is recovered, so a restart does not pile up duplicates.
export function ackOpenAlerts(db: Db, taskId: string, kind: AlertKind): void {
  db.prepare('UPDATE alerts SET acked_at = ? WHERE task_id = ? AND kind = ? AND acked_at IS NULL').run(nowSec(), taskId, kind)
}

export function ackAlert(db: Db, id: number): boolean {
  return db.prepare('UPDATE alerts SET acked_at = ? WHERE id = ? AND acked_at IS NULL').run(nowSec(), id).changes === 1
}

// Critical alerts in [from, to). Type and lock_key match the alert's task; outcome matches the alert's run.
export function criticalAlertTimes(db: Db, from: number, to: number, filter: Omit<RunFilter, 'from' | 'to'>): number[] {
  const rows = db.prepare(`SELECT a.created_at FROM alerts a LEFT JOIN tasks t ON t.id = a.task_id
    WHERE a.severity = 'critical' AND a.created_at >= ? AND a.created_at < ?
      AND (? IS NULL OR t.type = ?) AND (? IS NULL OR t.lock_key = ?)
      AND (? IS NULL OR EXISTS (SELECT 1 FROM runs r WHERE r.id = a.run_id AND r.outcome = ?))`)
    .all(from, to, ...filterBinds(filter)) as { created_at: number }[]
  return rows.map((row) => row.created_at)
}

export function alertsOfTask(db: Db, taskId: string): AlertRow[] {
  return db.prepare('SELECT * FROM alerts WHERE task_id = ? ORDER BY created_at DESC').all(taskId) as unknown as AlertRow[]
}

export function alertsOfRun(db: Db, runId: string): AlertRow[] {
  return db.prepare('SELECT * FROM alerts WHERE run_id = ? ORDER BY id').all(runId) as unknown as AlertRow[]
}
