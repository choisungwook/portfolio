import type { Hono } from 'hono'
import { USER, getAgent, listAgents, listMessages, listTurns, markRead, openTurnAgents, postMessage, seedAgents } from '../db/team.ts'
import { getPage, listPages } from '../db/wiki.ts'
import { forceClose, listThreads } from '../db/threads.ts'
import { hybridSearch } from '../team/search.ts'
import { setOwner } from '../team/owner.ts'
import { DEFAULT_ROSTER } from '../team/roster.ts'
import { isTeamPaused, pauseTeam, resumeTeam, teamPauseReason } from '../team/hub.ts'
import { teamChanged } from '../wake.ts'
import { intParam } from './params.ts'
import { TASK_TITLE_SQL } from '../db/tasks.ts'
import { HttpError, idParam, optionalJson, readJson, type ApiDeps } from './http.ts'

// The UI, CLI, API and config call the resident agents bots; the code and tables call them the team.
export function registerBotsRoutes(api: Hono, { db, config }: ApiDeps): void {
  const search = hybridSearch(db)
  // The sidebar shows each bot like a chat: the latest message it sent or received, and how many it sent the user unread.
  const lastMessage = (name: string) => db.prepare(`SELECT id, sender, recipient, substr(body, 1, 160) AS body, created_at FROM team_messages
    WHERE (sender = ? OR recipient = ?) AND deliver_at <= unixepoch() ORDER BY id DESC LIMIT 1`).get(name, name) ?? null
  const unreadFrom = (name: string) => Number(db.prepare(`SELECT count(*) AS n FROM team_messages
    WHERE sender = ? AND recipient = 'user' AND read_at IS NULL`).get(name)?.n ?? 0)

  api.get('/bots', (c) => {
    seedAgents(db, DEFAULT_ROSTER)
    const busy = new Set(openTurnAgents(db))
    return c.json({
      enabled: config.bots.enabled,
      paused: isTeamPaused(db),
      pause_reason: teamPauseReason(db),
      agents: listAgents(db).map(({ instructions: _instructions, ...agent }) => ({
        ...agent, busy: busy.has(agent.name), last_message: lastMessage(agent.name), unread: unreadFrom(agent.name),
      })),
      tasks: db.prepare(`SELECT t.id, t.type, t.status, t.owner, ${TASK_TITLE_SQL} FROM tasks t
        WHERE t.owner IS NOT NULL AND t.status NOT IN ('done', 'failed') ORDER BY t.updated_at DESC LIMIT 200`).all(),
      threads: listThreads(db, 20),
      turns: listTurns(db, 20),
    })
  })

  api.get('/bots/messages', (c) => {
    const q = c.req.query()
    return c.json(listMessages(db, { agent: q.agent, limit: intParam(q.limit, 'limit', 100, 1, 500) }))
  })

  // The user writes to one agent. Only the user's own words come in here; agents write through their tools.
  api.post('/bots/messages', async (c) => {
    const body = await readJson(c) as { to?: unknown; body?: unknown } | null
    const to = typeof body?.to === 'string' ? body.to : 'lead'
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    if (!text || text.length > 8000) throw new HttpError(400, 'body must be a non-empty string up to 8000 characters')
    if (!getAgent(db, to)?.enabled) throw new HttpError(404, `no enabled agent named ${to}`)
    const id = postMessage(db, { sender: USER, recipient: to, body: text })
    teamChanged.notify()
    return c.json({ id }, 201)
  })

  // Marks what the user has seen: every unread message to the user, or only those from one bot.
  api.post('/bots/messages/read', async (c) => {
    const body = await optionalJson(c)
    const from = typeof body.agent === 'string' ? body.agent : undefined
    markRead(db, listMessages(db, { recipient: USER, unread: true, limit: 500 }).filter((m) => !from || m.sender === from).map((m) => m.id))
    return c.json({ ok: true })
  })

  // The user gives a task to an agent (owner: name) or takes it back (owner: null).
  api.post('/bots/tasks/:id/owner', async (c) => {
    const body = await readJson(c) as { owner?: unknown } | null
    const owner = body?.owner
    if (owner !== null && typeof owner !== 'string') throw new HttpError(400, 'owner must be an agent name or null')
    try {
      setOwner(db, c.req.param('id'), owner, USER)
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : String(error))
    }
    return c.json({ owner })
  })

  api.post('/bots/threads/:id/close', (c) => {
    if (!forceClose(db, idParam(c.req.param('id')), 'closed by the user')) throw new HttpError(409, 'discussion is already closed or unknown')
    teamChanged.notify()
    return c.json({ ok: true })
  })

  api.post('/bots/pause', (c) => {
    pauseTeam(db, 'paused by the user')
    return c.json({ paused: true })
  })

  api.post('/bots/resume', (c) => {
    resumeTeam(db)
    return c.json({ paused: false })
  })

  api.get('/bots/wiki', (c) => {
    const query = c.req.query('q')
    return c.json(query ? search(query, 30) : listPages(db))
  })

  // The slug may hold slashes, so it is a query parameter rather than a path segment.
  api.get('/bots/wiki/page', (c) => {
    const page = getPage(db, c.req.query('slug') ?? '')
    if (!page) throw new HttpError(404, 'no such page')
    return c.json(page)
  })
}
