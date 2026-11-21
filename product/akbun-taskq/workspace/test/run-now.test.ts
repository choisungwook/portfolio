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

  test('a notify that came while nobody waited is not lost when the waiter passes the generation it read', async () => {
    const signal = createWakeSignal()
    const seen = signal.version()
    signal.notify()
    const started = Date.now()
    await signal.wait(60_000, undefined, seen)
    assert.ok(Date.now() - started < 100)
  })
})

describe('run now', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const withSession = (status: TaskStatus) => {
    const task = addTask(env.db, { owner: 'coder', status })
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

  test('a task with no agent (owner) is refused without a change', () => {
    const task = addTask(env.db, { status: 'draft' })
    assert.throws(() => prepareRun(env.db, task.id), /no agent/)
    assert.equal(statusOf(env.db, task.id), 'draft')
  })

  test('PATCH refuses to edit title or intent while running and allows it once the task failed', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const task = addTask(env.db, { owner: 'coder', status: 'running' })
    const edit = () => app.request(`/api/tasks/${task.id}`, { method: 'PATCH', headers: headers(env), body: JSON.stringify({ intent: 'new' }) })
    assert.equal((await edit()).status, 409)
    env.db.prepare("UPDATE tasks SET status = 'failed' WHERE id = ?").run(task.id)
    assert.equal((await edit()).status, 200)
    assert.equal(getTask(env.db, task.id)!.data.intent, 'new')
  })

  test('PATCH changes only the fields it names, and an empty title removes the title', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const task = addTask(env.db, { data: { intent: 'do it', title: 'Keep me', cautions: 'careful' } })
    const patch = (body: object) => app.request(`/api/tasks/${task.id}`, { method: 'PATCH', headers: headers(env), body: JSON.stringify(body) })
    assert.equal((await patch({ priority: 5 })).status, 200)
    assert.deepEqual([getTask(env.db, task.id)!.data.title, getTask(env.db, task.id)!.data.cautions], ['Keep me', 'careful'])
    assert.equal((await patch({ title: '' })).status, 200)
    assert.equal(getTask(env.db, task.id)!.data.title, undefined)
    assert.equal(getTask(env.db, task.id)!.data.cautions, 'careful')
  })

  test('a running task, a paused queue and an unfinished dependency are refused without a change', () => {
    const running = addTask(env.db, { owner: 'coder', status: 'running' })
    assert.throws(() => prepareRun(env.db, running.id), OperatorError)
    const first = addTask(env.db, { owner: 'coder', status: 'draft' })
    const second = addTask(env.db, { owner: 'coder', status: 'draft', deps: [{ depends_on: first.id, kind: 'blocks' }] })
    assert.throws(() => prepareRun(env.db, second.id), /dependency/)
    assert.equal(statusOf(env.db, second.id), 'draft')
    pauseQueue(env.db, 'paused by user', 'user')
    assert.throws(() => prepareRun(env.db, first.id), /paused/)
    assert.equal(statusOf(env.db, first.id), 'draft')
  })

  test('POST /tasks/:id/run readies the task and asks the runner; a running task is 409', async () => {
    const asked: string[] = []
    const app = createApp({ db: env.db, config: env.config, control: { runNow: (id) => asked.push(id) } }, TOKEN)
    const draft = addTask(env.db, { owner: 'coder', status: 'draft' })
    const res = await app.request(`/api/tasks/${draft.id}/run`, { method: 'POST', headers: headers(env) })
    assert.equal(res.status, 200)
    assert.equal((await res.json()).status, 'ready')
    assert.deepEqual(asked, [draft.id])
    const running = addTask(env.db, { owner: 'coder', status: 'running' })
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
    const urgent = addTask(env.db, { owner: 'coder', status: 'draft', priority: 0 })
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

  test('a run-now request whose task waits for a dependency again is dropped, not claimed', async () => {
    const config = { ...env.config, maxConcurrent: 1, pollSec: 60 }
    const ran: string[] = []
    let release = () => {}
    const worker = fakeWorker(async (ctx) => {
      ran.push(ctx.task.id)
      await new Promise<void>((resolve) => { release = resolve })
      return result('done')
    })
    const parent = addTask(env.db, { status: 'done', type: 'code', data: { intent: 'parent', repo: '/tmp/x' } })
    const child = addTask(env.db, { owner: 'coder', status: 'draft', deps: [{ depends_on: parent.id, kind: 'blocks' }] })
    const busy = addTask(env.db, { status: 'ready', priority: 90 })
    const runner = createRunner({ db: env.db, config, worker })
    try {
      await runner.start()
      await waitFor(() => ran.length === 1)
      prepareRun(env.db, child.id)
      runner.runNow(child.id)
      env.db.prepare("UPDATE tasks SET status = 'draft' WHERE id = ?").run(parent.id)
      release()
      await waitFor(() => statusOf(env.db, busy.id) !== 'running')
      await sleep(100)
      assert.deepEqual(ran, [busy.id])
      assert.equal(statusOf(env.db, child.id), 'ready')
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
      const draft = addTask(env.db, { owner: 'coder', status: 'draft', type: 'code', data: { intent: 'x', repo: '/tmp/x' } })
      const res = await app.request(`/api/tasks/${draft.id}/run`, { method: 'POST', headers: headers(env) })
      assert.equal(res.status, 200)
      await waitFor(() => getTask(env.db, draft.id)!.status === 'done', 2000)
    } finally {
      await runner.stop()
    }
  })
})
