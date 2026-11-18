import type { Hono } from 'hono'
import {
  ORCHESTRATOR, USER, createAgent, deleteAgent, getAgent, listAgents, listMessages, listTurns, markRead, openTurnAgents, postMessage,
  seedAgents, setAgentSession, updateAgent,
} from '../db/team.ts'
import { knownNames } from '../db/bot-registry.ts'
import { BOT_NAME, parseBotSettings } from '../team/bot-settings.ts'
import { noteReload, reload, reloadAll } from '../team/bot-plugin.ts'
import { PRESETS } from '../team/roster.ts'
import { releaseBotTasks } from '../team/bot-work.ts'
import { getPage, listPages } from '../db/wiki.ts'
import { forceClose, listThreads } from '../db/threads.ts'
import { hybridSearch } from '../team/search.ts'
import { setOwner } from '../team/owner.ts'
import { ROSTER } from '../team/roster.ts'
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
    seedAgents(db, ROSTER)
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

  api.get('/bots/presets', (c) => c.json(PRESETS))

  // Creates a bot. The body is { name, preset?, ...settings }; a preset fills role, description and instructions that the
  // body leaves out. A new bot runs in auto mode with no sandbox and no blocked commands.
  api.post('/bots', async (c) => {
    const body = await readJson(c) as Record<string, unknown> | null
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!BOT_NAME.test(name) || name === USER) throw new HttpError(400, 'name must be lowercase letters, digits and hyphens, starting with a letter, up to 32')
    if (getAgent(db, name) || name === 'queue') throw new HttpError(409, `a bot named ${name} already exists`)
    const preset = typeof body?.preset === 'string' ? PRESETS[body.preset] : undefined
    const parsed = parseBotSettings({ ...(preset ?? {}), ...body, name: undefined, preset: undefined }, knownNames(db))
    if (!parsed.ok) throw new HttpError(400, parsed.error)
    createAgent(db, name, parsed.value)
    noteReload(db, name, reloadAll(db, config, name))
    return c.json(getAgent(db, name), 201)
  })

  api.get('/bots/messages', (c) => {
    const q = c.req.query()
    return c.json(listMessages(db, { agent: q.agent, limit: intParam(q.limit, 'limit', 100, 1, 500) }))
  })

  // The user writes to one agent. Only the user's own words come in here; agents write through their tools.
  api.post('/bots/messages', async (c) => {
    const body = await readJson(c) as { to?: unknown; body?: unknown } | null
    const to = typeof body?.to === 'string' ? body.to : ORCHESTRATOR
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

  // Routes with a bot name come last, so /bots/messages, /bots/wiki and /bots/presets are not read as bot names.
  api.get('/bots/:name', (c) => {
    const agent = getAgent(db, c.req.param('name'))
    if (!agent) throw new HttpError(404, 'no such bot')
    return c.json(agent)
  })

  // Saving settings rebuilds the bot's skill and plugin snapshot, so the next turn loads what was chosen.
  api.put('/bots/:name', async (c) => {
    const name = c.req.param('name')
    const current = getAgent(db, name)
    if (!current) throw new HttpError(404, 'no such bot')
    const body = await readJson(c)
    const parsed = parseBotSettings(body, knownNames(db), current)
    if (!parsed.ok) throw new HttpError(400, parsed.error)
    if (current.system && !parsed.value.enabled) throw new HttpError(409, `${ORCHESTRATOR} cannot be disabled; pause the bots instead`)
    updateAgent(db, name, parsed.value)
    if (current.enabled && !parsed.value.enabled) releaseBotTasks(db, name, 'the bot was disabled', 'ready')
    noteReload(db, name, reloadAll(db, config, name))
    teamChanged.notify()
    return c.json(getAgent(db, name))
  })

  api.delete('/bots/:name', (c) => {
    const name = c.req.param('name')
    if (getAgent(db, name)?.system) throw new HttpError(409, `${ORCHESTRATOR} cannot be deleted`)
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    releaseBotTasks(db, name, 'the bot was deleted', 'draft')
    deleteAgent(db, name)
    teamChanged.notify()
    return c.body(null, 204)
  })

  // Re-copies the selected skills or plugins from their registered folders; the next turn loads the new copy.
  api.post('/bots/:name/reload', async (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    const body = await optionalJson(c)
    const kind = body.kind ?? 'all'
    if (kind !== 'skill' && kind !== 'plugin' && kind !== 'all') throw new HttpError(400, 'kind must be skill, plugin or all')
    const reports = kind === 'all' ? reloadAll(db, config, name) : [reload(db, config, name, kind)]
    return c.json({ reports, note: noteReload(db, name, reports) })
  })

  api.post('/bots/:name/reset', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    setAgentSession(db, name, null)
    return c.json({ ok: true })
  })
}
