import type { Db } from '../db/open.ts'
import { USER, getAgent, postMessage } from '../db/team.ts'
import { getTask } from '../db/tasks.ts'
import { teamChanged } from '../wake.ts'

// The user (CLI, UI) sets or clears a task's owner. Agents go through assign_task, which also checks their role.
export function setOwner(db: Db, taskId: string, owner: string | null, by: string): void {
  const task = getTask(db, taskId)
  if (!task) throw new Error('task not found')
  if (task.status === 'done' || task.status === 'failed' || task.status === 'cancelled') throw new Error(`task is ${task.status}`)
  if (task.status === 'running') throw new Error('task is running; change the owner after it finishes or cancel it')
  if (owner !== null && !getAgent(db, owner)?.enabled) throw new Error(`no enabled agent named ${owner}`)
  db.prepare('UPDATE tasks SET owner = ?, owner_since = unixepoch() WHERE id = ?').run(owner, taskId)
  if (owner) postMessage(db, { sender: by, recipient: owner, task_id: taskId, body: `Task ${taskId} is now yours: ${task.data.intent}` })
  if (task.owner && task.owner !== owner) {
    postMessage(db, { sender: by, recipient: task.owner, task_id: taskId, body: `Task ${taskId} was taken from you by ${by === USER ? 'the user' : by}.` })
  }
  teamChanged.notify()
}
