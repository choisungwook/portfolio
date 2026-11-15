import type { Db } from './open.ts'
import { alertsOfRun, alertsOfTask, type AlertRow } from './alerts.ts'
import { listEventsOfRun } from './events.ts'
import { getRun, listRunsOfTask } from './runs.ts'
import { waitsForRuns } from './waits.ts'
import { getTask, listDeps } from './tasks.ts'
import { openApproval } from './approvals.ts'

export function taskDetail(db: Db, id: string) {
  const task = getTask(db, id)
  if (!task) return undefined
  const deps = listDeps(db).filter((dep) => dep.task_id === id)
  return {
    ...task, runs: listRunsOfTask(db, id), deps, alerts: alertsOfTask(db, id), pending_approval: openApproval(db, id),
  }
}

export function runDetail(db: Db, runId: string) {
  const run = getRun(db, runId)
  if (!run) return undefined
  const events = listEventsOfRun(db, runId)
  const alerts: AlertRow[] = alertsOfRun(db, runId)
  return { ...run, events, alerts, waits: waitsForRuns(db, [runId]).get(runId) ?? [] }
}
