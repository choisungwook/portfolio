import { randomUUID } from 'node:crypto'
import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { Task } from '../types.ts'
import { insertEvent } from '../db/events.ts'
import { approvalDecision, insertApproval } from '../db/approvals.ts'
import { setStatus } from '../db/tasks.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { mask, maskDeep } from '../mask.ts'
import { clipDeep } from '../clip.ts'
import { nowSec } from '../time.ts'
import { sleep } from './sleep.ts'

// Parks the run until the request's row gets a decision. The row is written here with the exact input; the events
// table gets only the masked, clipped copy. A request that expired (its run or task ended) is denied.
export async function askApproval(
  db: Db, config: Config, task: Task, runId: string,
  req: { tool: string; input: unknown; reason?: string }, signal: AbortSignal,
): Promise<boolean> {
  const requestId = randomUUID()
  const exact = JSON.stringify(req.input) ?? 'null'
  insertApproval(db, { request_id: requestId, task_id: task.id, run_id: runId, tool: req.tool, input: exact, created_at: nowSec() })
  insertEvent(db, {
    task_id: task.id, run_id: runId, kind: 'permission_request',
    payload: clipDeep(maskDeep({
      request_id: requestId, tool: req.tool, input: req.input, reason: req.reason, bytes: Buffer.byteLength(exact),
    })) as Record<string, unknown>,
  })
  setStatus(db, task.id, 'needs_approval')
  raiseAlert(db, {
    task_id: task.id, run_id: runId, kind: 'approval_required', ref: requestId,
    message: `Approval needed: ${req.tool}: ${commandSnippet(req.input)}`,
  })
  while (!signal.aborted) {
    const decision = approvalDecision(db, requestId)
    if (decision === 'approved') return true
    if (decision === 'denied' || decision === 'expired') return false
    await sleep(config.pollSec * 1000, signal)
  }
  throw new Error('aborted while waiting for approval')
}

// The first 120 characters of the command, masked first so a secret cut at the limit cannot show.
function commandSnippet(input: unknown): string {
  const command = typeof input === 'object' && input !== null && 'command' in input ? (input as { command: unknown }).command : input
  const text = typeof command === 'string' ? command : JSON.stringify(command) ?? ''
  return mask(text).slice(0, 120)
}
