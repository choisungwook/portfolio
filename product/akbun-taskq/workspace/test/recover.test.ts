import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { insertRun, endRun } from '../src/db/runs.ts'
import { listAlerts, insertAlert } from '../src/db/alerts.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import type { Db } from '../src/db/open.ts'
import { addTask, fakeWorker, result, setup, sleep, statusOf, waitFor, type TestEnv, stopRunners, startRunner } from './helpers.ts'

// Makes a task look like its process died while it was in the given status with a heartbeat from long ago.
function plantDeadRun(db: Db, taskId: string, status: 'running' | 'needs_approval'): string {
  const runId = newId()
  db.prepare('UPDATE tasks SET status = ?, claimed_by = ?, heartbeat_at = ? WHERE id = ?')
    .run(status, 'dead-runner', nowSec() - 1000, taskId)
  insertRun(db, { id: runId, task_id: taskId, session_id: 'sess-x', started_at: nowSec() - 1000 })
  return runId
}

describe('recovery', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  test('a worker result of needs_approval finishes as failed and is not claimed again', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change' })
    let calls = 0
    const runner = startRunner({
      db, config, worker: fakeWorker(() => {
        calls += 1
        return result('needs_approval', 'asking')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'failed')
    await sleep(200)
    await runner.stop()
    assert.equal(calls, 1)
    const run = db.prepare('SELECT outcome, summary FROM runs WHERE task_id = ?').get(task.id)!
    assert.equal(run.outcome, 'failed')
    assert.equal(run.summary, 'worker returned an invalid outcome')
  })

  test('[critical] a needs_approval task with no heartbeat is not reset to ready by the tick', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change' })
    const runner = startRunner({ db, config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    db.prepare(`UPDATE tasks SET status = 'needs_approval', claimed_by = NULL, heartbeat_at = NULL WHERE id = ?`).run(task.id)
    await sleep(200)
    await runner.stop()
    assert.equal(statusOf(db, task.id), 'needs_approval')
  })

  test('startup recovery of a waiting task acknowledges its open approval alerts', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change' })
    plantDeadRun(db, task.id, 'needs_approval')
    insertAlert(db, { task_id: task.id, run_id: null, severity: 'critical', kind: 'approval_required', message: 'approve?' })
    const runner = startRunner({ db, config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'done')
    await runner.stop()
    assert.equal(listAlerts(db, false).filter((a) => a.task_id === task.id && a.kind === 'approval_required').length, 0)
  })

  test('stale_repeat counts only stale runs since the last run that did not end stale', async () => {
    const { db, config } = env
    const task = addTask(db)
    const older = newId()
    insertRun(db, { id: older, task_id: task.id, session_id: null, started_at: nowSec() - 3000 })
    endRun(db, { id: older, task_id: task.id, intent: 'x', outcome: 'stale', summary: null, stats: {}, ended_at: nowSec() - 2900 })
    const done = newId()
    insertRun(db, { id: done, task_id: task.id, session_id: null, started_at: nowSec() - 2000 })
    endRun(db, { id: done, task_id: task.id, intent: 'x', outcome: 'done', summary: null, stats: {}, ended_at: nowSec() - 1900 })
    plantDeadRun(db, task.id, 'running')
    const runner = startRunner({ db, config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    assert.equal(listAlerts(db, true).filter((a) => a.kind === 'stale_repeat').length, 0)
  })
})
