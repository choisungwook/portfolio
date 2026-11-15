import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import type { Config } from '../config.ts'
import type { Task, TaskStatus } from '../types.ts'
import { insertEvent } from './events.ts'
import { ackOpenAlerts } from './alerts.ts'
import { expireApprovals } from './approvals.ts'
import { endRun, openRunOf } from './runs.ts'
import { getTask, releaseTask } from './tasks.ts'
import { clearCancelMarker, requestCancelMarker } from './meta.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'

// Raised for an operator action the task's status does not allow. The API maps it to 409.
export class OperatorError extends Error {}

export const CANCEL_SUMMARY = 'cancelled by user'
export const DEFAULT_PAUSE_REASON = 'paused by user'
export const CANCELLABLE: TaskStatus[] = ['running', 'needs_approval', 'needs_auth']

// The reason a user gives for a pause. Masked, because the reason is shown in the UI and the CLI.
export function pauseReason(value: unknown): string {
  if (value === undefined || value === null || value === '') return DEFAULT_PAUSE_REASON
  if (typeof value !== 'string' || value.length > 200) throw new OperatorError('reason must be a string up to 200 characters')
  return mask(value.trim()) || DEFAULT_PAUSE_REASON
}

// Ends a task as cancelled by the user. With an owner, nothing is written unless that runner still holds the claim.
// Without an owner (a needs_auth task, or a task whose runner is gone), the status must still be cancellable.
// The open run closes as failed, its open requests expire, and no failed alert is raised: the user did it.
export function closeCancelled(db: Db, task: Task, owner?: string): boolean {
  return inTransaction(db, () => {
    const current = getTask(db, task.id)
    if (!current) return false
    if (owner !== undefined ? current.claimed_by !== owner : !CANCELLABLE.includes(current.status)) return false
    const open = openRunOf(db, task.id)
    const now = nowSec()
    if (open) {
      endRun(db, {
        id: open.id, task_id: task.id, intent: task.data.intent, outcome: 'failed',
        summary: CANCEL_SUMMARY, stats: {}, ended_at: now,
      })
    }
    releaseTask(db, task.id, 'failed', owner)
    expireApprovals(db, 'task_id', task.id, now)
    ackOpenAlerts(db, task.id, 'approval_required')
    clearCancelMarker(db, task.id)
    insertEvent(db, { task_id: task.id, run_id: open?.id ?? null, kind: 'finished', payload: { outcome: 'failed', cancelled: true } })
    return true
  })
}

// A live runner (heartbeat inside the TTL) is asked to stop by the marker it polls. Anything else is closed here,
// so no runner and no stale recovery can bring it back.
export function requestCancel(db: Db, config: Config, id: string): Task {
  const task = getTask(db, id)
  if (!task) throw new OperatorError('task not found')
  if (!CANCELLABLE.includes(task.status)) {
    throw new OperatorError(`task is ${task.status}; only running, needs_approval or needs_auth can be cancelled`)
  }
  const live = task.status !== 'needs_auth' && task.heartbeat_at !== null && task.heartbeat_at >= nowSec() - config.staleTtlSec
  insertEvent(db, {
    task_id: id, run_id: openRunOf(db, id)?.id ?? null, kind: 'cancel_requested', payload: { live },
  })
  if (live) {
    requestCancelMarker(db, id)
  } else {
    closeCancelled(db, task)
  }
  return getTask(db, id)!
}

// Ends a failed task so it can run again. The claim and heartbeat are cleared; the session is kept only on request.
export function retryTask(db: Db, id: string, options: { draft: boolean; resume: boolean }): boolean {
  return inTransaction(db, () => {
    const sessionClause = options.resume ? '' : ', session_id = NULL'
    const changed = db.prepare(`UPDATE tasks SET status = ?, claimed_by = NULL, heartbeat_at = NULL, updated_at = ?${sessionClause}
      WHERE id = ? AND status = 'failed'`)
      .run(options.draft ? 'draft' : 'ready', nowSec(), id).changes === 1
    if (!changed) return false
    ackOpenAlerts(db, id, 'failed')
    ackOpenAlerts(db, id, 'budget_exceeded')
    clearCancelMarker(db, id)
    return true
  })
}
