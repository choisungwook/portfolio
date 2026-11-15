import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { approvalDecision, insertApproval, openApproval } from '../src/db/approvals.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { requestCancelMarker } from '../src/db/meta.ts'
import { insertRun } from '../src/db/runs.ts'
import { listEvents } from '../src/db/events.ts'
import { setStatus } from '../src/db/tasks.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import type { Db } from '../src/db/open.ts'
import { addTask, fakeWorker, result, setup, sleep, startRunner, statusOf, stopRunners, TOKEN, waitFor, type TestEnv } from './helpers.ts'

// Makes a task look like a runner died while it ran: stale heartbeat, one open run.
function plantDeadRun(db: Db, taskId: string): void {
  db.prepare(`UPDATE tasks SET status = 'running', claimed_by = 'dead-runner', heartbeat_at = ? WHERE id = ?`).run(nowSec() - 1000, taskId)
  insertRun(db, { id: newId(), task_id: taskId, session_id: 'sess-dead', started_at: nowSec() - 1000 })
}

describe('cancel', () => {
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
  const cancel = (id: string) => app().request(`/api/tasks/${id}/cancel`, { method: 'POST', headers: headers(), body: '{}' })

  test('[critical] a cancelled task is not re-run by stale recovery', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'cancel me' } })
    plantDeadRun(db, task.id)
    requestCancelMarker(db, task.id)
    let calls = 0
    const runner = startRunner({ db, config, worker: fakeWorker(() => { calls += 1; return result('done', 'ok') }) })
    await runner.start()
    await sleep(100)
    await runner.stop()

    assert.equal(calls, 0)
    assert.equal(statusOf(db, task.id), 'failed')
    const run = db.prepare('SELECT outcome, summary FROM runs WHERE task_id = ?').get(task.id)!
    assert.equal(run.outcome, 'failed')
    assert.equal(run.summary, 'cancelled by user')
    assert.equal(listAlerts(db, true).filter((a) => a.task_id === task.id).length, 0, 'the user did it: no failed alert')
  })

  test('cancelling a running task stops the worker, closes the run as cancelled and raises no failed alert', async () => {
    const { db, config } = env
    const task = addTask(db, { data: { intent: 'long run' } })
    let calls = 0
    const runner = startRunner({
      db, config, worker: fakeWorker((ctx) => {
        calls += 1
        return new Promise((resolve) => ctx.signal.addEventListener('abort', () => resolve(result('failed', 'aborted'))))
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'running')

    const res = await cancel(task.id)
    assert.equal(res.status, 200)
    await waitFor(() => statusOf(db, task.id) === 'failed')
    await sleep(60)
    assert.equal(calls, 1)
    const run = db.prepare('SELECT outcome, summary FROM runs WHERE task_id = ?').get(task.id)!
    assert.equal(run.outcome, 'failed')
    assert.equal(run.summary, 'cancelled by user')
    assert.equal(listAlerts(db, true).filter((a) => a.task_id === task.id).length, 0)
    const kinds = listEvents(db, { task_id: task.id, limit: 100 })
    assert.ok(kinds.some((e) => e.kind === 'cancel_requested'))
    assert.ok(kinds.some((e) => e.kind === 'finished' && e.payload.includes('"cancelled":true')))
  })

  test('cancelling a needs_approval task expires its open request and drops the input', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'ask first' } })
    const runner = startRunner({
      db, config, worker: fakeWorker(async (ctx) => {
        await ctx.requestApproval({ tool: 'Bash', input: { command: 'echo waiting' } })
        return result('done', 'ok')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    const request = openApproval(db, task.id)!.request_id

    assert.equal((await cancel(task.id)).status, 200)
    await waitFor(() => statusOf(db, task.id) === 'failed')
    assert.equal(approvalDecision(db, request), 'expired')
    assert.equal((db.prepare('SELECT input FROM approvals WHERE request_id = ?').get(request) as { input: unknown }).input, null)
  })

  test('a needs_auth task has no live runner, so cancel ends it at once; a done task is 409', async () => {
    const { db } = env
    const waiting = addTask(db, { type: 'ops_read', data: { intent: 'login first' } })
    setStatus(db, waiting.id, 'needs_auth')
    assert.equal((await cancel(waiting.id)).status, 200)
    assert.equal(statusOf(db, waiting.id), 'failed')
    assert.equal(listAlerts(db, true).filter((a) => a.task_id === waiting.id).length, 0)

    const done = addTask(db, { data: { intent: 'finished' } })
    setStatus(db, done.id, 'done')
    assert.equal((await cancel(done.id)).status, 409)
    assert.equal(statusOf(db, done.id), 'done')
    assert.equal((await cancel('0'.repeat(8))).status, 404)
  })

  test('a stale running task with an open approval closes at once and its approval expires', async () => {
    const { db } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'stale approval' } })
    plantDeadRun(db, task.id)
    const runId = db.prepare('SELECT id FROM runs WHERE task_id = ?').get(task.id)!.id as string
    insertApproval(db, { request_id: 'req-stale', task_id: task.id, run_id: runId, tool: 'Bash', input: '{"command":"x"}', created_at: nowSec() })
    const res = await cancel(task.id)
    assert.equal(res.status, 200)
    assert.equal(statusOf(db, task.id), 'failed')
    assert.equal(approvalDecision(db, 'req-stale'), 'expired')
  })
})
