import type { Db } from '../db/open.ts'
import { inTransaction } from '../db/open.ts'
import { endRun, insertRun } from '../db/runs.ts'
import { getTask, releaseTask } from '../db/tasks.ts'
import { insertEvent } from '../db/events.ts'
import { postMessage, SYSTEM } from '../db/team.ts'
import { raiseAlert } from '../alerts/rules.ts'
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

export function startBotTask(db: Db, bot: string, taskId: string, sessionId: string | null): { ok: true; runId: string } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const task = getTask(db, taskId)
    if (!task) return { ok: false, error: 'task not found' }
    if (task.owner !== bot) return { ok: false, error: `task ${taskId} is owned by ${task.owner ?? 'the user'}, not you` }
    if (task.status === 'running' && task.claimed_by === botClaim(bot)) return { ok: false, error: 'you already started this task; finish it with finish_task' }
    if (task.status !== 'ready' && task.status !== 'draft') return { ok: false, error: `task is ${task.status}` }
    if (task.status === 'draft' && (task.type === 'ops_read' || task.type === 'ops_change' || task.data.access_skill || task.data.target_profile)) {
      return { ok: false, error: 'this draft touches an account; the user must promote it before anyone starts it' }
    }
    const now = nowSec()
    const changed = db.prepare(`UPDATE tasks AS t SET status = 'running', claimed_by = ?, heartbeat_at = NULL, updated_at = ?
      WHERE id = ? AND status IN ('ready', 'draft') AND NOT ${BLOCKED}`).run(botClaim(bot), now, taskId).changes
    if (changed !== 1) return { ok: false, error: 'a task it depends on is not done yet' }
    const runId = newId()
    insertRun(db, { id: runId, task_id: taskId, session_id: sessionId, started_at: now, output_path: task.data.output_path, bot })
    insertEvent(db, { task_id: taskId, run_id: runId, kind: 'claimed', payload: { bot } })
    return { ok: true, runId }
  })
}

export function finishBotTask(db: Db, bot: string, taskId: string, outcome: BotOutcome, summary: string, costUsd?: number): { ok: true } | { ok: false; error: string } {
  return inTransaction(db, () => {
    const task = getTask(db, taskId)
    if (!task || task.claimed_by !== botClaim(bot) || task.status !== 'running') return { ok: false, error: 'you have not started this task' }
    const run = db.prepare('SELECT id FROM runs WHERE task_id = ? AND bot = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(taskId, bot)
    if (run) {
      endRun(db, {
        id: String(run.id), task_id: taskId, intent: task.data.intent, outcome: outcome === 'review' ? 'review' : outcome,
        summary, stats: costUsd === undefined ? {} : { cost_usd: costUsd }, ended_at: nowSec(),
      })
    }
    releaseTask(db, taskId, STATUS[outcome], botClaim(bot))
    insertEvent(db, { task_id: taskId, run_id: run ? String(run.id) : null, kind: 'finished', payload: { outcome, bot } })
    if (outcome === 'failed') raiseAlert(db, { task_id: taskId, kind: 'failed', message: `${bot} failed: ${summary.slice(0, 200)}` })
    if (outcome === 'review') raiseAlert(db, { task_id: taskId, kind: 'review_ready', message: `${bot} asks you to review: ${task.data.intent.slice(0, 120)}` })
    return { ok: true }
  })
}

// After a restart no bot is mid-turn, so a task a bot had started goes back to ready and the bot is told to pick it up.
export function recoverBotTasks(db: Db): number {
  const rows = db.prepare(`SELECT id, claimed_by FROM tasks WHERE status = 'running' AND claimed_by LIKE 'bot:%'`).all()
  for (const row of rows) {
    const id = String(row.id)
    const bot = String(row.claimed_by).slice(4)
    inTransaction(db, () => {
      db.prepare(`UPDATE runs SET ended_at = ?, outcome = 'stale', summary = 'taskq stopped while the bot was working' WHERE task_id = ? AND bot = ? AND ended_at IS NULL`)
        .run(nowSec(), id, bot)
      releaseTask(db, id, 'ready', botClaim(bot))
      postMessage(db, { sender: SYSTEM, recipient: bot, task_id: id, body: `taskq restarted while you were working on task ${id}. It is ready again; start_task to continue.` })
    })
  }
  return rows.length
}
