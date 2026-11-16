import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { createRunner } from '../src/runner/runner.ts'
import { prepareRun, OperatorError } from '../src/db/operator.ts'
import { getTask } from '../src/db/tasks.ts'
import { pauseQueue } from '../src/db/meta.ts'
import { createWakeSignal } from '../src/wake.ts'
import type { TaskStatus } from '../src/types.ts'
import { addTask, fakeWorker, result, setup, sleep, statusOf, TOKEN, waitFor, type TestEnv } from './helpers.ts'

const headers = (env: TestEnv) => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' })

describe('wake signal', () => {
  test('wait returns on notify long before its timeout, and on abort', async () => {
    const signal = createWakeSignal()
    const started = Date.now()
    const waiting = signal.wait(60_000)
    signal.notify()
    await waiting
    const aborted = new AbortController()
    const second = signal.wait(60_000, aborted.signal)
    aborted.abort()
    await second
    assert.ok(Date.now() - started < 1000)
  })
})

describe('run now', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const withSession = (status: TaskStatus) => {
    const task = addTask(env.db, { status })
    env.db.prepare('UPDATE tasks SET session_id = ? WHERE id = ?').run('sess-old', task.id)
    return task.id
  }

  test('draft, ready and needs_auth become ready and keep the session; failed, review and done start a new one', () => {
    for (const status of ['draft', 'ready', 'needs_auth'] as TaskStatus[]) {
      const task = prepareRun(env.db, withSession(status))
      assert.equal(task.status, 'ready')
      assert.equal(task.session_id, 'sess-old', status)
    }
    for (const status of ['failed', 'review', 'done'] as TaskStatus[]) {
      const task = prepareRun(env.db, withSession(status))
      assert.equal(task.status, 'ready')
      assert.equal(task.session_id, null, status)
    }
  })

  test('a running task, a paused queue and an unfinished dependency are refused without a change', () => {
    const running = addTask(env.db, { status: 'running' })
    assert.throws(() => prepareRun(env.db, running.id), OperatorError)
    const first = addTask(env.db, { status: 'draft' })
    const second = addTask(env.db, { status: 'draft', deps: [{ depends_on: first.id, kind: 'blocks' }] })
    assert.throws(() => prepareRun(env.db, second.id), /dependency/)
    assert.equal(statusOf(env.db, second.id), 'draft')
    pauseQueue(env.db, 'paused by user', 'user')
    assert.throws(() => prepareRun(env.db, first.id), /paused/)
    assert.equal(statusOf(env.db, first.id), 'draft')
  })

  test('POST /tasks/:id/run readies the task and asks the runner; a running task is 409', async () => {
    const asked: string[] = []
    const app = createApp({ db: env.db, config: env.config, control: { runNow: (id) => asked.push(id) } }, TOKEN)
    const draft = addTask(env.db, { status: 'draft' })
    const res = await app.request(`/api/tasks/${draft.id}/run`, { method: 'POST', headers: headers(env) })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).status, 'ready')
    assert.deepEqual(asked, [draft.id])
    const running = addTask(env.db, { status: 'running' })
    assert.equal((await app.request(`/api/tasks/${running.id}/run`, { method: 'POST', headers: headers(env) })).status, 409)
  })

  test('the runner claims a run-now task before a higher-priority ready task', async () => {
    const config = { ...env.config, maxConcurrent: 1, pollSec: 60 }
    const order: string[] = []
    let release = () => {}
    const worker = fakeWorker(async (ctx) => {
      order.push(ctx.task.id)
      await new Promise<void>((resolve) => { release = resolve })
      return result('done')
    })
    const urgent = addTask(env.db, { status: 'draft', priority: 0 })
    addTask(env.db, { status: 'ready', priority: 90 })
    addTask(env.db, { status: 'ready', priority: 80 })
    const runner = createRunner({ db: env.db, config, worker })
    try {
      await runner.start()
      await waitFor(() => order.length === 1)
      prepareRun(env.db, urgent.id)
      runner.runNow(urgent.id)
      release()
      await waitFor(() => order.length === 2)
      assert.equal(order[1], urgent.id)
      release()
    } finally {
      release()
      await runner.stop()
    }
  })

  test('with pollSec at 60 a task made ready through the API is claimed at once', async () => {
    const config = { ...env.config, pollSec: 60 }
    const runner = createRunner({ db: env.db, config, worker: fakeWorker(() => result('done')) })
    try {
      await runner.start()
      await sleep(20)
      const app = createApp({ db: env.db, config, control: runner }, TOKEN)
      const draft = addTask(env.db, { status: 'draft', type: 'code', data: { intent: 'x', repo: '/tmp/x' } })
      const res = await app.request(`/api/tasks/${draft.id}/run`, { method: 'POST', headers: headers(env) })
      assert.equal(res.status, 200)
      await waitFor(() => getTask(env.db, draft.id)!.status === 'done', 2000)
    } finally {
      await runner.stop()
    }
  })
})
