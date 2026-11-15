import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { getMeta, isQueuePaused, pauseBy, pauseQueue, resumeQueue } from '../src/db/meta.ts'
import { addTask, fakeWorker, result, setup, sleep, startRunner, statusOf, stopRunners, TOKEN, waitFor, type TestEnv } from './helpers.ts'

describe('queue pause', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  const headers = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' })
  const app = () => createApp({ db: env.db, config: env.config }, TOKEN)

  test('[critical] a paused queue claims nothing, and a task already running continues', async () => {
    const { db, config } = env
    const first = addTask(db, { data: { intent: 'first' } })
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const runner = startRunner({
      db, config, worker: fakeWorker(async () => {
        calls += 1
        await gate
        return result('done', 'ok')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, first.id) === 'running')

    const paused = await app().request('/api/queue/pause', {
      method: 'POST', headers: headers(), body: JSON.stringify({ reason: 'maintenance window' }),
    })
    assert.equal(paused.status, 200)
    const second = addTask(db, { data: { intent: 'second' } })
    await sleep(100)
    assert.equal(statusOf(db, second.id), 'ready')
    assert.equal(calls, 1)

    release()
    await waitFor(() => statusOf(db, first.id) === 'review')
    await sleep(60)
    assert.equal(statusOf(db, second.id), 'ready')

    resumeQueue(db)
    await waitFor(() => statusOf(db, second.id) === 'review')
  })

  test('POST /api/queue/pause keeps the reason and who paused; a bad reason is 400, an empty body is the default', async () => {
    const { db } = env
    assert.equal((await app().request('/api/queue/pause', { method: 'POST', headers: headers(), body: JSON.stringify({ reason: 42 }) })).status, 400)
    assert.equal(isQueuePaused(db), false)

    await app().request('/api/queue/pause', { method: 'POST', headers: headers(), body: '' })
    const queue = await (await app().request('/api/queue', { headers: headers() })).json() as { paused: boolean; reason: string; pause_by: string }
    assert.deepEqual(queue, { paused: true, reason: 'paused by user', pause_by: 'user', max_concurrent: env.config.maxConcurrent })

    await app().request('/api/queue/pause', { method: 'POST', headers: headers(), body: JSON.stringify({ reason: 'deploy' }) })
    assert.equal(getMeta(db, 'pause_reason'), 'deploy')
    await app().request('/api/queue/resume', { method: 'POST', headers: headers(), body: '{}' })
    assert.equal(isQueuePaused(db), false)
  })

  test('a user pause survives a passing preflight', async () => {
    const { db, config } = env
    pauseQueue(db, 'by hand', 'user')
    const task = addTask(db)
    const runner = startRunner({
      db, config, worker: fakeWorker(() => result('done', 'ok')), preflight: async () => ({ ok: true }), authRecheckMs: 10,
    })
    await runner.start()
    await sleep(100)
    assert.equal(isQueuePaused(db), true)
    assert.equal(pauseBy(db), 'user')
    assert.equal(statusOf(db, task.id), 'ready')
  })

  test('a preflight pause is lifted by the next passing preflight', async () => {
    const { db, config } = env
    let authOk = false
    const task = addTask(db)
    const runner = startRunner({
      db, config, worker: fakeWorker(() => result('done', 'ok')),
      preflight: async () => (authOk ? { ok: true } : { ok: false, reason: 'login expired' }), authRecheckMs: 10,
    })
    await runner.start()
    await waitFor(() => isQueuePaused(db))
    assert.equal(pauseBy(db), 'preflight')
    assert.equal(getMeta(db, 'pause_reason'), 'login expired')

    authOk = true
    await waitFor(() => statusOf(db, task.id) === 'review')
    assert.equal(isQueuePaused(db), false)
  })
})
