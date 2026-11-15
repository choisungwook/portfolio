import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import { insertEvent } from '../db/events.ts'
import { ackOpenAlerts } from '../db/alerts.ts'
import { expireApprovals } from '../db/approvals.ts'
import { countStaleRuns, endRun, openRunOf } from '../db/runs.ts'
import { releaseTask, staleCandidates } from '../db/tasks.ts'
import { isCancelRequested } from '../db/meta.ts'
import { closeCancelled } from '../db/operator.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { nowSec } from '../time.ts'

// Tasks whose heartbeat expired (or all running and waiting tasks at startup) go back to ready. The stored session id
// is kept, so the next claim resumes the same Agent SDK session and asks for approval again.
export function recoverStale(db: Db, config: Config, atStartup: boolean, skip: Set<string>): void {
  const cutoff = nowSec() - config.staleTtlSec
  for (const task of staleCandidates(db, cutoff, atStartup)) {
    if (skip.has(task.id)) continue
    const owner = task.claimed_by ?? undefined
    // A task the user cancelled is closed, never returned to ready.
    if (isCancelRequested(db, task.id)) {
      closeCancelled(db, task, owner)
      continue
    }
    const open = openRunOf(db, task.id)
    if (open) {
      endRun(db, {
        id: open.id, task_id: task.id, intent: task.data.intent, outcome: 'stale',
        summary: 'Recovered as stale', stats: {}, ended_at: nowSec(),
      }, owner)
      insertEvent(db, { task_id: task.id, run_id: open.id, kind: 'finished', payload: { outcome: 'stale' } })
    }
    releaseTask(db, task.id, 'ready', owner)
    expireApprovals(db, 'task_id', task.id, nowSec())
    ackOpenAlerts(db, task.id, 'approval_required')
    insertEvent(db, { task_id: task.id, run_id: open?.id ?? null, kind: 'error', payload: { reason: 'stale' } })
    if (countStaleRuns(db, task.id) >= 2) {
      raiseAlert(db, { task_id: task.id, run_id: open?.id ?? null, kind: 'stale_repeat', message: `Stale again: ${task.data.intent}` })
    }
  }
}
