import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { insertEvent } from './events.ts'
import { desktopNotificationsEnabled } from './meta.ts'
import type { HandoffRecord, TaskHandoff } from '../types.ts'
import { nowSec } from '../time.ts'

const HANDOFF_FIELDS = 'id, source_task_id, target_task_id, run_id, output_path, summary, created_at, accepted_at, accepted_via'
const HISTORY_LIMIT = 50

export function listHandoffs(db: Db, taskId?: string): HandoffRecord[] {
  return db.prepare(`SELECT ${HANDOFF_FIELDS}, CASE
    WHEN NOT EXISTS (SELECT 1 FROM current_handoffs c WHERE c.id = h.id) THEN 'superseded'
    WHEN h.accepted_at IS NULL THEN 'pending' ELSE 'accepted' END AS status
    FROM handoffs h WHERE (? IS NULL OR h.source_task_id = ? OR h.target_task_id = ?)
    ORDER BY status = 'pending' DESC, h.id DESC LIMIT ?`)
    .all(taskId ?? null, taskId ?? null, taskId ?? null, HISTORY_LIMIT) as unknown as HandoffRecord[]
}

export function listTaskHandoffs(db: Db, taskId: string): TaskHandoff[] {
  return db.prepare(`SELECT id, source_task_id AS task_id, run_id, output_path, summary, accepted_via
    FROM current_handoffs WHERE target_task_id = ? AND accepted_at IS NOT NULL ORDER BY source_task_id`)
    .all(taskId) as unknown as TaskHandoff[]
}

export function handoffMode(db: Db, taskId: string): boolean | undefined {
  const row = db.prepare("SELECT json_extract(data, '$.auto_accept_handoffs') IS NOT 0 AS automatic FROM tasks WHERE id = ?").get(taskId)
  return row ? row.automatic === 1 : undefined
}

type Accepted = { id: number; target_task_id: string }

function recordAcceptance(db: Db, row: Accepted, method: 'manual' | 'auto'): void {
  db.prepare("UPDATE alerts SET acked_at = ? WHERE kind = 'handoff_received' AND task_id = ? AND ref = ? AND acked_at IS NULL")
    .run(nowSec(), row.target_task_id, String(row.id))
  insertEvent(db, { task_id: row.target_task_id, run_id: null, kind: 'handoff_accepted', payload: { handoff_id: row.id, accepted_via: method } })
}

export function acceptHandoff(db: Db, id: number): boolean {
  return inTransaction(db, () => {
    const row = db.prepare(`UPDATE handoffs SET accepted_at = ?, accepted_via = 'manual'
      WHERE id = ? AND accepted_at IS NULL AND id IN (SELECT id FROM current_handoffs)
      RETURNING id, target_task_id`).get(nowSec(), id) as Accepted | undefined
    if (!row) return false
    recordAcceptance(db, row, 'manual')
    return true
  })
}

export function setHandoffMode(db: Db, taskId: string, automatic: boolean): boolean {
  return inTransaction(db, () => {
    const changed = db.prepare("UPDATE tasks SET data = json_set(data, '$.auto_accept_handoffs', json(?)), updated_at = ? WHERE id = ?")
      .run(JSON.stringify(automatic), nowSec(), taskId).changes === 1
    if (!changed || !automatic) return changed
    const rows = db.prepare(`UPDATE handoffs SET accepted_at = ?, accepted_via = 'auto'
      WHERE target_task_id = ? AND accepted_at IS NULL AND id IN (SELECT id FROM current_handoffs WHERE target_task_id = ?)
      RETURNING id, target_task_id`).all(nowSec(), taskId, taskId) as unknown as Accepted[]
    for (const row of rows) recordAcceptance(db, row, 'auto')
    return true
  })
}

export function takeHandoffNotices(db: Db) {
  return inTransaction(db, () => {
    const rows = db.prepare(`SELECT h.id, h.target_task_id, a.message, a.acked_at FROM handoffs h JOIN alerts a
      ON a.task_id = h.target_task_id AND a.kind = 'handoff_received' AND a.ref = CAST(h.id AS TEXT)
      WHERE h.notification_processed_at IS NULL ORDER BY h.id`).all() as unknown as {
        id: number; target_task_id: string; message: string; acked_at: number | null
      }[]
    if (rows.length > 0) db.prepare('UPDATE handoffs SET notification_processed_at = ? WHERE notification_processed_at IS NULL').run(nowSec())
    return { notices: rows.filter((row) => row.acked_at === null), enabled: desktopNotificationsEnabled(db) }
  })
}
