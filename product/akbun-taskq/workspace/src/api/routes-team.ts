import type { Hono } from 'hono'
import { USER, getAgent, listAgents, listMessages, listTurns, markRead, openTurnAgents, postMessage, seedAgents } from '../db/team.ts'
import { getPage, listPages, searchPages } from '../db/wiki.ts'
import { DEFAULT_ROSTER } from '../team/roster.ts'
import { isTeamPaused, pauseTeam, resumeTeam, teamPauseReason } from '../team/hub.ts'
import { teamChanged } from '../wake.ts'
import { intParam } from './params.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'

export function registerTeamRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/team', (c) => {
    seedAgents(db, DEFAULT_ROSTER)
    const busy = new Set(openTurnAgents(db))
    return c.json({
      enabled: config.team.enabled,
      paused: isTeamPaused(db),
      pause_reason: teamPauseReason(db),
      agents: listAgents(db).map(({ instructions: _instructions, ...agent }) => ({ ...agent, busy: busy.has(agent.name) })),
      turns: listTurns(db, 20),
    })
  })

  api.get('/team/messages', (c) => {
    const q = c.req.query()
    return c.json(listMessages(db, { agent: q.agent, limit: intParam(q.limit, 'limit', 100, 1, 500) }))
  })

  // The user writes to one agent. Only the user's own words come in here; agents write through their tools.
  api.post('/team/messages', async (c) => {
    const body = await readJson(c) as { to?: unknown; body?: unknown } | null
    const to = typeof body?.to === 'string' ? body.to : 'lead'
    const text = typeof body?.body === 'string' ? body.body.trim() : ''
    if (!text || text.length > 8000) throw new HttpError(400, 'body must be a non-empty string up to 8000 characters')
    if (!getAgent(db, to)?.enabled) throw new HttpError(404, `no enabled agent named ${to}`)
    const id = postMessage(db, { sender: USER, recipient: to, body: text })
    teamChanged.notify()
    return c.json({ id }, 201)
  })

  api.post('/team/messages/read', (c) => {
    markRead(db, listMessages(db, { recipient: USER, unread: true, limit: 500 }).map((m) => m.id))
    return c.json({ ok: true })
  })

  api.post('/team/pause', (c) => {
    pauseTeam(db, 'paused by the user')
    return c.json({ paused: true })
  })

  api.post('/team/resume', (c) => {
    resumeTeam(db)
    return c.json({ paused: false })
  })

  api.get('/team/wiki', (c) => {
    const query = c.req.query('q')
    return c.json(query ? searchPages(db, query) : listPages(db))
  })

  // The slug may hold slashes, so it is a query parameter rather than a path segment.
  api.get('/team/wiki/page', (c) => {
    const page = getPage(db, c.req.query('slug') ?? '')
    if (!page) throw new HttpError(404, 'no such page')
    return c.json(page)
  })
}
