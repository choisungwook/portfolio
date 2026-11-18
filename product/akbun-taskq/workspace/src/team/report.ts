import type { Db } from '../db/open.ts'
import { SYSTEM, firstAgentWithRole, getAgent, postMessage } from '../db/team.ts'
import type { Task, TaskStatus, WorkerResult } from '../types.ts'
import { teamChanged } from '../wake.ts'

// Called inside finishRun's transaction. A task an agent owns reports back to that agent's inbox, so the agent
// continues in its next turn without polling the queue.
export function reportToOwner(db: Db, task: Task, runId: string, result: WorkerResult, status: TaskStatus): void {
  const owner = task.owner
  if (!owner || !getAgent(db, owner)) return
  const output = db.prepare('SELECT output_path FROM runs WHERE id = ?').get(runId)?.output_path
  const lines = [
    `Task ${task.id} (${task.type}) "${task.data.title ?? task.data.intent.slice(0, 80)}" ended: ${result.outcome}; task status is now ${status}.`,
    `Summary: ${result.summary}`,
  ]
  if (output) lines.push(`Output: outputs/${String(output)}`)
  for (const alert of result.alerts) lines.push(`Flag (${alert.severity}): ${alert.message}`)
  if (result.followups.length) lines.push(`Suggested follow-ups were added as drafts: ${result.followups.map((f) => f.intent).join(' | ')}`)
  postMessage(db, { sender: SYSTEM, recipient: owner, body: lines.join('\n'), task_id: task.id })
  teamChanged.notify()
}

// The automatic security review of an agent's code task goes to the reviewer, so the coder does not review its own
// change. Without an enabled reviewer it goes to the orchestrator, never back to the author. Tasks the user added stay unowned.
export function reviewOwner(db: Db, task: Task): string | null {
  if (!task.owner) return null
  const reviewer = firstAgentWithRole(db, 'reviewer') ?? firstAgentWithRole(db, 'orchestrator')
  return reviewer && reviewer !== task.owner ? reviewer : null
}

// A task created with an owner by taskq itself (the automatic security review) is announced to that bot, which would
// otherwise not know it has work: the queue does not run tasks a bot owns.
export function notifyOwner(db: Db, task: Task): void {
  if (!task.owner || !getAgent(db, task.owner)) return
  postMessage(db, { sender: SYSTEM, recipient: task.owner, task_id: task.id, body: `Task ${task.id} is now yours: ${task.data.intent}` })
  teamChanged.notify()
}
