import { inTransaction, type Db } from './open.ts'
import type { TaskType } from '../types.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'

// 'user' is the person; 'taskq' is the queue itself reporting a finished task. Neither is an agent row.
export const USER = 'user'
export const SYSTEM = 'taskq'

export interface TeamAgent {
  name: string
  role: string
  description: string
  instructions: string
  task_types: TaskType[]
  may_message_user: boolean
  enabled: boolean
  session_id: string | null
}

export interface TeamMessage {
  id: number
  sender: string
  recipient: string
  body: string
  task_id: string | null
  reply_to: number | null
  thread_id: number | null
  created_at: number
  deliver_at: number
  read_at: number | null
}

export interface TeamTurn {
  id: number
  agent: string
  session_id: string | null
  started_at: number
  ended_at: number | null
  outcome: 'done' | 'failed' | 'interrupted' | null
  error: string | null
  turns: number | null
  cost_usd: number | null
  writes: number
}

const BODY_LIMIT = 8000

function toAgent(row: Record<string, unknown>): TeamAgent {
  return {
    name: String(row.name), role: String(row.role), description: String(row.description),
    instructions: String(row.instructions), task_types: JSON.parse(String(row.task_types)) as TaskType[],
    may_message_user: row.may_message_user === 1, enabled: row.enabled === 1,
    session_id: row.session_id === null ? null : String(row.session_id),
  }
}

// Adds roster entries that are missing. An existing row is left alone so the user's edits survive a restart.
export function seedAgents(db: Db, roster: Omit<TeamAgent, 'session_id' | 'enabled'>[]): void {
  const insert = db.prepare(`INSERT OR IGNORE INTO team_agents
    (name, role, description, instructions, task_types, may_message_user, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
  for (const agent of roster) {
    insert.run(agent.name, agent.role, agent.description, agent.instructions, JSON.stringify(agent.task_types),
      agent.may_message_user ? 1 : 0, nowSec())
  }
}

export function listAgents(db: Db): TeamAgent[] {
  return db.prepare('SELECT * FROM team_agents ORDER BY rowid').all().map((row) => toAgent(row))
}

export function getAgent(db: Db, name: string): TeamAgent | undefined {
  const row = db.prepare('SELECT * FROM team_agents WHERE name = ?').get(name)
  return row ? toAgent(row) : undefined
}

export function setAgentSession(db: Db, name: string, sessionId: string | null): void {
  db.prepare('UPDATE team_agents SET session_id = ? WHERE name = ?').run(sessionId, name)
}

// Used when a turn ends: the session is replaced only if nobody reset it while the turn ran.
export function replaceAgentSession(db: Db, name: string, expected: string | null, next: string | null): void {
  db.prepare('UPDATE team_agents SET session_id = ? WHERE name = ? AND session_id IS ?').run(next, name, expected)
}

export function setAgentEnabled(db: Db, name: string, enabled: boolean): boolean {
  return db.prepare('UPDATE team_agents SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name).changes === 1
}

export function firstAgentWithRole(db: Db, role: string): string | undefined {
  const row = db.prepare('SELECT name FROM team_agents WHERE role = ? AND enabled = 1 ORDER BY rowid LIMIT 1').get(role)
  return row ? String(row.name) : undefined
}

// The body is masked here because this is the only path that stores message text.
// The body is masked here because this is the only path that stores message text. deliver_at holds a message back
// until that time, which is how an agent schedules work for later.
export function postMessage(db: Db, message: {
  sender: string; recipient: string; body: string; task_id?: string | null; reply_to?: number | null
  thread_id?: number | null; deliver_at?: number
}): number {
  const body = mask(message.body.slice(0, BODY_LIMIT))
  const now = nowSec()
  const result = db.prepare(`INSERT INTO team_messages (sender, recipient, body, task_id, reply_to, thread_id, created_at, deliver_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(message.sender, message.recipient, body, message.task_id ?? null, message.reply_to ?? null,
    message.thread_id ?? null, now, message.deliver_at ?? now)
  return Number(result.lastInsertRowid)
}

const DELIVERABLE = 'm.read_at IS NULL AND m.failed_at IS NULL AND m.deliver_at <= ?'

// Agents that are enabled, have no open turn and have a deliverable message, oldest message first. An agent whose last
// turn failed less than retryAfterSec ago waits, so a provider outage does not burn every attempt in a few seconds.
export function agentsWithMail(db: Db, now: number, retryAfterSec: number): string[] {
  return db.prepare(`SELECT a.name FROM team_agents a
    JOIN team_messages m ON m.recipient = a.name AND ${DELIVERABLE}
    WHERE a.enabled = 1 AND NOT EXISTS (SELECT 1 FROM team_turns t WHERE t.agent = a.name AND t.ended_at IS NULL)
      AND NOT EXISTS (SELECT 1 FROM team_turns t WHERE t.id = (SELECT max(id) FROM team_turns WHERE agent = a.name)
        AND t.outcome = 'failed' AND t.ended_at > ?)
    GROUP BY a.name ORDER BY min(m.id)`).all(now, now - retryAfterSec).map((row) => String(row.name))
}

// The earliest message held for later. Messages already due are not counted: they wait for a free agent, not a time.
export function nextDelivery(db: Db, now: number): number | undefined {
  const row = db.prepare('SELECT min(deliver_at) AS at FROM team_messages m WHERE m.read_at IS NULL AND m.failed_at IS NULL AND deliver_at > ?').get(now)
  return row?.at === null || row?.at === undefined ? undefined : Number(row.at)
}

// Opens a turn and hands it every undelivered message of the agent, in one transaction. Returns undefined when another
// turn is already open or there is nothing to deliver.
export function startTurn(db: Db, agent: string, limit: number): { turn: TeamTurn; messages: TeamMessage[] } | undefined {
  return inTransaction(db, () => {
    if (db.prepare('SELECT 1 FROM team_turns WHERE agent = ? AND ended_at IS NULL').get(agent)) return undefined
    const messages = db.prepare(`SELECT * FROM team_messages m WHERE recipient = ? AND ${DELIVERABLE}
      ORDER BY id LIMIT ?`).all(agent, nowSec(), limit) as unknown as TeamMessage[]
    if (messages.length === 0) return undefined
    const session = getAgent(db, agent)?.session_id ?? null
    const now = nowSec()
    const id = Number(db.prepare('INSERT INTO team_turns (agent, session_id, started_at) VALUES (?, ?, ?)')
      .run(agent, session, now).lastInsertRowid)
    const mark = db.prepare('UPDATE team_messages SET read_at = ?, turn_id = ?, attempts = attempts + 1 WHERE id = ?')
    for (const message of messages) mark.run(now, id, message.id)
    const turn: TeamTurn = {
      id, agent, session_id: session, started_at: now, ended_at: null, outcome: null, error: null, turns: null, cost_usd: null, writes: 0,
    }
    return { turn, messages }
  })
}

// A tool with an effect (a message, a task, a wiki write) records itself on the turn. A turn that failed after such a
// call is not retried: the retry would create the same task or send the same message again.
export function noteWrite(db: Db, turnId: number): void {
  db.prepare('UPDATE team_turns SET writes = writes + 1 WHERE id = ?').run(turnId)
}

export interface TurnEnd {
  setAside: TeamMessage[]
  reason?: 'attempts' | 'writes'
}

// A failed turn with no effect gives its messages back to the inbox; an interrupted one (shutdown) does too, without
// counting the attempt. A message tried maxAttempts times, or any message of a turn that already had an effect, is
// set aside instead and returned so the caller can tell the user.
export function endTurn(db: Db, id: number, end: {
  outcome: 'done' | 'failed' | 'interrupted'; error?: string; turns?: number; cost_usd?: number; session_id?: string
}, maxAttempts: number): TurnEnd {
  return inTransaction(db, (): TurnEnd => {
    db.prepare(`UPDATE team_turns SET ended_at = ?, outcome = ?, error = ?, turns = ?, cost_usd = ?,
      session_id = COALESCE(?, session_id) WHERE id = ?`)
      .run(nowSec(), end.outcome, end.error?.slice(0, 500) ?? null, end.turns ?? null, end.cost_usd ?? null, end.session_id ?? null, id)
    if (end.outcome === 'done') return { setAside: [] }
    return releaseMessages(db, id, end.outcome === 'interrupted', maxAttempts)
  })
}

function releaseMessages(db: Db, turnId: number, interrupted: boolean, maxAttempts: number): TurnEnd {
  const writes = Number(db.prepare('SELECT writes FROM team_turns WHERE id = ?').get(turnId)?.writes ?? 0)
  const now = nowSec()
  if (writes > 0) {
    const kept = db.prepare('SELECT * FROM team_messages WHERE turn_id = ?').all(turnId) as unknown as TeamMessage[]
    db.prepare('UPDATE team_messages SET failed_at = ? WHERE turn_id = ?').run(now, turnId)
    return { setAside: kept, reason: 'writes' }
  }
  if (interrupted) {
    db.prepare('UPDATE team_messages SET read_at = NULL, turn_id = NULL, attempts = max(attempts - 1, 0) WHERE turn_id = ?').run(turnId)
    return { setAside: [] }
  }
  const failed = db.prepare('SELECT * FROM team_messages WHERE turn_id = ? AND attempts >= ?').all(turnId, maxAttempts) as unknown as TeamMessage[]
  db.prepare('UPDATE team_messages SET failed_at = ? WHERE turn_id = ? AND attempts >= ?').run(now, turnId, maxAttempts)
  db.prepare('UPDATE team_messages SET read_at = NULL, turn_id = NULL WHERE turn_id = ? AND failed_at IS NULL').run(turnId)
  return { setAside: failed, reason: failed.length ? 'attempts' : undefined }
}

// After a crash or restart no turn can still be running in this process, so every open turn is closed as interrupted.
export function recoverTurns(db: Db): { agent: string; turn: number; end: TurnEnd }[] {
  return inTransaction(db, () => {
    const open = db.prepare('SELECT id, agent FROM team_turns WHERE ended_at IS NULL').all()
    return open.map((row) => {
      const id = Number(row.id)
      db.prepare(`UPDATE team_turns SET ended_at = ?, outcome = 'interrupted' WHERE id = ?`).run(nowSec(), id)
      return { agent: String(row.agent), turn: id, end: releaseMessages(db, id, true, Number.MAX_SAFE_INTEGER) }
    })
  })
}

// Model spend of the team since a time: agent turns plus the runs of tasks agents own.
export function spentSince(db: Db, since: number): number {
  const turns = Number(db.prepare('SELECT COALESCE(sum(cost_usd), 0) AS cost FROM team_turns WHERE started_at >= ?').get(since)?.cost ?? 0)
  const tasks = Number(db.prepare(`SELECT COALESCE(sum(json_extract(r.stats, '$.cost_usd')), 0) AS cost FROM runs r
    JOIN tasks t ON t.id = r.task_id WHERE t.owner IS NOT NULL AND r.started_at >= ?`).get(since)?.cost ?? 0)
  return turns + tasks
}

export function turnsSince(db: Db, agent: string, since: number): number {
  return Number(db.prepare('SELECT count(*) AS n FROM team_turns WHERE agent = ? AND started_at >= ?').get(agent, since)?.n ?? 0)
}

export function listMessages(db: Db, filter: { agent?: string; recipient?: string; unread?: boolean; limit: number }): TeamMessage[] {
  const where: string[] = []
  const binds: (string | number)[] = []
  if (filter.agent) {
    where.push('(sender = ? OR recipient = ?)')
    binds.push(filter.agent, filter.agent)
  }
  if (filter.recipient) {
    where.push('recipient = ?')
    binds.push(filter.recipient)
  }
  if (filter.unread) where.push('read_at IS NULL')
  const sql = `SELECT id, sender, recipient, body, task_id, reply_to, thread_id, created_at, deliver_at, read_at FROM team_messages
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ?`
  return db.prepare(sql).all(...binds, filter.limit) as unknown as TeamMessage[]
}

export function markRead(db: Db, ids: number[]): void {
  const mark = db.prepare('UPDATE team_messages SET read_at = ? WHERE id = ? AND read_at IS NULL')
  for (const id of ids) mark.run(nowSec(), id)
}

export function listTurns(db: Db, limit: number): TeamTurn[] {
  return db.prepare('SELECT * FROM team_turns ORDER BY id DESC LIMIT ?').all(limit) as unknown as TeamTurn[]
}

export function openTurnAgents(db: Db): string[] {
  return db.prepare('SELECT agent FROM team_turns WHERE ended_at IS NULL').all().map((row) => String(row.agent))
}
