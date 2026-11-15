import type { Hono } from 'hono'
import { ackAlert, listAlerts } from '../db/alerts.ts'
import { HttpError, idParam, type ApiDeps } from './http.ts'

export function registerAlertRoutes(api: Hono, { db }: ApiDeps): void {
  api.get('/alerts', (c) => c.json(listAlerts(db, c.req.query('all') === '1')))

  api.post('/alerts/:id/ack', (c) => {
    if (!ackAlert(db, idParam(c.req.param('id')))) throw new HttpError(404, 'alert not found or already acked')
    return c.json({ ok: true })
  })
}
