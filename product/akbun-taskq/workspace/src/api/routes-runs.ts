import type { Hono } from 'hono'
import { listRuns, RUN_CAP } from '../db/runs.ts'
import { runDetail } from '../db/detail.ts'
import { waitsForRuns } from '../db/waits.ts'
import { dayStart, dayEnd, isDay } from '../time.ts'
import { filterParams } from './params.ts'
import { HttpError, type ApiDeps } from './http.ts'

export function registerRunRoutes(api: Hono, { db }: ApiDeps): void {
  // Overlap selection: a run that started earlier and is still open at `from` is included. Waits ride along per row.
  api.get('/runs', (c) => {
    const q = c.req.query()
    const from = q.from === undefined ? undefined : numberParam(q.from, 'from')
    const to = q.to === undefined ? undefined : numberParam(q.to, 'to')
    const rows = listRuns(db, { from, to, ...filterParams(q), limit: RUN_CAP + 1 })
    const kept = rows.slice(0, RUN_CAP)
    const waits = waitsForRuns(db, kept.map((row) => row.id))
    const runs = kept.map((row) => ({ ...row, waits: waits.get(row.id) ?? [] }))
    return c.json({ runs, truncated: rows.length > RUN_CAP })
  })

  api.get('/runs/:id', (c) => {
    const detail = runDetail(db, c.req.param('id'))
    return detail ? c.json(detail) : c.json({ error: 'run not found' }, 404)
  })
}

function numberParam(value: string, name: string): number {
  if (isDay(value)) return name === 'from' ? dayStart(value) : dayEnd(value)
  const n = Number(value)
  if (!Number.isFinite(n)) throw new HttpError(400, `${name} must be epoch seconds or YYYY-MM-DD`)
  return n
}
