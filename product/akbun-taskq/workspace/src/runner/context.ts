import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { Task, WorkerContext } from '../types.ts'
import { insertEvent } from '../db/events.ts'
import { setRunSession } from '../db/runs.ts'
import { patchData, setSession } from '../db/tasks.ts'
import { maskDeep } from '../mask.ts'
import { clipDeep } from '../clip.ts'
import { askApproval } from './approval.ts'

// The only surface a worker sees. Every write goes through the db query functions.
export function buildContext(
  db: Db, config: Config, task: Task, runId: string, signal: AbortSignal,
  inputs: Pick<WorkerContext, 'similar' | 'handoffs' | 'access_skill_path'>,
): WorkerContext {
  // ponytail: one chain per run, so requests from the same run are serialized. Cross-run ordering is not needed.
  let pending: Promise<unknown> = Promise.resolve()
  return {
    task,
    runId,
    resumeSessionId: task.session_id,
    ...inputs,
    signal,
    // Mask first, then clip: a secret cut at the limit would otherwise escape the pattern.
    emit: (kind, payload) => insertEvent(db, {
      task_id: task.id, run_id: runId, kind, payload: clipDeep(maskDeep(payload)) as Record<string, unknown>,
    }),
    onSession: (sessionId) => {
      setSession(db, task.id, sessionId)
      setRunSession(db, runId, sessionId)
    },
    patchData: (patch) => {
      patchData(db, task.id, patch)
      // Keeps the claim-time task in step, so finishRun sees fields the worker set during the run.
      Object.assign(task.data, patch)
    },
    requestApproval: (req) => {
      // Only one approval request may be open per task: decideApproval answers the latest one.
      const next = pending.then(() => askApproval(db, config, task, runId, req, signal))
      pending = next.catch(() => undefined)
      return next
    },
  }
}
