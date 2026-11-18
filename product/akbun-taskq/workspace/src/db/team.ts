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
  created_at: number
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

export function setAgentEnabled(db: Db, name: string, enabled: boolean): boolean {
  return db.prepare('UPDATE team_agents SET enabled = ? WHERE name = ?').run(enabled ? 1 : 0, name).changes === 1
}

export function firstAgentWithRole(db: Db, role: string): string | undefined {
  const row = db.prepare('SELECT name FROM team_agents WHERE role = ? AND enabled = 1 ORDER BY rowid LIMIT 1').get(role)
  return row ? String(row.name) : undefined
}

// The body is masked here because this is the only path that stores message text.
export function postMessage(db: Db, message: {
  sender: string; recipient: string; body: string; task_id?: string | null; reply_to?: number | null
}): number {
  const body = mask(message.body.slice(0, BODY_LIMIT))
  const result = db.prepare(`INSERT INTO team_messages (sender, recipient, body, task_id, reply_to, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(message.sender, message.recipient, body, message.task_id ?? null, message.reply_to ?? null, nowSec())
  return Number(result.lastInsertRowid)
}

// Agents that are enabled, have no open turn and have at least one undelivered message, oldest message first.
export function agentsWithMail(db: Db): string[] {
  return db.prepare(`SELECT a.name FROM team_agents a
    JOIN team_messages m ON m.recipient = a.name AND m.read_at IS NULL AND m.failed_at IS NULL
    WHERE a.enabled = 1 AND NOT EXISTS (SELECT 1 FROM team_turns t WHERE t.agent = a.name AND t.ended_at IS NULL)
    GROUP BY a.name ORDER BY min(m.id)`).all().map((row) => String(row.name))
}

// Opens a turn and hands it every undelivered message of the agent, in one transaction. Returns undefined when another
// turn is already open or there is nothing to deliver.
export function startTurn(db: Db, agent: string, limit: number): { turn: TeamTurn; messages: TeamMessage[] } | undefined {
  return inTransaction(db, () => {
    if (db.prepare('SELECT 1 FROM team_turns WHERE agent = ? AND ended_at IS NULL').get(agent)) return undefined
    const messages = db.prepare(`SELECT * FROM team_messages WHERE recipient = ? AND read_at IS NULL AND failed_at IS NULL
      ORDER BY id LIMIT ?`).all(agent, limit) as unknown as TeamMessage[]
    if (messages.length === 0) return undefined
    const session = getAgent(db, agent)?.session_id ?? null
    const now = nowSec()
    const id = Number(db.prepare('INSERT INTO team_turns (agent, session_id, started_at) VALUES (?, ?, ?)')
      .run(agent, session, now).lastInsertRowid)
    const mark = db.prepare('UPDATE team_messages SET read_at = ?, turn_id = ?, attempts = attempts + 1 WHERE id = ?')
    for (const message of messages) mark.run(now, id, message.id)
    const turn: TeamTurn = { id, agent, session_id: session, started_at: now, ended_at: null, outcome: null, error: null, turns: null, cost_usd: null }
    return { turn, messages }
  })
}

// A failed turn gives its messages back to the inbox; an interrupted one (shutdown, cancel) does too, without counting
// the attempt. A message that has already been tried maxAttempts times is
// marked failed instead, so one bad message cannot make an agent spend its budget forever.
export function endTurn(db: Db, id: number, end: {
  outcome: 'done' | 'failed' | 'interrupted'; error?: string; turns?: number; cost_usd?: number; session_id?: string
}, maxAttempts: number): TeamMessage[] {
  return inTransaction(db, () => {
    db.prepare(`UPDATE team_turns SET ended_at = ?, outcome = ?, error = ?, turns = ?, cost_usd = ?,
      session_id = COALESCE(?, session_id) WHERE id = ?`)
      .run(nowSec(), end.outcome, end.error?.slice(0, 500) ?? null, end.turns ?? null, end.cost_usd ?? null, end.session_id ?? null, id)
    if (end.outcome === 'done') return []
    if (end.outcome === 'interrupted') {
      db.prepare('UPDATE team_messages SET read_at = NULL, turn_id = NULL, attempts = max(attempts - 1, 0) WHERE turn_id = ?').run(id)
      return []
    }
    const failed = db.prepare(`SELECT * FROM team_messages WHERE turn_id = ? AND attempts >= ?`).all(id, maxAttempts) as unknown as TeamMessage[]
    db.prepare('UPDATE team_messages SET failed_at = ? WHERE turn_id = ? AND attempts >= ?').run(nowSec(), id, maxAttempts)
    db.prepare('UPDATE team_messages SET read_at = NULL, turn_id = NULL WHERE turn_id = ? AND failed_at IS NULL').run(id)
    return failed
  })
}

// After a crash or restart no turn can still be running in this process, so every open turn is closed as interrupted.
// Its messages go back to the inbox without counting the attempt.
export function recoverTurns(db: Db): number {
  return inTransaction(db, () => {
    const open = db.prepare('SELECT id FROM team_turns WHERE ended_at IS NULL').all().map((row) => Number(row.id))
    for (const id of open) {
      db.prepare(`UPDATE team_turns SET ended_at = ?, outcome = 'interrupted' WHERE id = ?`).run(nowSec(), id)
      db.prepare('UPDATE team_messages SET read_at = NULL, turn_id = NULL, attempts = max(attempts - 1, 0) WHERE turn_id = ?').run(id)
    }
    return open.length
  })
}

export function spentSince(db: Db, since: number): number {
  return Number(db.prepare('SELECT COALESCE(sum(cost_usd), 0) AS cost FROM team_turns WHERE started_at >= ?').get(since)?.cost ?? 0)
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
  const sql = `SELECT id, sender, recipient, body, task_id, reply_to, created_at, read_at FROM team_messages
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
