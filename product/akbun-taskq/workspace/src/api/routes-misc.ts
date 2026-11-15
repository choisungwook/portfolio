import type { Hono } from 'hono'
import type { Db } from '../db/open.ts'
import { listEvents } from '../db/events.ts'
import { getProposal, listProposals, setProposalStatus, type ProposalRow } from '../db/proposals.ts'
import { searchHistory } from '../db/search.ts'
import { dailyStats } from '../db/stats.ts'
import { getMeta, isQueuePaused, pauseBy, pauseQueue, resumeQueue } from '../db/meta.ts'
import { OperatorError, pauseReason } from '../db/operator.ts'
import { graphNodes, listDeps, listLockKeys } from '../db/tasks.ts'
import { dayEnd, dayKey, dayStart, isDay, nowSec } from '../time.ts'
import { appendTarget, resolveTarget } from './target.ts'
import { enumParam, filterParams, intParam, PROPOSAL_STATUSES } from './params.ts'
import { HttpError, idParam, optionalJson, type ApiDeps } from './http.ts'

const MAX_SAFE = Number.MAX_SAFE_INTEGER

export function registerMiscRoutes(api: Hono, { db, config }: ApiDeps): void {
  api.get('/stats/daily', (c) => {
    const today = dayKey(nowSec())
    const fromDay = c.req.query('from') ?? addDays(today, -6)
    const toDay = c.req.query('to') ?? today
    if (!isDay(fromDay) || !isDay(toDay)) throw new HttpError(400, 'from and to must be YYYY-MM-DD')
    return c.json(dailyStats(db, dayStart(fromDay), dayEnd(toDay), filterParams(c.req.query())))
  })

  // order=desc gives the newest events first. limit is 1 to 500.
  api.get('/events', (c) => {
    const q = c.req.query()
    const order = enumParam(q.order, 'order', ['asc', 'desc'] as const) ?? 'asc'
    return c.json(listEvents(db, {
      task_id: q.task_id,
      run_id: q.run_id,
      after: intParam(q.after, 'after', 0, 0, MAX_SAFE),
      limit: intParam(q.limit, 'limit', 200, 1, 500),
      order,
    }))
  })

  api.get('/lock-keys', (c) => c.json(listLockKeys(db)))

  api.get('/proposals', (c) => c.json(listProposals(db, enumParam(c.req.query('status'), 'status', PROPOSAL_STATUSES))))

  api.post('/proposals/:id/apply', (c) => {
    const proposal = pendingProposal(db, c.req.param('id'))
    const target = resolveTarget(config, proposal.target_path)
    // ponytail: apply is append-only; the upgrade path is a real patch that can replace text.
    appendTarget(target, proposal.diff)
    setProposalStatus(db, proposal.id, 'applied')
    return c.json({ ok: true, path: target })
  })

  api.post('/proposals/:id/reject', (c) => {
    const proposal = pendingProposal(db, c.req.param('id'))
    setProposalStatus(db, proposal.id, 'rejected')
    return c.json({ ok: true })
  })

  api.get('/search', (c) => c.json(searchHistory(db, c.req.query('q') ?? '')))

  api.get('/graph', (c) => c.json({ tasks: graphNodes(db), deps: listDeps(db) }))

  api.get('/queue', (c) => c.json({
    paused: isQueuePaused(db),
    reason: getMeta(db, 'pause_reason') ?? '',
    pause_by: pauseBy(db),
    max_concurrent: config.maxConcurrent,
  }))

  // The body may carry { "reason": "..." }. Running tasks continue; nothing new is claimed.
  api.post('/queue/pause', async (c) => {
    const body = await optionalJson(c)
    try {
      pauseQueue(db, pauseReason(body.reason), 'user')
    } catch (error) {
      if (error instanceof OperatorError) throw new HttpError(400, error.message)
      throw error
    }
    return c.json({ paused: true, reason: getMeta(db, 'pause_reason') ?? '', pause_by: 'user' })
  })

  api.post('/queue/resume', (c) => {
    resumeQueue(db)
    return c.json({ paused: false })
  })
}

function pendingProposal(db: Db, value: string): ProposalRow {
  const proposal = getProposal(db, idParam(value))
  if (!proposal) throw new HttpError(404, 'proposal not found')
  if (proposal.status !== 'pending') throw new HttpError(409, 'proposal is not pending')
  return proposal
}

function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  return dayKey(Math.floor(new Date(y, m - 1, d + delta).getTime() / 1000))
}
