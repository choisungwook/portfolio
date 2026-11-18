import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { AlertKind, Severity, Task, TaskStatus, WorkerResult } from '../types.ts'
import { insertEvent } from '../db/events.ts'
import { endRun } from '../db/runs.ts'
import { getTask, insertTask, moveStatus, releaseTask } from '../db/tasks.ts'
import { pauseQueue } from '../db/meta.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { nowSec } from '../time.ts'
import { reportToAssignee, reviewAssignee } from '../team/report.ts'

const REVIEW_TYPES = new Set(['research', 'security_review'])

interface Plan {
  status: TaskStatus
  alerts: { kind: AlertKind; message: string; severity?: Severity }[]
}

// The finish table from the design, as a pure function.
export function planFinish(task: Task, result: WorkerResult, config: Config): Plan {
  if (result.tampered) {
    return { status: 'failed', alerts: [{ kind: 'security_finding', message: `Stopped for review: ${result.summary}` }] }
  }
  if (result.budget_exceeded) {
    return { status: 'failed', alerts: [{ kind: 'budget_exceeded', message: `Budget exceeded: ${result.summary}` }] }
  }
  switch (result.outcome) {
    case 'done':
      if (REVIEW_TYPES.has(task.type)) {
        return { status: 'review', alerts: [{ kind: 'review_ready', message: `Ready to review: ${task.data.intent}` }] }
      }
      return { status: 'done', alerts: [] }
    case 'review':
      return { status: 'review', alerts: [] }
    // needs_approval is rewritten to failed by finishRun before it gets here.
    case 'needs_approval':
    case 'failed': {
      const alerts: Plan['alerts'] = [{ kind: 'failed', message: `Failed: ${result.summary}` }]
      if (task.lock_key && config.prodLockKeys.includes(task.lock_key)) {
        alerts.push({ kind: 'prod_touch', message: `Failed run touched prod lock ${task.lock_key}` })
      }
      return { status: 'failed', alerts }
    }
    case 'needs_auth':
      return { status: 'needs_auth', alerts: [{ kind: 'auth_required', message: `Login needed: ${result.summary}` }] }
    case 'stale':
      return { status: 'ready', alerts: [] }
  }
}

// Writes the run's outcome, the task's next status and the follow-up rows, in one transaction. Returns false when
// runnerId no longer holds the task's claim, in which case nothing is written.
export function finishRun(db: Db, config: Config, task: Task, runId: string, runnerId: string, worker: WorkerResult): boolean {
  // An approval is requested through the context while the run is live. As a final answer it is an invalid outcome.
  const result: WorkerResult = worker.outcome === 'needs_approval'
    ? { ...worker, outcome: 'failed', summary: 'worker returned an invalid outcome' }
    : worker
  const plan = planFinish(task, result, config)
  return inTransaction(db, () => {
    if (!endRun(db, {
      id: runId, task_id: task.id, intent: task.data.intent, outcome: result.outcome,
      summary: result.summary, stats: result.stats, ended_at: nowSec(),
    }, runnerId)) return false
    releaseTask(db, task.id, plan.status, runnerId)
    insertEvent(db, { task_id: task.id, run_id: runId, kind: 'finished', payload: { outcome: result.outcome } })
    // An expired model-provider login stops every task, not just this one, until the user logs in.
    if (result.outcome === 'needs_auth' && result.auth_scope === 'inference') pauseQueue(db, result.summary, 'preflight')
    for (const alert of plan.alerts) {
      raiseAlert(db, { task_id: task.id, run_id: runId, kind: alert.kind, message: alert.message, severity: alert.severity })
    }
    for (const alert of result.alerts) {
      raiseAlert(db, { task_id: task.id, run_id: runId, kind: 'worker_flag', message: alert.message, severity: alert.severity })
    }
    for (const followup of result.followups) {
      insertTask(db, {
        type: followup.type, status: 'draft', data: { intent: followup.intent },
        deps: [{ depends_on: task.id, kind: 'discovered_from' }],
      })
    }
    if (task.type === 'code' && result.outcome === 'done') {
      insertTask(db, {
        type: 'security_review', status: 'ready',
        data: {
          intent: `Review the changes made by ${task.id} since base_commit`,
          review_of: task.id, repo: task.data.repo, base_commit: task.data.base_commit,
          assignee: reviewAssignee(db, task),
        },
        deps: [{ depends_on: task.id, kind: 'discovered_from' }],
      })
    }
    if (task.type === 'security_review' && task.data.review_of && result.alerts.some((a) => a.severity === 'critical')) {
      const original = getTask(db, task.data.review_of)
      if (original) {
        // Only a finished task moves to review. Otherwise its status stays and the finding is still raised.
        moveStatus(db, original.id, 'done', 'review')
        raiseAlert(db, { task_id: original.id, run_id: runId, kind: 'security_finding', message: `Security review: ${result.summary}` })
      }
    }
    reportToAssignee(db, task, runId, result, plan.status)
    return true
  })
}
