import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { SimilarTask, Task, Worker, WorkerResult } from '../types.ts'
import { touchHeartbeat } from '../db/tasks.ts'
import { isCancelRequested } from '../db/meta.ts'
import { closeCancelled } from '../db/operator.ts'
import { findSimilar } from '../memory/similar.ts'
import type { Retrospect } from '../memory/retrospect.ts'
import { finishRun } from './finish.ts'
import { buildContext } from './context.ts'
import { resolveAccessSkill } from '../skills/registry.ts'

export interface ExecuteDeps {
  db: Db
  config: Config
  worker: Worker
  runnerId: string
  retrospect?: Retrospect
}

// One run: heartbeat while the worker works, then finish. A run the user cancelled closes as cancelled. Any other
// aborted run (the runner is stopping) is left open for stale recovery.
export async function executeRun(deps: ExecuteDeps, task: Task, runId: string, signal: AbortSignal): Promise<void> {
  const { db, config, worker, runnerId, retrospect } = deps
  const heartbeat = setInterval(() => touchHeartbeat(db, task.id, runnerId), config.heartbeatSec * 1000)
  try {
    // A missing access skill fails the run before any session starts.
    const access = resolveAccessSkill(db, task.data.access_skill)
    let result: WorkerResult
    if (access.missing !== undefined) {
      result = { outcome: 'failed', summary: access.missing, stats: {}, alerts: [], followups: [] }
    } else {
      const ctx = buildContext(db, config, task, runId, signal, similarFor(db, task), access.path)
      try {
        result = await worker(ctx)
      } catch (error) {
        result = {
          outcome: 'failed', summary: error instanceof Error ? error.message : String(error),
          stats: {}, alerts: [], followups: [],
        }
      }
    }
    if (isCancelRequested(db, task.id)) {
      if (!closeCancelled(db, task, runnerId)) console.error(`taskq: run ${runId} lost the claim on ${task.id}; cancel dropped`)
      return
    }
    if (signal.aborted) return
    if (!finishRun(db, config, task, runId, runnerId, result)) {
      console.error(`taskq: run ${runId} lost the claim on ${task.id}; result dropped`)
      return
    }
    if (retrospect && (result.outcome === 'done' || result.outcome === 'review')) {
      // Not awaited: a failed retrospect must not change the task, and the claim loop must not wait for it.
      retrospect(task, result).catch((error: unknown) => console.error(`taskq: retrospect failed: ${String(error)}`))
    }
  } finally {
    clearInterval(heartbeat)
  }
}

// Memory lookup must not fail a task, so a lookup error degrades to no similar tasks.
function similarFor(db: Db, task: Task): SimilarTask[] {
  try {
    return findSimilar(db, task)
  } catch (error) {
    console.error(`taskq: similar lookup failed: ${String(error)}`)
    return []
  }
}
