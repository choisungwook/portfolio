import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { Task, Worker } from '../types.ts'
import { insertEvent } from '../db/events.ts'
import { insertRun } from '../db/runs.ts'
import { claimTask, getTask, nextEligible } from '../db/tasks.ts'
import { isCancelRequested, isQueuePaused, pauseBy, pauseQueue, resumeQueue } from '../db/meta.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { newId } from '../ids.ts'
import { nowSec } from '../time.ts'
import { recoverStale } from './recover.ts'
import { executeRun } from './execute.ts'
import type { Retrospect } from '../memory/retrospect.ts'
import type { PreflightResult } from '../agents/types.ts'
import { queueChanged } from '../wake.ts'
import type { RunControl } from './control.ts'

export type Preflight = () => Promise<PreflightResult>

export interface RunnerOptions {
  db: Db
  config: Config
  worker: Worker
  preflight?: Preflight
  retrospect?: Retrospect
  authRecheckMs?: number     // how often a preflight pause is re-checked while the queue is paused
}

export interface Runner extends RunControl {
  start(): Promise<void>
  stop(): Promise<void>
}

const PREFLIGHT_TTL_MS = 5 * 60 * 1000
const AUTH_RECHECK_MS = 60 * 1000
const STOP_GRACE_MS = 3000

export function createRunner({
  db, config, worker, preflight = async () => ({ ok: true }), retrospect, authRecheckMs = AUTH_RECHECK_MS,
}: RunnerOptions): Runner {
  const runnerId = `runner-${newId()}`
  const active = new Map<string, { controller: AbortController; done: Promise<void> }>()
  const requested = new Set<string>()
  const stopped = new AbortController()
  let running = false
  let verifiedAt = 0
  let lastRecheck = 0

  async function authOk(): Promise<boolean> {
    if (Date.now() - verifiedAt < PREFLIGHT_TTL_MS) return true
    const result = await preflight()
    if (result.ok) {
      verifiedAt = Date.now()
      return true
    }
    const reason = result.reason ?? 'inference auth failed'
    if (!isQueuePaused(db)) pauseQueue(db, reason, 'preflight')
    raiseAlert(db, { task_id: null, kind: 'auth_required', message: reason })
    return false
  }

  // A preflight pause is lifted by a passing preflight. A user pause is never lifted here.
  async function recheckAuth(): Promise<void> {
    if (pauseBy(db) !== 'preflight' || Date.now() - lastRecheck < authRecheckMs) return
    lastRecheck = Date.now()
    const result = await preflight()
    if (!result.ok) return
    verifiedAt = Date.now()
    if (pauseBy(db) === 'preflight') resumeQueue(db)
  }

  function launch(task: Task): void {
    const runId = newId()
    const controller = new AbortController()
    insertRun(db, { id: runId, task_id: task.id, session_id: task.session_id, started_at: nowSec() })
    insertEvent(db, { task_id: task.id, run_id: runId, kind: 'claimed', payload: { runner: runnerId, resume: task.session_id } })
    const done = executeRun({ db, config, worker, runnerId, retrospect }, task, runId, controller.signal)
      .catch((error: unknown) => console.error(`taskq: run ${runId} crashed: ${String(error)}`))
      .finally(() => {
        active.delete(task.id)
        queueChanged.notify()
      })
    active.set(task.id, { controller, done })
  }

  async function tick(): Promise<void> {
    // A cancel marker aborts the live run; executeRun then closes it as cancelled.
    for (const [id, run] of active) if (isCancelRequested(db, id)) run.controller.abort()
    recoverStale(db, config, false, new Set(active.keys()))
    if (isQueuePaused(db)) {
      await recheckAuth()
      return
    }
    // Run-now requests go first. A request whose task cannot be claimed (lock held, no longer ready) is dropped;
    // a ready task still runs in the normal order.
    for (const id of [...requested]) {
      if (active.size >= config.maxConcurrent) break
      requested.delete(id)
      if (!(await authOk())) return
      if (claimTask(db, id, runnerId)) launch(getTask(db, id)!)
    }
    while (active.size < config.maxConcurrent) {
      if (isQueuePaused(db)) return
      const candidate = nextEligible(db)
      if (!candidate) return
      if (!(await authOk())) return
      if (claimTask(db, candidate.id, runnerId)) launch(getTask(db, candidate.id)!)
    }
  }

  // Wakes at once on an in-process change; otherwise every pollSec, which picks up what the CLI wrote.
  async function loop(): Promise<void> {
    while (running) {
      await queueChanged.wait(config.pollSec * 1000, stopped.signal)
      if (!running) return
      await tick().catch((error: unknown) => console.error(`taskq: tick failed: ${String(error)}`))
    }
  }

  return {
    async start() {
      recoverStale(db, config, true, new Set())
      running = true
      await tick().catch((error: unknown) => console.error(`taskq: tick failed: ${String(error)}`))
      void loop()
    },
    runNow(taskId) {
      requested.add(taskId)
      queueChanged.notify()
    },
    async stop() {
      running = false
      stopped.abort()
      const runs = [...active.values()]
      for (const run of runs) run.controller.abort()
      await Promise.race([
        Promise.allSettled(runs.map((run) => run.done)),
        new Promise((resolve) => setTimeout(resolve, STOP_GRACE_MS)),
      ])
    },
  }
}
