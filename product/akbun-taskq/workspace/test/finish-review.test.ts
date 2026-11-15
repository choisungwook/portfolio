import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { finishRun } from '../src/runner/finish.ts'
import { claimTask, getTask, listTasks } from '../src/db/tasks.ts'
import { insertRun } from '../src/db/runs.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { listEvents } from '../src/db/events.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import { addTask, fakeWorker, result, setup, statusOf, waitFor, type TestEnv, stopRunners, startRunner } from './helpers.ts'

describe('finish: review task and finished event', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  test('the review task gets the base_commit and repo that the worker set during the code run', async () => {
    const { db, config, home } = env
    const code = addTask(db, { type: 'code', data: { intent: 'add login', repo: home } })
    const runner = startRunner({
      db, config, worker: fakeWorker((ctx) => {
        if (ctx.task.type === 'code') {
          ctx.patchData({ base_commit: 'abc1234' })
          return result('done', 'login added')
        }
        return result('done', 'no findings')
      }),
    })
    await runner.start()
    await waitFor(() => listTasks(db).some((t) => t.type === 'security_review' && t.status === 'review'))
    await runner.stop()
    const review = listTasks(db).find((t) => t.type === 'security_review')!
    assert.equal(review.data.base_commit, 'abc1234')
    assert.equal(review.data.repo, home)
    assert.equal(review.data.review_of, code.id)
  })

  test('a critical finding does not move a code task that is not done to review, but still raises the alert', () => {
    const { db, config } = env
    const code = addTask(db, { type: 'code', status: 'ready', data: { intent: 'x' } })
    const review = addTask(db, { type: 'security_review', data: { intent: 'review', review_of: code.id } })
    assert.equal(claimTask(db, review.id, 'runner-a'), true)
    const runId = newId()
    insertRun(db, { id: runId, task_id: review.id, session_id: null, started_at: nowSec() })
    const finished = finishRun(db, config, getTask(db, review.id)!, runId, 'runner-a',
      result('done', 'secret found', { alerts: [{ severity: 'critical', message: 'hardcoded token' }] }))
    assert.equal(finished, true)
    assert.equal(statusOf(db, code.id), 'ready')
    assert.ok(listAlerts(db, false).some((a) => a.kind === 'security_finding' && a.task_id === code.id))
  })

  test('a finished run writes a finished event carrying its outcome', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'research' })
    const runner = startRunner({ db, config, worker: fakeWorker(() => result('failed', 'boom')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'failed')
    await runner.stop()
    const finished = listEvents(db, { task_id: task.id, limit: 100 }).filter((e) => e.kind === 'finished')
    assert.equal(finished.length, 1)
    assert.equal(JSON.parse(finished[0].payload).outcome, 'failed')
  })
})
