import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import type { Config } from '../config.ts'
import type { Task, TaskStatus } from '../types.ts'
import { insertEvent } from './events.ts'
import { ackOpenAlerts } from './alerts.ts'
import { expireApprovals } from './approvals.ts'
import { endRun, openRunOf } from './runs.ts'
import { getTask, isBlocked, releaseTask } from './tasks.ts'
import { clearCancelMarker, isQueuePaused, requestCancelMarker } from './meta.ts'
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
// The task becomes cancelled (shown as Cancelled, retryable like a failed task). The open run closes as failed with the
// summary 'cancelled by user', its open requests expire, and no failed alert is raised: the user did it.
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
    releaseTask(db, task.id, 'cancelled', owner)
    expireApprovals(db, 'task_id', task.id, now)
    ackOpenAlerts(db, task.id, 'approval_required')
    clearCancelMarker(db, task.id)
    insertEvent(db, { task_id: task.id, run_id: open?.id ?? null, kind: 'finished', payload: { outcome: 'cancelled', cancelled: true } })
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

// Ends a failed or cancelled task so it can run again. The claim, heartbeat and session are cleared.
// A retry always starts a new session. A task is an object that bots pick up; the session belongs to whoever ran it and
// moves on to other work, so resuming it would put the task back into someone else's later conversation.
export function retryTask(db: Db, id: string, options: { draft: boolean }): boolean {
  return inTransaction(db, () => {
    const changed = db.prepare(`UPDATE tasks SET status = ?, claimed_by = NULL, heartbeat_at = NULL, updated_at = ?, session_id = NULL
      WHERE id = ? AND status IN ('failed', 'cancelled')`)
      .run(options.draft ? 'draft' : 'ready', nowSec(), id).changes === 1
    if (!changed) return false
    ackOpenAlerts(db, id, 'failed')
    ackOpenAlerts(db, id, 'budget_exceeded')
    clearCancelMarker(db, id)
    return true
  })
}

// Statuses a user can start by hand, and what starting means in each. running and needs_approval are already running.
export const RUNNABLE: TaskStatus[] = ['draft', 'ready', 'failed', 'cancelled', 'needs_auth', 'review', 'done']

// Makes a task ready for an immediate run. A failed, review or done task starts a new session; a needs_auth task keeps
// its session, as Resume does. The caller then asks the runner to claim it first.
export function prepareRun(db: Db, id: string): Task {
  const task = getTask(db, id)
  if (!task) throw new OperatorError('task not found')
  if (!RUNNABLE.includes(task.status)) throw new OperatorError(`task is ${task.status}; it is already running`)
  // Every run has an agent behind it: a task nobody owns waits until the user gives it to a bot.
  if (!task.owner) throw new OperatorError('task has no agent; give it to a bot (owner) before running it')
  if (isQueuePaused(db)) throw new OperatorError('the queue is paused; resume the queue to run tasks')
  if (isBlocked(db, id)) throw new OperatorError('task waits for a dependency to finish or for a handoff to be accepted')
  // A one-off run has no bot session to report the workflow's steps, so it would skip them all.
  if (task.data.workflow_id) throw new OperatorError('this task has a workflow; only a bot runs workflows: give the task to a bot (owner)')
  inTransaction(db, () => {
    const keepSession = task.status === 'needs_auth' || task.status === 'draft' || task.status === 'ready'
    const sessionClause = keepSession ? '' : ', session_id = NULL'
    db.prepare(`UPDATE tasks SET status = 'ready', claimed_by = NULL, heartbeat_at = NULL, updated_at = ?${sessionClause}
      WHERE id = ?`).run(nowSec(), id)
    if (task.status === 'failed') {
      ackOpenAlerts(db, id, 'failed')
      ackOpenAlerts(db, id, 'budget_exceeded')
    }
    if (task.status === 'needs_auth') ackOpenAlerts(db, id, 'auth_required')
    if (task.status === 'review') ackOpenAlerts(db, id, 'review_ready')
    clearCancelMarker(db, id)
    insertEvent(db, { task_id: id, run_id: null, kind: 'run_requested', payload: { from: task.status } })
  })
  return getTask(db, id)!
}

// Delete: the task and everything recorded about it (runs, events, alerts, approvals, dependencies, handoffs, search
// history). A task a run is still working on must be cancelled first. Rows elsewhere that only mention it (bot
// messages, workflow runs) keep their row and lose the link. A code task's worktree stays on disk.
const UNDELETABLE: TaskStatus[] = ['running', 'needs_approval']

export function deleteTask(db: Db, id: string): void {
  const task = getTask(db, id)
  if (!task) throw new OperatorError('task not found')
  if (UNDELETABLE.includes(task.status)) throw new OperatorError(`task is ${task.status}; cancel it before deleting it`)
  inTransaction(db, () => {
    for (const table of ['approvals', 'events', 'alerts', 'runs', 'history_fts', 'proposals']) db.prepare(`DELETE FROM ${table} WHERE task_id = ?`).run(id)
    db.prepare('DELETE FROM deps WHERE task_id = ? OR depends_on = ?').run(id, id)
    db.prepare('DELETE FROM handoffs WHERE source_task_id = ? OR target_task_id = ?').run(id, id)
    db.prepare('UPDATE team_messages SET task_id = NULL WHERE task_id = ?').run(id)
    db.prepare('UPDATE workflow_runs SET task_id = NULL WHERE task_id = ?').run(id)
    db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  })
}
