import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRunner } from '../src/runner/runner.ts'
import { claimTask, getTask, listTasks, moveStatus, setStatus } from '../src/db/tasks.ts'
import { insertRun, endRun } from '../src/db/runs.ts'
import { decideApproval, openApproval } from '../src/db/approvals.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { listEvents } from '../src/db/events.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import type { Db } from '../src/db/open.ts'
import { addTask, fakeWorker, result, setup, sleep, statusOf, waitFor, type TestEnv } from './helpers.ts'

// Makes a task look like the process died while it was running.
function plantStaleRun(db: Db, taskId: string, sessionId: string): void {
  db.prepare(`UPDATE tasks SET status = 'running', claimed_by = 'dead-runner', heartbeat_at = ?, session_id = ? WHERE id = ?`)
    .run(nowSec() - 1000, sessionId, taskId)
  insertRun(db, { id: newId(), task_id: taskId, session_id: sessionId, started_at: nowSec() - 1000 })
}

describe('runner', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  test('three ready tasks run concurrently and record runs and events', async () => {
    const { db, config } = env
    let active = 0
    let maxActive = 0
    const worker = fakeWorker(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await sleep(150)
      active -= 1
      return result('done', 'ok')
    })
    const ids = [1, 2, 3].map((i) => addTask(db, { data: { intent: `task ${i}` } }).id)
    const runner = createRunner({ db, config, worker })
    await runner.start()
    await waitFor(() => ids.every((id) => statusOf(db, id) === 'review'))
    await runner.stop()
    assert.equal(maxActive, 3)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM runs').get()?.n, 3)
    assert.equal(listEvents(db, { limit: 100 }).filter((e) => e.kind === 'claimed').length, 3)
  })

  test('a stale running task is re-run with the stored session id', async () => {
    const { db, config } = env
    const task = addTask(db)
    plantStaleRun(db, task.id, 'sess-1')
    const resumed: (string | null)[] = []
    const runner = createRunner({
      db, config, worker: fakeWorker((ctx) => {
        resumed.push(ctx.resumeSessionId)
        return result('done', 'ok')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    assert.deepEqual(resumed, ['sess-1'])
    const outcomes = db.prepare('SELECT outcome FROM runs WHERE task_id = ? ORDER BY started_at').all(task.id)
    assert.equal(outcomes[0].outcome, 'stale')
    assert.equal(listAlerts(db, true).filter((a) => a.kind === 'stale_repeat').length, 0)
  })

  test('a second stale run raises stale_repeat', async () => {
    const { db, config } = env
    const task = addTask(db)
    const earlier = newId()
    insertRun(db, { id: earlier, task_id: task.id, session_id: null, started_at: nowSec() - 2000 })
    endRun(db, { id: earlier, task_id: task.id, intent: 'test task', outcome: 'stale', summary: null, stats: {}, ended_at: nowSec() - 1500 })
    plantStaleRun(db, task.id, 'sess-2')
    const runner = createRunner({ db, config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    assert.equal(listAlerts(db, true).filter((a) => a.kind === 'stale_repeat').length, 1)
  })

  test('[critical] a task can be claimed only once', () => {
    const { db } = env
    const task = addTask(db)
    assert.equal(claimTask(db, task.id, 'runner-a'), true)
    assert.equal(claimTask(db, task.id, 'runner-b'), false)
    assert.equal(getTask(db, task.id)!.claimed_by, 'runner-a')
  })

  test('[critical] tasks sharing a lock_key never overlap', async () => {
    const { db, config } = env
    let active = 0
    let maxActive = 0
    const worker = fakeWorker(async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await sleep(100)
      active -= 1
      return result('done', 'ok')
    })
    const a = addTask(db, { lock_key: 'repo-a', data: { intent: 'a' } })
    const b = addTask(db, { lock_key: 'repo-a', data: { intent: 'b' } })
    const runner = createRunner({ db, config, worker })
    await runner.start()
    await waitFor(() => statusOf(db, a.id) === 'review' && statusOf(db, b.id) === 'review')
    await runner.stop()
    assert.equal(maxActive, 1)
  })

  test('needs_auth blocks its lock_key until the task is resumed', async () => {
    const { db, config } = env
    const a = addTask(db, { type: 'ops_read', lock_key: 'account-x', data: { intent: 'a' } })
    const b = addTask(db, { type: 'ops_read', lock_key: 'account-x', data: { intent: 'b' } })
    let aCalls = 0
    const started: string[] = []
    const worker = fakeWorker((ctx) => {
      started.push(ctx.task.id)
      if (ctx.task.id === a.id) {
        aCalls += 1
        return aCalls === 1 ? result('needs_auth', 'login expired', { auth_scope: 'target' }) : result('done', 'ok')
      }
      return result('done', 'ok')
    })
    const runner = createRunner({ db, config, worker })
    await runner.start()
    await waitFor(() => statusOf(db, a.id) === 'needs_auth')
    await sleep(150)
    assert.equal(statusOf(db, b.id), 'ready')
    assert.ok(!started.includes(b.id))
    assert.equal(moveStatus(db, a.id, 'needs_auth', 'ready'), true)
    await waitFor(() => statusOf(db, b.id) === 'done')
    await runner.stop()
    assert.equal(statusOf(db, a.id), 'done')
    assert.equal(started.at(-1), b.id)
  })

  for (const decision of [true, false]) {
    test(`approval resolves ${decision ? 'true' : 'false'} after decideApproval`, async () => {
      const { db, config } = env
      const task = addTask(db, { type: 'ops_change', data: { intent: 'change' } })
      let answer: boolean | undefined
      const worker = fakeWorker(async (ctx) => {
        answer = await ctx.requestApproval({ tool: 'Bash', input: { command: 'echo hi' } })
        return result(answer ? 'done' : 'failed', 'finished')
      })
      const runner = createRunner({ db, config, worker })
      await runner.start()
      await waitFor(() => statusOf(db, task.id) === 'needs_approval')
      const alert = listAlerts(db, false).find((a) => a.kind === 'approval_required')
      assert.equal(alert?.severity, 'critical')
      decideApproval(db, task.id, openApproval(db, task.id)!.request_id, decision)
      await waitFor(() => answer !== undefined)
      await runner.stop()
      assert.equal(answer, decision)
    })
  }

  test('a task with an unfinished blocks dependency is not claimed', async () => {
    const { db, config } = env
    const blocker = addTask(db, { status: 'draft', data: { intent: 'blocker' } })
    const blocked = addTask(db, { data: { intent: 'blocked' }, deps: [{ depends_on: blocker.id, kind: 'blocks' }] })
    let calls = 0
    const runner = createRunner({ db, config, worker: fakeWorker(() => { calls += 1; return result('done', 'ok') }) })
    await runner.start()
    await sleep(200)
    assert.equal(statusOf(db, blocked.id), 'ready')
    assert.equal(calls, 0)
    assert.equal(listTasks(db, 'ready').find((t) => t.id === blocked.id)?.blocked, true)
    setStatus(db, blocker.id, 'done')
    await waitFor(() => statusOf(db, blocked.id) === 'review')
    await runner.stop()
    assert.equal(calls, 1)
  })
})
