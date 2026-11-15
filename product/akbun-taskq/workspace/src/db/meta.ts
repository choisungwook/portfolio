import type { Db } from './open.ts'
import { nowSec } from '../time.ts'

// Who paused the queue. A user pause survives a successful preflight; only a preflight pause is cleared by one.
export type PauseBy = 'user' | 'preflight'

export function getMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key)
  return row ? String(row.value) : null
}

export function setMeta(db: Db, key: string, value: string): void {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function isQueuePaused(db: Db): boolean {
  return getMeta(db, 'queue_paused') === '1'
}

export function pauseBy(db: Db): string | null {
  return getMeta(db, 'pause_by')
}

export function pauseQueue(db: Db, reason: string, by: PauseBy): void {
  setMeta(db, 'queue_paused', '1')
  setMeta(db, 'pause_reason', reason)
  setMeta(db, 'pause_by', by)
}

export function resumeQueue(db: Db): void {
  setMeta(db, 'queue_paused', '0')
  setMeta(db, 'pause_reason', '')
  setMeta(db, 'pause_by', '')
}

// A cancel request is a marker the owning runner polls. The key is per task, so a retry can clear it.
const cancelKey = (taskId: string) => `cancel:${taskId}`

export function requestCancelMarker(db: Db, taskId: string): void {
  setMeta(db, cancelKey(taskId), String(nowSec()))
}

export function isCancelRequested(db: Db, taskId: string): boolean {
  return getMeta(db, cancelKey(taskId)) !== null
}

export function clearCancelMarker(db: Db, taskId: string): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(cancelKey(taskId))
}
