import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { endRun, insertRun } from '../src/db/runs.ts'
import { dayEnd, dayKey, dayStart } from '../src/time.ts'
import { addTask, setup, TOKEN, type TestEnv } from './helpers.ts'

const DAY = '2026-03-10'
const at = (day: string, hour: number) => dayStart(day) + hour * 3600
const nextDay = (day: string) => dayKey(dayEnd(day))

describe('api queries', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const host = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })
  const get = (app: ReturnType<typeof createApp>, path: string) => app.request(`/api${path}`, { headers: host() })
  const event = (taskId: string, runId: string | null, ts: number, kind: string, payload: object) => env.db
    .prepare('INSERT INTO events (task_id, run_id, ts, kind, payload) VALUES (?, ?, ?, ?, ?)')
    .run(taskId, runId, ts, kind, JSON.stringify(payload))
  const run = (taskId: string, id: string, startedAt: number, endedAt: number | null, outcome: 'done' | 'failed' | 'needs_auth' | 'stale' | null) => {
    insertRun(env.db, { id, task_id: taskId, session_id: null, started_at: startedAt })
    if (endedAt !== null && outcome !== null) {
      endRun(env.db, { id, task_id: taskId, intent: 'x', outcome, summary: `summary ${id}`, stats: { cost_usd: 1 }, ended_at: endedAt })
    }
  }

  // Fixture: two tasks, five runs around DAY. r2 starts the day before and ends inside DAY. r4 starts the next day.
  function seed() {
    const code = addTask(env.db, { type: 'code', status: 'done', lock_key: 'acct-a', data: { intent: 'x'.repeat(70) } })
    const research = addTask(env.db, { type: 'research', status: 'done', lock_key: 'acct-b', data: { title: 'Titled', intent: 'other' } })
    run(code.id, 'r1', at(DAY, 9), at(DAY, 10), 'done')
    run(research.id, 'r2', at(DAY, 0) - 3600, at(DAY, 1), 'failed')
    run(research.id, 'r3', at(DAY, 12), at(DAY, 12) + 300, 'needs_auth')
    run(research.id, 'r4', at(nextDay(DAY), 8), at(nextDay(DAY), 8) + 60, 'done')
    run(code.id, 'r5', at(DAY, 14), null, null)
    run(code.id, 'r0', at(DAY, 0) - 2 * 86400, at(DAY, 0) - 2 * 86400 + 100, 'stale')
    event(code.id, 'r1', at(DAY, 9) + 600, 'permission_request', { request_id: 'q1' })
    event(code.id, 'r1', at(DAY, 9) + 1200, 'approved', { request_id: 'q1' })
    env.db.prepare(`INSERT INTO alerts (task_id, run_id, severity, kind, message, created_at) VALUES (?, 'r1', 'critical', 'worker_flag', 'check', ?)`)
      .run(code.id, at(DAY, 10))
    return { code, research }
  }

  test('GET /events orders oldest first by default and newest first with order=desc, limit validated', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const task = addTask(env.db, {})
    for (let i = 0; i < 5; i += 1) event(task.id, null, 1000 + i, 'progress', { i })
    const asc = await (await get(app, `/events?task_id=${task.id}&limit=2`)).json() as { id: number }[]
    assert.deepEqual(asc.map((e) => e.id), [1, 2])
    const desc = await (await get(app, `/events?task_id=${task.id}&order=desc&limit=2`)).json() as { id: number }[]
    assert.deepEqual(desc.map((e) => e.id), [5, 4])
    for (const bad of ['limit=0', 'limit=501', 'limit=2.5', 'limit=abc', 'order=up', 'after=-1']) {
      assert.equal((await get(app, `/events?${bad}`)).status, 400, bad)
    }
  })

  test('GET /runs selects by overlap, attaches waits and clips nothing server side', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    seed()
    const body = await (await get(app, `/runs?from=${DAY}&to=${DAY}`)).json() as {
      runs: { id: string; title?: string; waits: { from: number; to: number | null; kind: string }[] }[]; truncated: boolean
    }
    assert.equal(body.truncated, false)
    const ids = body.runs.map((r) => r.id).sort()
    assert.deepEqual(ids, ['r1', 'r2', 'r3', 'r5'])
    const r1 = body.runs.find((r) => r.id === 'r1')!
    assert.deepEqual(r1.waits, [{ from: at(DAY, 9) + 600, to: at(DAY, 9) + 1200, kind: 'approval' }])
    const r3 = body.runs.find((r) => r.id === 'r3')!
    assert.deepEqual(r3.waits, [{ from: at(DAY, 12) + 300, to: at(nextDay(DAY), 8), kind: 'auth' }])
    assert.equal(body.runs.find((r) => r.id === 'r2')!.waits.length, 0)
  })

  test('GET /runs caps at 500 and reports truncated', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const task = addTask(env.db, { type: 'research' })
    env.db.exec('BEGIN')
    for (let i = 0; i < 501; i += 1) insertRun(env.db, { id: `c${i}`, task_id: task.id, session_id: null, started_at: at(DAY, 0) + i })
    env.db.exec('COMMIT')
    const body = await (await get(app, `/runs?from=${DAY}&to=${DAY}`)).json() as { runs: unknown[]; truncated: boolean }
    assert.equal(body.runs.length, 500)
    assert.equal(body.truncated, true)
  })

  test('GET /tasks and GET /proposals reject unknown status values', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    assert.equal((await get(app, '/tasks?status=ready')).status, 200)
    assert.equal((await get(app, "/tasks?status=x'%20OR%201=1")).status, 400)
    assert.equal((await get(app, '/proposals?status=bogus')).status, 400)
    assert.equal((await get(app, '/proposals?status=pending')).status, 200)
  })

  test('GET /runs rejects unknown filter values', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    assert.equal((await get(app, '/runs?type=nope')).status, 400)
    assert.equal((await get(app, '/runs?outcome=nope')).status, 400)
    assert.equal((await get(app, `/runs?lock_key=${'a'.repeat(101)}`)).status, 400)
  })

  test('GET /stats/daily counts done and respects type, lock_key and outcome filters', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    seed()
    const day = async (query: string) => (await (await get(app, `/stats/daily?from=${DAY}&to=${DAY}${query}`)).json() as {
      runs: number; done: number; critical: number }[])[0]
    const all = await day('')
    // Runs are counted on the day they started: r1, r3, r5. r2 started the day before.
    assert.equal(all.runs, 3)
    assert.equal(all.done, 1)
    assert.equal(all.critical, 1)
    assert.equal((await day('&type=code')).runs, 2)
    assert.equal((await day('&outcome=done')).runs, 1)
    const acctB = await day('&lock_key=acct-b')
    assert.equal(acctB.runs, 1)
    assert.equal(acctB.critical, 0)
    assert.equal((await get(app, `/stats/daily?from=${DAY}&to=${DAY}&outcome=bogus`)).status, 400)
  })

  test('GET /graph nodes carry last_outcome and stale_count', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const { code, research } = seed()
    const graph = await (await get(app, '/graph')).json() as { tasks: { id: string; last_outcome: string | null; stale_count: number }[] }
    const byId = new Map(graph.tasks.map((t) => [t.id, t]))
    assert.equal(byId.get(code.id)!.stale_count, 1)
    assert.equal(byId.get(code.id)!.last_outcome, null)
    assert.equal(byId.get(research.id)!.last_outcome, 'done')
    assert.equal(byId.get(research.id)!.stale_count, 0)
  })

  test('GET /alerts and GET /search rows carry task_title with the 60-character fallback', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const { code, research } = seed()
    const alerts = await (await get(app, '/alerts')).json() as { task_id: string; task_title: string }[]
    assert.equal(alerts.find((a) => a.task_id === code.id)!.task_title, 'x'.repeat(60))
    env.db.prepare(`INSERT INTO alerts (task_id, run_id, severity, kind, message, created_at) VALUES (?, NULL, 'high', 'failed', 'm', ?)`)
      .run(research.id, at(DAY, 1))
    const titled = await (await get(app, '/alerts')).json() as { task_id: string; task_title: string }[]
    assert.equal(titled.find((a) => a.task_id === research.id)!.task_title, 'Titled')
    const hits = await (await get(app, '/search?q=summary')).json() as { task_id: string; task_title: string }[]
    assert.ok(hits.length > 0)
    assert.equal(hits.find((h) => h.task_id === code.id)!.task_title, 'x'.repeat(60))
    assert.equal(hits.find((h) => h.task_id === research.id)!.task_title, 'Titled')
  })

  test('GET /lock-keys lists distinct non-null keys in order', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    addTask(env.db, { lock_key: 'zeta' })
    addTask(env.db, { lock_key: 'alpha' })
    addTask(env.db, { lock_key: 'alpha' })
    addTask(env.db, { lock_key: null })
    assert.deepEqual(await (await get(app, '/lock-keys')).json(), ['alpha', 'zeta'])
  })

  test('an impossible calendar date is 400 for daily stats and for runs', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    assert.equal((await get(app, '/stats/daily?from=2026-13-40')).status, 400)
    assert.equal((await get(app, `/stats/daily?from=${DAY}&to=2026-02-30`)).status, 400)
    assert.equal((await get(app, '/runs?from=2026-02-30')).status, 400)
  })

  test('run rows carry task_title with the same fallback as the other endpoints', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const titled = addTask(env.db, { data: { intent: 'intent text', title: 'Named task' } })
    const untitled = addTask(env.db, { data: { intent: 'x'.repeat(80) } })
    insertRun(env.db, { id: 'run-titled', task_id: titled.id, session_id: null, started_at: at(DAY, 9) })
    insertRun(env.db, { id: 'run-untitled', task_id: untitled.id, session_id: null, started_at: at(DAY, 10) })
    const body = await (await get(app, '/runs')).json() as { runs: { id: string; task_title: string; title?: unknown }[] }
    const titles = Object.fromEntries(body.runs.map((run) => [run.id, run.task_title]))
    assert.equal(titles['run-titled'], 'Named task')
    assert.equal(titles['run-untitled'], 'x'.repeat(60))
  })
})
