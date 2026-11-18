import type { Db } from '../db/open.ts'
import { SYSTEM, firstAgentWithRole, getAgent, postMessage } from '../db/team.ts'
import type { Task, TaskStatus, WorkerResult } from '../types.ts'
import { teamChanged } from '../wake.ts'

// Called inside finishRun's transaction. A task an agent asked for reports back to that agent's inbox, so the agent
// continues in its next turn without polling the queue.
export function reportToAssignee(db: Db, task: Task, runId: string, result: WorkerResult, status: TaskStatus): void {
  const assignee = task.data.assignee
  if (!assignee || !getAgent(db, assignee)) return
  const output = db.prepare('SELECT output_path FROM runs WHERE id = ?').get(runId)?.output_path
  const lines = [
    `Task ${task.id} (${task.type}) "${task.data.title ?? task.data.intent.slice(0, 80)}" ended: ${result.outcome}; task status is now ${status}.`,
    `Summary: ${result.summary}`,
  ]
  if (output) lines.push(`Output: outputs/${String(output)}`)
  for (const alert of result.alerts) lines.push(`Flag (${alert.severity}): ${alert.message}`)
  if (result.followups.length) lines.push(`Suggested follow-ups were added as drafts: ${result.followups.map((f) => f.intent).join(' | ')}`)
  postMessage(db, { sender: SYSTEM, recipient: assignee, body: lines.join('\n'), task_id: task.id })
  teamChanged.notify()
}

// The automatic security review of an agent's code task goes to the team's reviewer, so the coder does not review
// its own change. Tasks the user added keep no assignee.
export function reviewAssignee(db: Db, task: Task): string | undefined {
  if (!task.data.assignee) return undefined
  return firstAgentWithRole(db, 'reviewer') ?? task.data.assignee
}
