import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import { endRun as endTaskRun, insertRun } from '../db/runs.ts'
import { getTask, releaseTask } from '../db/tasks.ts'
import { insertEvent } from '../db/events.ts'
import { postMessage, SYSTEM } from '../db/team.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { queueSecurityReview } from './report.ts'
import { endRun, runningRunForTask, type WorkflowRun } from '../db/workflows.ts'
import { workflowForTask } from './workflow-work.ts'
import { newId } from '../ids.ts'
import { nowSec } from '../time.ts'
import type { TaskStatus } from '../types.ts'

// A bot working on a task it owns, in its own session. The task shows as running with claimed_by 'bot:<name>', and a
// run row with `bot` set puts the work on the calendar like any other run. The queue's runner never touches these.

export const botClaim = (bot: string) => `bot:${bot}`
export type BotOutcome = 'done' | 'review' | 'failed'
const STATUS: Record<BotOutcome, TaskStatus> = { done: 'done', review: 'review', failed: 'failed' }

const BLOCKED = `EXISTS (SELECT 1 FROM deps d JOIN tasks p ON p.id = d.depends_on
  WHERE d.task_id = t.id AND d.kind = 'blocks' AND p.status != 'done')`

export function startBotTask(db: Db, bot: string, taskId: string, sessionId: string | null): { ok: true; runId: string; workflow?: WorkflowRun } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const task = getTask(db, taskId)
    if (!task) return { ok: false, error: 'task not found' }
    if (task.owner !== bot) return { ok: false, error: `task ${taskId} is owned by ${task.owner ?? 'the user'}, not you` }
    if (task.status === 'running' && task.claimed_by === botClaim(bot)) return { ok: false, error: 'you already started this task; finish it with finish_task' }
    // A draft is a note the user has not released for work, whoever owns it. Only the user promotes it to ready.
    if (task.status === 'draft') return { ok: false, error: 'this task is a draft; the user must promote it to ready before anyone starts it' }
    if (task.status !== 'ready') return { ok: false, error: `task is ${task.status}` }
    const workflow = workflowForTask(db, task, bot)
    if (workflow && 'error' in workflow) return { ok: false, error: workflow.error }
    const now = nowSec()
    const changed = db.prepare(`UPDATE tasks AS t SET status = 'running', claimed_by = ?, heartbeat_at = NULL, updated_at = ?
      WHERE id = ? AND status = 'ready' AND NOT ${BLOCKED}`).run(botClaim(bot), now, taskId).changes
    if (changed !== 1) return { ok: false, error: 'a task it depends on is not done yet' }
    const runId = newId()
    insertRun(db, { id: runId, task_id: taskId, session_id: sessionId, started_at: now, output_path: task.data.output_path, bot })
    insertEvent(db, { task_id: taskId, run_id: runId, kind: 'claimed', payload: { bot } })
    return { ok: true, runId, workflow }
  })
}

export function finishBotTask(db: Db, bot: string, taskId: string, outcome: BotOutcome, summary: string, costUsd?: number): { ok: true } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const task = getTask(db, taskId)
    if (!task || task.claimed_by !== botClaim(bot) || task.status !== 'running') return { ok: false, error: 'you have not started this task' }
    // A task with a workflow is done only when taskq says the run succeeded, not when the bot says so.
    const flow = runningRunForTask(db, taskId)
    if (flow && outcome !== 'failed') {
      const left = flow.steps.filter((s) => s.status !== 'succeeded' && s.status !== 'skipped').map((s) => `${s.step_id} (${s.status})`)
      return { ok: false, error: `workflow run ${flow.id} has not succeeded; steps left: ${left.join(', ')}. Report them with workflow_step, or finish with outcome failed` }
    }
    if (flow) endRun(db, flow.id, 'failed', `task finished as failed: ${summary.slice(0, 200)}`)
    const run = db.prepare('SELECT id FROM runs WHERE task_id = ? AND bot = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(taskId, bot)
    if (run) {
      endTaskRun(db, {
        id: String(run.id), task_id: taskId, intent: task.data.intent, outcome: outcome === 'review' ? 'review' : outcome,
        summary, stats: costUsd === undefined ? {} : { cost_usd: costUsd }, ended_at: nowSec(),
      })
    }
    releaseTask(db, taskId, STATUS[outcome], botClaim(bot))
    insertEvent(db, { task_id: taskId, run_id: run ? String(run.id) : null, kind: 'finished', payload: { outcome, bot } })
    if (outcome === 'failed') raiseAlert(db, { task_id: taskId, kind: 'failed', message: `${bot} failed: ${summary.slice(0, 200)}` })
    if (outcome === 'review') raiseAlert(db, { task_id: taskId, kind: 'review_ready', message: `${bot} asks you to review: ${task.data.intent.slice(0, 120)}` })
    // The same automatic security review a queue run of a code task gets, owned by a bot other than the author.
    if (task.type === 'code' && outcome === 'done') queueSecurityReview(db, task)
    return { ok: true }
  })
}

// Hands back the tasks a bot holds as running. `ready` keeps the bot as owner (it may start again); `draft` also clears
// the owner, so half-done work of a deleted bot waits for the user instead of being picked up by the queue.
export function releaseBotTasks(db: Db, bot: string, why: string, to: 'ready' | 'draft'): string[] {
  const ids = db.prepare(`SELECT id FROM tasks WHERE status = 'running' AND claimed_by = ?`).all(botClaim(bot)).map((row) => String(row.id))
  for (const id of ids) {
    inTransaction(db, () => {
      db.prepare(`UPDATE runs SET ended_at = ?, outcome = 'stale', summary = ? WHERE task_id = ? AND bot = ? AND ended_at IS NULL`)
        .run(nowSec(), why, id, bot)
      releaseTask(db, id, to, botClaim(bot))
      if (to === 'draft') db.prepare('UPDATE tasks SET owner = NULL, owner_since = NULL WHERE id = ?').run(id)
      insertEvent(db, { task_id: id, run_id: null, kind: 'finished', payload: { outcome: 'stale', bot, why } })
    })
  }
  return ids
}

// After a restart no bot is mid-turn. A task a bot had started goes back to ready (an enabled bot is told); one held by
// a bot that is gone becomes an unowned draft for the user.
export function recoverBotTasks(db: Db): number {
  const rows = db.prepare(`SELECT DISTINCT claimed_by FROM tasks WHERE status = 'running' AND claimed_by LIKE 'bot:%'`).all()
  let count = 0
  for (const row of rows) {
    const bot = String(row.claimed_by).slice(4)
    const agent = db.prepare('SELECT enabled FROM team_agents WHERE name = ?').get(bot)
    const enabled = agent?.enabled === 1
    // A disabled bot keeps its task, ready, as the disable path does; a deleted bot's task becomes the user's draft.
    const ids = releaseBotTasks(db, bot, 'taskq stopped while the bot was working', agent ? 'ready' : 'draft')
    count += ids.length
    for (const id of enabled ? ids : []) {
      postMessage(db, { sender: SYSTEM, recipient: bot, task_id: id, body: `taskq restarted while you were working on task ${id}. It is ready again; start_task to continue.` })
    }
  }
  return count
}
