import type { Hono } from 'hono'
import { acceptHandoff, listHandoffs, setHandoffMode } from '../db/handoffs.ts'
import { HttpError, idParam, readJson, type ApiDeps } from './http.ts'

export function registerHandoffRoutes(api: Hono, { db }: ApiDeps): void {
  api.get('/handoffs', (c) => c.json(listHandoffs(db, c.req.query('task_id'))))

  api.post('/handoffs/:id/accept', (c) => {
    if (!acceptHandoff(db, idParam(c.req.param('id')))) throw new HttpError(409, 'handoff is not awaiting acceptance')
    return c.json({ ok: true })
  })

  api.post('/tasks/:id/handoff-mode', async (c) => {
    const body = await readJson(c) as { auto_accept?: unknown } | null
    if (typeof body?.auto_accept !== 'boolean') throw new HttpError(400, 'auto_accept must be a boolean')
    if (!setHandoffMode(db, c.req.param('id'), body.auto_accept)) throw new HttpError(404, 'task not found')
    return c.json({ auto_accept: body.auto_accept })
  })
}
