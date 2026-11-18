import { inTransaction, type Db } from './open.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'

// 'user' is the person; 'queue' is the task queue reporting a finished task. Neither is a bot row.
export const USER = 'user'
export const SYSTEM = 'queue'
// The orchestrator bot. It exists from the first start, is listed first and cannot be deleted.
export const ORCHESTRATOR = 'taskq'

export type BotEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export const EFFORTS: BotEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
export type BotSdk = 'claude' | 'openai'

export type BotPermissionMode = 'auto' | 'acceptEdits' | 'default' | 'dontAsk' | 'plan' | 'bypassPermissions'
export const PERMISSION_MODES: BotPermissionMode[] = ['auto', 'acceptEdits', 'default', 'dontAsk', 'plan', 'bypassPermissions']

// What a bot is and what it may do. A new bot runs in auto mode with no sandbox and no blocked commands: the user
// tightens per bot. taskq's own data and config are protected for every bot regardless (src/team/bot-gate.ts).
export interface BotSettings {
  role: string
  description: string
  instructions: string
  may_message_user: boolean
  enabled: boolean
  permission_mode: BotPermissionMode
  sandbox: boolean
  allowed_domains: string[]   // network hosts commands may reach when the sandbox is on
  blocked_commands: string[]  // Bash command patterns (* matches anything) that are always refused
  workdir: string | null      // absolute working directory; null is the bot's own folder under TASKQ_HOME/team/
  skills: string[]            // names from the global skill registry
  plugins: string[]           // names from the global plugin registry
  model: string | null        // null uses the config model
  effort: BotEffort | null    // reasoning effort; null leaves it to the model
  sdk: BotSdk                 // which agent SDK runs the bot
  hourly_turns: number | null    // per-bot rate limit; null uses the global default
  turn_budget_usd: number | null // per-turn spend limit; null uses the global default
  turn_max_turns: number | null  // per-turn model turns; null uses the global default
}

export interface TeamAgent extends BotSettings {
  name: string
  system: boolean
  memory: string              // the bot's notes to itself, sent with every turn (src/team/memory.ts)
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
  outcome: 'done' | 'failed' | 'interrupted' | 'cancelled' | null
  error: string | null
  turns: number | null
  cost_usd: number | null
  writes: number
}

const BODY_LIMIT = 8000
const JSON_FIELDS = ['allowed_domains', 'blocked_commands', 'skills', 'plugins'] as const
const BOOL_FIELDS = ['may_message_user', 'enabled', 'sandbox', 'system'] as const

function toAgent(row: Record<string, unknown>): TeamAgent {
  const agent = { ...row } as Record<string, unknown>
  for (const key of JSON_FIELDS) agent[key] = JSON.parse(String(row[key] ?? '[]'))
  for (const key of BOOL_FIELDS) agent[key] = row[key] === 1
  delete agent.created_at
  return agent as unknown as TeamAgent
}

export function createAgent(db: Db, name: string, settings: BotSettings, system = false): void {
  db.prepare(`INSERT INTO team_agents (name, role, description, instructions, may_message_user, enabled, system,
    permission_mode, sandbox, allowed_domains, blocked_commands, workdir, skills, plugins, model, sdk, hourly_turns,
    turn_budget_usd, turn_max_turns, effort, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    name, settings.role, settings.description, settings.instructions, settings.may_message_user ? 1 : 0, settings.enabled ? 1 : 0,
    system ? 1 : 0, settings.permission_mode, settings.sandbox ? 1 : 0, JSON.stringify(settings.allowed_domains),
    JSON.stringify(settings.blocked_commands), settings.workdir, JSON.stringify(settings.skills), JSON.stringify(settings.plugins),
    settings.model, settings.sdk, settings.hourly_turns, settings.turn_budget_usd, settings.turn_max_turns, settings.effort, nowSec())
}

export function updateAgent(db: Db, name: string, settings: BotSettings): boolean {
  return db.prepare(`UPDATE team_agents SET role = ?, description = ?, instructions = ?, may_message_user = ?, enabled = ?,
    permission_mode = ?, sandbox = ?, allowed_domains = ?, blocked_commands = ?, workdir = ?, skills = ?, plugins = ?, model = ?,
    sdk = ?, hourly_turns = ?, turn_budget_usd = ?, turn_max_turns = ?, effort = ?
    WHERE name = ?`).run(
    settings.role, settings.description, settings.instructions, settings.may_message_user ? 1 : 0, settings.enabled ? 1 : 0,
    settings.permission_mode, settings.sandbox ? 1 : 0, JSON.stringify(settings.allowed_domains), JSON.stringify(settings.blocked_commands),
    settings.workdir, JSON.stringify(settings.skills), JSON.stringify(settings.plugins), settings.model, settings.sdk,
    settings.hourly_turns, settings.turn_budget_usd, settings.turn_max_turns, settings.effort, name).changes === 1
}

// The orchestrator is refused. Its tasks go back to the user; its messages stay for the record.
export function deleteAgent(db: Db, name: string): boolean {
  return inTransaction(db, () => {
    const row = db.prepare('SELECT system FROM team_agents WHERE name = ?').get(name)
    if (!row || row.system === 1) return false
    db.prepare(`UPDATE tasks SET owner = NULL, owner_since = NULL, status = CASE WHEN status = 'ready' THEN 'draft' ELSE status END
      WHERE owner = ? AND status NOT IN ('done', 'failed', 'cancelled', 'running')`).run(name)
    db.prepare(`UPDATE team_messages SET failed_at = ? WHERE recipient = ? AND read_at IS NULL AND failed_at IS NULL`).run(nowSec(), name)
    db.prepare('DELETE FROM team_agents WHERE name = ?').run(name)
    return true
  })
}

// Creates the orchestrator once. An existing row is left alone so the user's edits survive a restart.
export function seedAgents(db: Db, roster: (BotSettings & { name: string; system?: boolean })[]): void {
  for (const bot of roster) {
    if (!db.prepare('SELECT 1 FROM team_agents WHERE name = ?').get(bot.name)) createAgent(db, bot.name, bot, bot.system ?? false)
  }
}

export function listAgents(db: Db): TeamAgent[] {
  return db.prepare('SELECT * FROM team_agents ORDER BY system DESC, rowid').all().map((row) => toAgent(row))
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

// The body is masked here because this is the only path that stores message text. deliver_at holds a message back
// until that time, which is how an agent schedules work for later.
export function postMessage(db: Db, message: {
  sender: string; recipient: string; body: string; task_id?: string | null; reply_to?: number | null
  thread_id?: number | null; deliver_at?: number; attachments?: string[]
}): number {
  const body = mask(message.body.slice(0, BODY_LIMIT))
  const now = nowSec()
  const result = db.prepare(`INSERT INTO team_messages (sender, recipient, body, task_id, reply_to, thread_id, attachments, created_at, deliver_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(message.sender, message.recipient, body, message.task_id ?? null, message.reply_to ?? null,
    message.thread_id ?? null, JSON.stringify(message.attachments ?? []), now, message.deliver_at ?? now)
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
  outcome: 'done' | 'failed' | 'interrupted' | 'cancelled'; error?: string; turns?: number; cost_usd?: number; session_id?: string
}, maxAttempts: number): TurnEnd {
  return inTransaction(db, (): TurnEnd => {
    db.prepare(`UPDATE team_turns SET ended_at = ?, outcome = ?, error = ?, turns = ?, cost_usd = ?,
      session_id = COALESCE(?, session_id) WHERE id = ?`)
      .run(nowSec(), end.outcome, end.error?.slice(0, 500) ?? null, end.turns ?? null, end.cost_usd ?? null, end.session_id ?? null, id)
    // A cancelled turn's messages count as handled: the user stopped that work on purpose.
    if (end.outcome === 'done' || end.outcome === 'cancelled') return { setAside: [] }
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
    JOIN tasks t ON t.id = r.task_id WHERE t.owner IS NOT NULL AND r.started_at >= ? AND r.started_at >= t.owner_since`).get(since)?.cost ?? 0)
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
  const sql = `SELECT id, sender, recipient, body, task_id, reply_to, thread_id, attachments, created_at, deliver_at, read_at FROM team_messages
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
