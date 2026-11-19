import type { Db } from '../db/open.ts'
import { listAgents, ORCHESTRATOR } from '../db/team.ts'
import { listRoutines } from '../db/routines.ts'
import { nowSec } from '../time.ts'

// The weekly review: did each bot and routine run, did it go well, and would anyone miss it. A bot that reviews its
// own work misses what it misses, so the review also picks a few recent results for the user to check by hand.

export interface BotReview {
  bot: string
  turns: number
  done: number
  failed: number
  success_rate: number | null
  tasks_done: number
  tasks_failed: number
  last_turn_at: number | null
}

export interface RoutineReview {
  id: number
  bot: string
  name: string
  when: string
  enabled: boolean
  runs: number
  ok: number
  failed: number
  last_run_at: number | null
}

export interface SpotCheck {
  kind: 'task' | 'message'
  bot: string
  at: number
  task_id: string | null
  title: string
  text: string
}

const SPOT_CHECKS = 5

export function weeklyReview(db: Db, days = 7, now = nowSec()) {
  const since = now - days * 86_400
  const bots: BotReview[] = listAgents(db).map((agent) => {
    const turns = db.prepare(`SELECT count(*) AS n, sum(outcome = 'done') AS done, sum(outcome = 'failed') AS failed, max(ended_at) AS last
      FROM team_turns WHERE agent = ? AND started_at >= ? AND ended_at IS NOT NULL`).get(agent.name, since)
    const tasks = db.prepare(`SELECT sum(outcome = 'done') AS done, sum(outcome = 'failed') AS failed FROM runs WHERE bot = ? AND ended_at >= ?`).get(agent.name, since)
    const done = Number(turns?.done ?? 0)
    const failed = Number(turns?.failed ?? 0)
    return {
      bot: agent.name, turns: Number(turns?.n ?? 0), done, failed, success_rate: done + failed ? done / (done + failed) : null,
      tasks_done: Number(tasks?.done ?? 0), tasks_failed: Number(tasks?.failed ?? 0),
      last_turn_at: turns?.last === null || turns?.last === undefined ? null : Number(turns.last),
    }
  })
  // A routine's run is the message it delivered; it went well when the turn that took the message ended done.
  const routines: RoutineReview[] = listRoutines(db).map((routine) => {
    const row = db.prepare(`SELECT count(*) AS runs, sum(t.outcome = 'done') AS ok, sum(t.outcome = 'failed') AS failed
      FROM team_messages m LEFT JOIN team_turns t ON t.id = m.turn_id WHERE m.routine_id = ? AND m.created_at >= ?`).get(routine.id, since)
    return {
      id: routine.id, bot: routine.bot, name: routine.name, when: routine.schedule ?? `on ${routine.trigger}`, enabled: routine.enabled,
      runs: Number(row?.runs ?? 0), ok: Number(row?.ok ?? 0), failed: Number(row?.failed ?? 0), last_run_at: routine.last_run_at,
    }
  })
  const prune: { kind: 'bot' | 'routine'; ref: string; reason: string }[] = []
  for (const bot of bots) {
    if (bot.bot !== ORCHESTRATOR && bot.turns === 0) prune.push({ kind: 'bot', ref: bot.bot, reason: `took no turns in ${days} days` })
    else if (bot.failed > 0 && bot.done === 0) prune.push({ kind: 'bot', ref: bot.bot, reason: `every finished turn failed (${bot.failed})` })
  }
  const createdBefore = new Map(listRoutines(db).map((r) => [r.id, r.created_at < since]))
  for (const routine of routines.filter((r) => r.enabled)) {
    if (routine.runs === 0 && createdBefore.get(routine.id)) prune.push({ kind: 'routine', ref: String(routine.id), reason: `"${routine.name}" did not run in ${days} days` })
    else if (routine.runs > 0 && routine.ok === 0 && routine.failed > 0) prune.push({ kind: 'routine', ref: String(routine.id), reason: `"${routine.name}" failed every time (${routine.failed})` })
  }
  // A few recent results chosen at random, for the user to check by hand: bot-finished tasks and bot messages to the user.
  const results = db.prepare(`SELECT r.bot, r.ended_at AS at, r.task_id, r.summary, t.data FROM runs r JOIN tasks t ON t.id = r.task_id
    WHERE r.bot IS NOT NULL AND r.outcome IN ('done', 'review') AND r.ended_at >= ? ORDER BY random() LIMIT ?`).all(since, SPOT_CHECKS)
  const messages = db.prepare(`SELECT sender, created_at, task_id, body FROM team_messages WHERE recipient = 'user' AND sender NOT IN ('queue', 'routine')
    AND created_at >= ? ORDER BY random() LIMIT ?`).all(since, SPOT_CHECKS)
  const spot: SpotCheck[] = [
    ...results.map((r) => {
      const data = JSON.parse(String(r.data)) as { title?: string; intent?: string }
      return { kind: 'task' as const, bot: String(r.bot), at: Number(r.at), task_id: String(r.task_id), title: (data.title ?? data.intent ?? '').slice(0, 120), text: String(r.summary ?? '').slice(0, 600) }
    }),
    ...messages.map((m) => ({ kind: 'message' as const, bot: String(m.sender), at: Number(m.created_at), task_id: m.task_id === null ? null : String(m.task_id), title: 'Message to you', text: String(m.body).slice(0, 600) })),
  ].sort(() => Math.random() - 0.5).slice(0, SPOT_CHECKS)
  return { days, since, bots, routines, prune, spot_checks: spot }
}
