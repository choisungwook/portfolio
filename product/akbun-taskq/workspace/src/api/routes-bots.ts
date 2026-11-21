import type { Hono } from 'hono'
import {
  ORCHESTRATOR, SYSTEM, USER, createAgent, deleteAgent, getAgent, listAgents, listMessages, listTurnSteps, listTurns, markRead, openTurnAgents, postMessage,
  queuedCounts, resetAgentSession, seedAgents, updateAgent,
} from '../db/team.ts'
import { createCatalog } from '../team/catalog.ts'
import { knownNames } from '../db/bot-registry.ts'
import { BOT_NAME, parseBotSettings } from '../team/bot-settings.ts'
import { noteReload, reload, reloadAll } from '../team/bot-plugin.ts'
import { PRESETS } from '../team/roster.ts'
import { releaseBotTasks } from '../team/bot-work.ts'
import { getMemory, MEMORY_LIMIT, setMemory } from '../team/memory.ts'
import { sharedRelative } from '../team/shared.ts'
import { searchMessages } from '../db/message-search.ts'
import { botActivity } from '../team/activity.ts'
import { browserClickAt, browserOpen, browserScreenshot, browserState } from '../browser/actions.ts'
import { allowedSites, forgetSite } from '../browser/sites.ts'
import { getPage, listPages } from '../db/wiki.ts'
import { forceClose, listThreads } from '../db/threads.ts'
import { hybridSearch } from '../team/search.ts'
import { setOwner } from '../team/owner.ts'
import { ROSTER } from '../team/roster.ts'
import { isTeamPaused, pauseTeam, requestBotCancel, resumeTeam, teamPauseReason } from '../team/hub.ts'
import { teamChanged } from '../wake.ts'
import { intParam } from './params.ts'
import { TASK_TITLE_SQL } from '../db/tasks.ts'
import { HttpError, idParam, optionalJson, readJson, type ApiDeps } from './http.ts'

// The UI, CLI, API and config call the resident agents bots; the code and tables call them the team.
export function registerBotsRoutes(api: Hono, { db, config, bots }: ApiDeps): void {
  const search = hybridSearch(db)
  // Stops the bot's running turn: directly when the hub runs in this process, else through the marker it reads.
  const stopTurn = (name: string): boolean => {
    if (bots) return bots.cancel(name)
    const open = db.prepare('SELECT id FROM team_turns WHERE agent = ? AND ended_at IS NULL').get(name)
    if (!open) return false
    requestBotCancel(db, name, Number(open.id))
    return true
  }
  const catalog = bots?.catalog ?? createCatalog(db, config, () => undefined)
  const queued = () => queuedCounts(db, Math.floor(Date.now() / 1000))
  // The sidebar shows each bot like a chat: the latest message it sent or received, and how many it sent the user unread.
  const lastMessage = (name: string) => db.prepare(`SELECT id, sender, recipient, substr(body, 1, 160) AS body, created_at FROM team_messages
    WHERE (sender = ? OR recipient = ?) AND deliver_at <= unixepoch() ORDER BY id DESC LIMIT 1`).get(name, name) ?? null
  const workingSince = (name: string) => {
    const row = db.prepare('SELECT started_at FROM team_turns WHERE agent = ? AND ended_at IS NULL').get(name)
    return row ? Number(row.started_at) : null
  }
  const runningTasks = (name: string) => db.prepare(`SELECT id FROM tasks WHERE status = 'running' AND claimed_by = ?`)
    .all(`bot:${name}`).map((row) => String(row.id))
  const unreadFrom = (name: string) => Number(db.prepare(`SELECT count(*) AS n FROM team_messages
    WHERE sender = ? AND recipient = 'user' AND read_at IS NULL`).get(name)?.n ?? 0)

  api.get('/bots', (c) => {
    seedAgents(db, ROSTER)
    const busy = new Set(openTurnAgents(db))
    const waiting = queued()
    return c.json({
      paused: isTeamPaused(db),
      pause_reason: teamPauseReason(db),
      agents: listAgents(db).map(({ instructions: _instructions, memory: _memory, ...agent }) => ({
        ...agent, busy: busy.has(agent.name), last_message: lastMessage(agent.name), unread: unreadFrom(agent.name),
        working_since: workingSince(agent.name), running_tasks: runningTasks(agent.name), queued: waiting.get(agent.name) ?? 0,
      })),
      tasks: db.prepare(`SELECT t.id, t.type, t.status, t.owner, ${TASK_TITLE_SQL} FROM tasks t
        WHERE t.owner IS NOT NULL AND t.status NOT IN ('done', 'failed', 'cancelled') ORDER BY t.updated_at DESC LIMIT 200`).all(),
      threads: listThreads(db, 20),
      turns: listTurns(db, 20),
    })
  })

  api.get('/bots/presets', (c) => c.json(PRESETS))

  // Search across every bot conversation: trigram FTS for terms of three characters or more (Korean particles
  // included), LIKE for shorter ones, newest first. Cheap: one indexed query, at most 100 rows.
  api.get('/bots/search', (c) => c.json(searchMessages(db, c.req.query('q') ?? '')))

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
    const body = await readJson(c) as { to?: unknown; body?: unknown; attachments?: unknown } | null
    const to = typeof body?.to === 'string' ? body.to : ORCHESTRATOR
    const files = Array.isArray(body?.attachments) ? body.attachments : []
    // An upload (POST /api/files) or any existing file of the shared folder the user picked with @, relative to it.
    if (files.length > 20 || !files.every((f) => typeof f === 'string' && !f.split('/').includes('..') && sharedRelative(config, f) === f)) {
      throw new HttpError(400, 'attachments must be up to 20 existing files of the shared folder, as paths relative to it')
    }
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    if ((!text && files.length === 0) || text.length > 8000) throw new HttpError(400, 'body must be a string up to 8000 characters, or attach a file')
    if (!getAgent(db, to)?.enabled) throw new HttpError(404, `no enabled agent named ${to}`)
    const id = postMessage(db, { sender: USER, recipient: to, body: text || '(attached files)', attachments: files as string[] })
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
  // The bot's failed turns, newest first, so its conversation can show why a message went unanswered. ?limit= (50)
  api.get('/bots/:name/turn-errors', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    const limit = Math.min(200, Math.max(1, Number(c.req.query('limit') ?? 50) || 50))
    return c.json(db.prepare(`SELECT id, outcome, error, ended_at FROM team_turns WHERE agent = ? AND outcome = 'failed' AND ended_at IS NOT NULL
      ORDER BY id DESC LIMIT ?`).all(name, limit))
  })

  // The bot's tool calls since ?since= (unix seconds), oldest first, so its conversation shows what it did. ?limit= (500)
  // The bot's open pull requests (from links in its conversation and its tasks' summaries, checked with gh) and its
  // background work: unfinished tasks it owns, how many finished in the last day, and bots working on what it sent.
  api.get('/bots/:name/activity', async (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    return c.json(await botActivity(db, name))
  })

  // The bot's browser for the right pane: where it is (never starts one), a JPEG of what it shows, and the user driving
  // the same browser by its address bar or by clicking the picture (x, y in the page's CSS pixels).
  const botOf = (name: string) => {
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    return name
  }
  const browserCall = async <T>(work: () => Promise<T>) => {
    try {
      return await work()
    } catch (error) {
      throw new HttpError(409, error instanceof Error ? error.message : String(error))
    }
  }
  api.get('/bots/:name/browser', async (c) => {
    const name = botOf(c.req.param('name'))
    return c.json({ ...(await browserState(config, name)), sites: allowedSites(db, name) })
  })
  // Takes back a site the user allowed: the bot's next click or typing there asks again.
  api.delete('/bots/:name/browser/sites/:host', (c) => {
    const name = botOf(c.req.param('name'))
    forgetSite(db, name, c.req.param('host'))
    return c.json({ sites: allowedSites(db, name) })
  })
  api.get('/bots/:name/browser/screen', async (c) => {
    const name = botOf(c.req.param('name'))
    if (!(await browserState(config, name)).running) throw new HttpError(404, 'the browser is not running')
    const jpeg = await browserCall(() => browserScreenshot(config, name, 'jpeg', false))
    return c.body(new Uint8Array(jpeg), 200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' })
  })
  api.post('/bots/:name/browser/open', async (c) => {
    const name = botOf(c.req.param('name'))
    const body = (await readJson(c) ?? {}) as Record<string, unknown>
    return c.json(await browserCall(() => browserOpen(config, name, String(body.url ?? ''))))
  })
  api.post('/bots/:name/browser/click', async (c) => {
    const name = botOf(c.req.param('name'))
    const body = (await readJson(c) ?? {}) as Record<string, unknown>
    const x = Number(body.x)
    const y = Number(body.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError(400, 'x and y are required')
    return c.json(await browserCall(() => browserClickAt(config, name, x, y)))
  })

  api.get('/bots/:name/steps', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    const limit = Math.min(2000, Math.max(1, Number(c.req.query('limit') ?? 500) || 500))
    return c.json(listTurnSteps(db, name, Number(c.req.query('since') ?? 0) || 0, limit))
  })

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
    if (current.enabled && !parsed.value.enabled) {
      stopTurn(name)
      releaseBotTasks(db, name, 'the bot was disabled', 'ready')
    }
    // A model change shows in the conversation, followed by the skill and plugin reload note, so the user sees where the
    // new model starts.
    if ((parsed.value.model ?? null) !== (current.model ?? null)) {
      const id = postMessage(db, { sender: SYSTEM, recipient: name, body: `Model changed: ${current.model ?? 'default'} → ${parsed.value.model ?? 'default'}` })
      db.prepare('UPDATE team_messages SET read_at = created_at WHERE id = ?').run(id)
    }
    // Effort does not touch skills or plugins, so an effort-only save skips the reload and its note in the chat.
    const effortOnly = typeof body === 'object' && body !== null && Object.keys(body).every((key) => key === 'effort')
    if (!effortOnly) noteReload(db, name, reloadAll(db, config, name))
    teamChanged.notify()
    return c.json(getAgent(db, name))
  })

  api.delete('/bots/:name', (c) => {
    const name = c.req.param('name')
    if (getAgent(db, name)?.system) throw new HttpError(409, `${ORCHESTRATOR} cannot be deleted`)
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    stopTurn(name)
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

  // Stops the bot's running turn. Its running task becomes cancelled; the turn is shown as cancelled.
  api.post('/bots/:name/cancel', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    // The CLI and the MCP server run in another process than the bots: there the cancel is a marker the hub reads.
    if (!stopTurn(name)) throw new HttpError(409, `${name} is not working right now`)
    return c.json(bots ? { ok: true } : { ok: true, requested: true })
  })

  api.get('/bots/:name/memory', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    return c.json({ memory: getMemory(db, name), limit: MEMORY_LIMIT })
  })

  api.put('/bots/:name/memory', async (c) => {
    const name = c.req.param('name')
    const body = await readJson(c) as { memory?: unknown } | null
    if (typeof body?.memory !== 'string') throw new HttpError(400, 'memory must be a string')
    const error = setMemory(db, name, body.memory)
    if (error) throw new HttpError(error.startsWith('no bot') ? 404 : 400, error)
    return c.json({ memory: getMemory(db, name) })
  })

  // Models and slash commands for the compose bar. `refresh=1` asks the SDK again instead of using the cached answer.
  api.get('/bots/:name/catalog', async (c) => {
    const result = await catalog(c.req.param('name'), c.req.query('refresh') === '1')
    if (!result) throw new HttpError(404, 'no such bot')
    return c.json(result)
  })

  api.post('/bots/:name/reset', (c) => {
    const name = c.req.param('name')
    if (!getAgent(db, name)) throw new HttpError(404, 'no such bot')
    resetAgentSession(db, name)
    return c.json({ ok: true })
  })
}
