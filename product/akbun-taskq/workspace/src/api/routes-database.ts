import type { Hono } from 'hono'
import { readFileSync } from 'node:fs'
import { appendImportChunk, backupPath, exportDatabase, finishImport, listBackups } from '../db/backup.ts'
import { HttpError, readJson, type ApiDeps } from './http.ts'

// Settings > Database: back up the database (a consistent copy, downloaded through this token-guarded API) and restore
// one (uploaded in chunks, checked, then swapped in by a restart of this taskq).
export function registerDatabaseRoutes(api: Hono, { db, config, restart }: ApiDeps): void {
  api.get('/database/backups', (c) => c.json(listBackups(config)))
  api.post('/database/export', (c) => c.json(exportDatabase(db, config), 201))
  api.get('/database/backups/:name', (c) => {
    const path = backupPath(config, c.req.param('name'))
    if (!path) throw new HttpError(404, 'no such backup')
    return c.body(readFileSync(path), 200, { 'content-type': 'application/vnd.sqlite3', 'content-disposition': `attachment; filename="${c.req.param('name')}"` })
  })
  // { upload: <hex id>, index: 0..n, offset: bytes uploaded so far, data: <base64 of at most 8 MB> }, in order.
  api.post('/database/import/chunk', async (c) => {
    const body = await readJson(c) as { upload?: unknown; index?: unknown; offset?: unknown; data?: unknown } | null
    if (typeof body?.data !== 'string' || !/^[A-Za-z0-9+/=\s]*$/.test(body.data)) throw new HttpError(400, 'data must be base64')
    if (!Number.isInteger(body.index) || (body.index as number) < 0) throw new HttpError(400, 'index must be 0 or more')
    try {
      return c.json({ size: appendImportChunk(config, String(body.upload ?? ''), body.index as number, Buffer.from(body.data, 'base64'), Number(body.offset ?? 0)) })
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
  })
  // { upload }: checks the uploaded file and, when it is a taskq database, restarts taskq to swap it in.
  api.post('/database/import', async (c) => {
    const body = await readJson(c) as { upload?: unknown } | null
    if (!restart) throw new HttpError(409, 'only the running taskq (taskq run) can restore a database; use taskq db import FILE and restart')
    try {
      finishImport(config, String(body?.upload ?? ''))
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : String(error))
    }
    setTimeout(restart, 200)
    return c.json({ restarting: true }, 202)
  })
}
