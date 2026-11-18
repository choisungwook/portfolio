import type { Hono } from 'hono'
import { cancelJob, createJob, getJob, listJobs, resumeJob } from '../jobs/store.ts'
import { resolveSource } from '../wiki/transfer.ts'
import { intParam } from './params.ts'
import { HttpError, optionalJson, type ApiDeps } from './http.ts'

// Background jobs: wiki export and import. The taskq process runs them; the CLI and MCP server only queue them.
export function registerJobRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/jobs', (c) => c.json(listJobs(db, intParam(c.req.query('limit'), 'limit', 50, 1, 200), c.req.query('kind') || undefined)))

  api.get('/jobs/:id', (c) => {
    const job = getJob(db, c.req.param('id'))
    if (!job) throw new HttpError(404, 'no such job')
    return c.json(job)
  })

  api.post('/jobs/:id/cancel', (c) => {
    const job = getJob(db, c.req.param('id'))
    if (!job) throw new HttpError(404, 'no such job')
    if (job.status !== 'queued' && job.status !== 'running') throw new HttpError(409, `the job is ${job.status}`)
    return c.json(cancelJob(db, job.id))
  })

  api.post('/jobs/:id/resume', (c) => {
    const job = resumeJob(db, c.req.param('id'))
    if (!job) throw new HttpError(409, 'only a cancelled or failed job can be resumed')
    return c.json(job)
  })

  api.post('/bots/wiki/export', (c) => c.json(createJob(db, 'wiki_export', {}), 202))

  // { "source": a path in the shared folder (an uploaded zip) or an absolute file or folder, "name": optional batch name }
  api.post('/bots/wiki/import', async (c) => {
    const body = await optionalJson(c)
    const source = typeof body.source === 'string' ? body.source.trim() : ''
    if (!source || !resolveSource(config, source)) throw new HttpError(400, 'source must be a zip or folder that exists: a path in the shared folder or an absolute path')
    const name = typeof body.name === 'string' ? body.name.slice(0, 60) : ''
    return c.json(createJob(db, 'wiki_import', { source, name }), 202)
  })
}
