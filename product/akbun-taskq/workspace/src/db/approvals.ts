import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { insertEvent } from './events.ts'
import { ackOpenAlerts } from './alerts.ts'
import { TASK_TITLE_SQL } from './tasks.ts'
import { nowSec } from '../time.ts'

// Raised when a decision names a request that is not the task's open request. The API maps it to 409.
export class ApprovalError extends Error {}

export interface PendingApproval {
  request_id: string; tool: string; input: unknown; bytes: number; created_at: number
}

interface OpenRow {
  request_id: string; task_id: string; run_id: string; tool: string; input: string | null; created_at: number
}

export function insertApproval(db: Db, row: {
  request_id: string; task_id: string; run_id: string; tool: string; input: string; created_at: number
}): void {
  db.prepare(`INSERT INTO approvals (request_id, task_id, run_id, tool, input, created_at) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(row.request_id, row.task_id, row.run_id, row.tool, row.input, row.created_at)
}

// The exact input text, as the worker will run it. Stored unmasked and unclipped only while the request is open.
function toPending(row: OpenRow): PendingApproval {
  const text = row.input ?? 'null'
  return {
    request_id: row.request_id, tool: row.tool, input: JSON.parse(text) as unknown,
    bytes: Buffer.byteLength(text), created_at: row.created_at,
  }
}

export function openApproval(db: Db, taskId: string): PendingApproval | null {
  const row = db.prepare(`SELECT request_id, task_id, run_id, tool, input, created_at FROM approvals
    WHERE task_id = ? AND decision IS NULL`).get(taskId) as unknown as OpenRow | undefined
  return row ? toPending(row) : null
}

export function listOpenApprovals(db: Db): (PendingApproval & { task_id: string; task_title: string | null })[] {
  const rows = db.prepare(`SELECT a.request_id, a.task_id, a.run_id, a.tool, a.input, a.created_at, ${TASK_TITLE_SQL}
    FROM approvals a JOIN tasks t ON t.id = a.task_id WHERE a.decision IS NULL ORDER BY a.created_at`)
    .all() as unknown as (OpenRow & { task_title: string | null })[]
  return rows.map((row) => ({ ...toPending(row), task_id: row.task_id, task_title: row.task_title }))
}

// Answers the task's single open request. Refuses any other request id, so a stale card or a second click cannot
// answer a later command. The same transaction acknowledges the task's open approval_required alerts.
export function decideApproval(db: Db, taskId: string, requestId: string, approve: boolean): void {
  inTransaction(db, () => {
    const open = db.prepare('SELECT request_id, run_id FROM approvals WHERE task_id = ? AND decision IS NULL')
      .all(taskId) as { request_id: string; run_id: string }[]
    if (open.length !== 1) throw new ApprovalError('no open approval request')
    if (open[0].request_id !== requestId) throw new ApprovalError('request_id is not the open approval request')
    const now = nowSec()
    const changed = db.prepare(`UPDATE tasks SET status = 'running', updated_at = ?
      WHERE id = ? AND status = 'needs_approval'`).run(now, taskId)
    if (changed.changes !== 1) throw new ApprovalError('task is not waiting for approval')
    const kind = approve ? 'approved' : 'denied'
    db.prepare('UPDATE approvals SET decision = ?, decided_at = ?, input = NULL WHERE request_id = ?').run(kind, now, requestId)
    insertEvent(db, { task_id: taskId, run_id: open[0].run_id, kind, payload: { request_id: requestId } })
    ackOpenAlerts(db, taskId, 'approval_required')
  })
}

// The decision recorded for one request: approved, denied or expired. Null while it is still open.
export function approvalDecision(db: Db, requestId: string): string | null {
  const row = db.prepare('SELECT decision FROM approvals WHERE request_id = ?').get(requestId)
  return row?.decision === null || row === undefined ? null : String(row.decision)
}

// Ends every open request of a run or a task. The unmasked input is removed with it.
export function expireApprovals(db: Db, column: 'run_id' | 'task_id', value: string, now: number): void {
  db.prepare(`UPDATE approvals SET decision = 'expired', decided_at = ?, input = NULL WHERE ${column} = ? AND decision IS NULL`)
    .run(now, value)
}
