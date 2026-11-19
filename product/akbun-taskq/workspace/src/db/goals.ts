import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { ORCHESTRATOR, postMessage, USER } from './team.ts'
import { nowSec } from '../time.ts'

// An objective the user gives the bots instead of a task list. The orchestrator splits it into tasks for the right
// bots, lets them pass work between themselves, asks the user only for judgment calls, and closes the goal with a
// summary when the done-when condition holds.

export interface Goal {
  id: number
  objective: string
  done_when: string
  status: 'open' | 'done' | 'dropped'
  summary: string | null
  created_at: number
  closed_at: number | null
}

export function listGoals(db: Db, limit = 50): Goal[] {
  return db.prepare('SELECT * FROM goals ORDER BY id DESC LIMIT ?').all(limit) as unknown as Goal[]
}

export function getGoal(db: Db, id: number): Goal | undefined {
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as unknown as Goal | undefined
}

export function createGoal(db: Db, objective: string, doneWhen: string): Goal {
  return inTransaction(db, () => {
    const id = Number(db.prepare('INSERT INTO goals (objective, done_when, created_at) VALUES (?, ?, ?)')
      .run(objective.trim().slice(0, 4000), doneWhen.trim().slice(0, 2000), nowSec()).lastInsertRowid)
    postMessage(db, {
      sender: USER, recipient: ORCHESTRATOR,
      body: [
        `Goal #${id}: ${objective.trim()}`,
        `Done when: ${doneWhen.trim()}`,
        '',
        'This is an objective, not a task list. Break it into tasks and give each to the bot that fits (create_task with owner), let the bots hand work to each other, and message me only for a decision that is mine. When the done-when condition holds, call close_goal with what was done and the evidence.',
      ].join('\n'),
    })
    return getGoal(db, id) as Goal
  })
}

export function closeGoal(db: Db, id: number, status: 'done' | 'dropped', summary: string): Goal | undefined {
  const changed = db.prepare(`UPDATE goals SET status = ?, summary = ?, closed_at = ? WHERE id = ? AND status = 'open'`)
    .run(status, summary.slice(0, 4000), nowSec(), id).changes
  return changed === 1 ? getGoal(db, id) : undefined
}
