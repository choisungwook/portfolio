import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { Task, WorkerContext } from '../types.ts'
import { insertEvent } from '../db/events.ts'
import { setRunSession } from '../db/runs.ts'
import { patchData, setSession } from '../db/tasks.ts'
import { maskDeep } from '../mask.ts'
import { clipDeep } from '../clip.ts'
import { askApproval } from './approval.ts'
import type { PreviousRun } from '../types.ts'

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
    previous: task.session_id ? null : previousRun(db, task.id, runId),
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

// The task's last finished run before this one, with its last tool calls (masked when they were stored), for the prompt.
const PREVIOUS_TOOLS = 8
export function previousRun(db: Db, taskId: string, runId: string): PreviousRun | null {
  const run = db.prepare(`SELECT id, outcome, summary FROM runs WHERE task_id = ? AND id != ? AND ended_at IS NOT NULL
    ORDER BY started_at DESC LIMIT 1`).get(taskId, runId) as { id: string; outcome: string | null; summary: string | null } | undefined
  if (!run) return null
  const tools = (db.prepare(`SELECT payload FROM events WHERE run_id = ? AND kind = 'tool_call' ORDER BY id DESC LIMIT ?`)
    .all(run.id, PREVIOUS_TOOLS) as { payload: string }[]).reverse().map((row) => row.payload)
  return { outcome: run.outcome, summary: run.summary, tools }
}
