import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { getMeta, setMeta } from './meta.ts'
import { postMessage } from './team.ts'
import { nextRun, parseCron } from '../util/cron.ts'
import { nowSec } from '../time.ts'

// Work a bot does without being asked each time: on a schedule (cron, local time) or when something happens (a task
// fails, a task is created, a webhook is called). A routine that comes due is delivered as a message from "routine",
// tagged with its id, so the weekly review can tell whether the turn that handled it went well.

export type Trigger = 'task_failed' | 'task_created' | 'webhook'
export const TRIGGERS: Trigger[] = ['task_failed', 'task_created', 'webhook']
export const ROUTINE_SENDER = 'routine'
const MAX_PER_BOT = 50

export interface Routine {
  id: number
  bot: string
  name: string
  prompt: string
  schedule: string | null
  trigger: Trigger | null
  enabled: boolean
  next_run_at: number | null
  last_run_at: number | null
  created_by: string
  created_at: number
}

function toRoutine(row: Record<string, unknown>): Routine {
  return { ...(row as unknown as Routine), enabled: row.enabled === 1 }
}

export function listRoutines(db: Db, bot?: string): Routine[] {
  const rows = bot
    ? db.prepare('SELECT * FROM bot_routines WHERE bot = ? ORDER BY id').all(bot)
    : db.prepare('SELECT * FROM bot_routines ORDER BY bot, id').all()
  return rows.map(toRoutine)
}

export function getRoutine(db: Db, id: number): Routine | undefined {
  const row = db.prepare('SELECT * FROM bot_routines WHERE id = ?').get(id)
  return row ? toRoutine(row) : undefined
}

export interface NewRoutine {
  bot: string
  name: string
  prompt: string
  schedule?: string | null
  trigger?: Trigger | null
  created_by: string
}

// Checks the input and returns the routine, or a message to show.
export function createRoutine(db: Db, input: NewRoutine): Routine | string {
  const name = input.name.trim().slice(0, 100)
  const prompt = input.prompt.trim().slice(0, 4000)
  if (!name || !prompt) return 'a routine needs a name and what to do'
  const schedule = input.schedule?.trim() || null
  const trigger = input.trigger ?? null
  if ((schedule === null) === (trigger === null)) return 'give either a schedule (cron) or a trigger, not both'
  if (trigger && !TRIGGERS.includes(trigger)) return `trigger must be one of ${TRIGGERS.join(', ')}`
  if (schedule) {
    try {
      parseCron(schedule)
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
  }
  const count = Number(db.prepare('SELECT count(*) AS n FROM bot_routines WHERE bot = ?').get(input.bot)?.n ?? 0)
  if (count >= MAX_PER_BOT) return `a bot has at most ${MAX_PER_BOT} routines`
  const now = nowSec()
  const id = Number(db.prepare(`INSERT INTO bot_routines (bot, name, prompt, schedule, trigger, next_run_at, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(input.bot, name, prompt, schedule, trigger, schedule ? nextRun(schedule, now) : null, input.created_by, now).lastInsertRowid)
  return getRoutine(db, id) as Routine
}

export function setRoutineEnabled(db: Db, id: number, enabled: boolean): boolean {
  const routine = getRoutine(db, id)
  if (!routine) return false
  const next = enabled && routine.schedule ? nextRun(routine.schedule, nowSec()) : routine.next_run_at
  return db.prepare('UPDATE bot_routines SET enabled = ?, next_run_at = ? WHERE id = ?').run(enabled ? 1 : 0, next, id).changes === 1
}

export function deleteRoutine(db: Db, id: number): boolean {
  return db.prepare('DELETE FROM bot_routines WHERE id = ?').run(id).changes === 1
}

function deliver(db: Db, routine: Routine, context: string, now: number): void {
  postMessage(db, {
    sender: ROUTINE_SENDER, recipient: routine.bot, routine_id: routine.id,
    body: `Routine "${routine.name}" (#${routine.id}${routine.schedule ? `, ${routine.schedule}` : `, on ${routine.trigger}`}):\n${routine.prompt}${context ? `\n\n${context}` : ''}`,
  })
  db.prepare('UPDATE bot_routines SET last_run_at = ? WHERE id = ?').run(now, routine.id)
}

// Delivers scheduled routines that are due. A routine missed while taskq was stopped runs once, not once per miss.
export function runDueRoutines(db: Db, now = nowSec()): number {
  const due = db.prepare(`SELECT * FROM bot_routines WHERE enabled = 1 AND schedule IS NOT NULL AND next_run_at IS NOT NULL AND next_run_at <= ?`).all(now).map(toRoutine)
  for (const routine of due) {
    inTransaction(db, () => {
      deliver(db, routine, '', now)
      db.prepare('UPDATE bot_routines SET next_run_at = ? WHERE id = ?').run(nextRun(routine.schedule as string, now), routine.id)
    })
  }
  return due.length
}

// The earliest scheduled run, so the hub can wake for it.
export function nextRoutineAt(db: Db): number | undefined {
  const row = db.prepare('SELECT min(next_run_at) AS at FROM bot_routines WHERE enabled = 1 AND next_run_at IS NOT NULL').get()
  return row?.at === null || row?.at === undefined ? undefined : Number(row.at)
}

// Event triggers read what happened since the last check: failed tasks from the events table, new tasks by creation
// time. The cursors start at "now" the first time, so old history does not fire routines.
export function runTriggeredRoutines(db: Db, now = nowSec()): number {
  const triggered = db.prepare(`SELECT * FROM bot_routines WHERE enabled = 1 AND trigger IN ('task_failed', 'task_created')`).all().map(toRoutine)
  const lastEvent = Number(db.prepare('SELECT coalesce(max(id), 0) AS id FROM events').get()?.id ?? 0)
  const eventCursor = Number(getMeta(db, 'routine_event_cursor') ?? lastEvent)
  const taskCursor = Number(getMeta(db, 'routine_task_cursor') ?? now)
  let fired = 0
  if (triggered.length > 0) {
    const failed = db.prepare(`SELECT e.task_id, e.payload, t.data FROM events e JOIN tasks t ON t.id = e.task_id
      WHERE e.id > ? AND e.kind = 'finished' ORDER BY e.id`).all(eventCursor)
      .filter((row) => (JSON.parse(String(row.payload)) as { outcome?: string }).outcome === 'failed')
    const created = db.prepare('SELECT id, data FROM tasks WHERE created_at > ? AND created_at <= ? ORDER BY created_at').all(taskCursor, now)
    const describe = (id: unknown, data: unknown) => `task ${String(id)}: ${String((JSON.parse(String(data)) as { intent?: string }).intent ?? '').slice(0, 300)}`
    for (const routine of triggered) {
      const rows = routine.trigger === 'task_failed' ? failed.map((r) => describe(r.task_id, r.data)) : created.map((r) => describe(r.id, r.data))
      if (rows.length === 0) continue
      deliver(db, routine, `${routine.trigger === 'task_failed' ? 'Failed' : 'New'} since the last check:\n${rows.slice(0, 20).join('\n')}`, now)
      fired += 1
    }
  }
  setMeta(db, 'routine_event_cursor', String(lastEvent))
  setMeta(db, 'routine_task_cursor', String(now))
  return fired
}

// A webhook routine fires when its URL is called (with the token); the body's text, if any, comes along.
export function fireWebhookRoutine(db: Db, id: number, text: string): boolean {
  const routine = getRoutine(db, id)
  if (!routine || !routine.enabled || routine.trigger !== 'webhook') return false
  deliver(db, routine, text ? `Webhook payload:\n${text.slice(0, 4000)}` : '', nowSec())
  return true
}
