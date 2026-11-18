import { inTransaction, type Db } from './open.ts'
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

export function desktopNotificationsEnabled(db: Db): boolean {
  return getMeta(db, 'desktop_notifications') !== '0'
}

export function setDesktopNotifications(db: Db, enabled: boolean): void {
  inTransaction(db, () => {
    if (enabled && !desktopNotificationsEnabled(db)) {
      db.prepare('UPDATE handoffs SET notification_processed_at = ? WHERE notification_processed_at IS NULL').run(nowSec())
    }
    setMeta(db, 'desktop_notifications', enabled ? '1' : '0')
  })
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

// Whether the queue runs ready tasks that no bot owns on its own. Off, a task runs only when the user presses run or
// a bot takes it. On by default, which is how the queue worked before bots.
export function queueAutorun(db: Db): boolean {
  return getMeta(db, 'queue_autorun') !== '0'
}

export function setQueueAutorun(db: Db, enabled: boolean): void {
  setMeta(db, 'queue_autorun', enabled ? '1' : '0')
}

export interface Appearance { font_family: string; font_size: number }
export const FONT_FAMILIES = ['system', 'pretendard', 'noto-sans-kr', 'ibm-plex-sans', 'serif', 'mono'] as const
export const FONT_SIZES = { min: 12, max: 20 }

export function appearance(db: Db): Appearance {
  const family = getMeta(db, 'ui_font_family') ?? 'system'
  const size = Number(getMeta(db, 'ui_font_size') ?? 15)
  return { font_family: family, font_size: Number.isInteger(size) ? size : 15 }
}

export function setAppearance(db: Db, value: Appearance): void {
  setMeta(db, 'ui_font_family', value.font_family)
  setMeta(db, 'ui_font_size', String(value.font_size))
}
