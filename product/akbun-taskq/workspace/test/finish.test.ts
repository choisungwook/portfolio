import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createRunner } from '../src/runner/runner.ts'
import { listTasks } from '../src/db/tasks.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { addTask, fakeWorker, result, setup, statusOf, waitFor, type TestEnv } from './helpers.ts'

describe('finish table', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup({ prodLockKeys: ['prod-db'] })
  })
  test.afterEach(() => env.cleanup())

  test('research done goes to review with review_ready', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'research' })
    const runner = createRunner({ db, config, worker: fakeWorker(() => result('done', 'survey written')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    const kinds = listAlerts(db, false).filter((a) => a.task_id === task.id).map((a) => a.kind)
    assert.deepEqual(kinds, ['review_ready'])
  })

  test('failed run on a prod lock_key raises failed and prod_touch', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', lock_key: 'prod-db', data: { intent: 'migrate' } })
    const runner = createRunner({ db, config, worker: fakeWorker(() => result('failed', 'boom')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'failed')
    await runner.stop()
    const kinds = listAlerts(db, false).filter((a) => a.task_id === task.id).map((a) => a.kind).sort()
    assert.deepEqual(kinds, ['failed', 'prod_touch'])
  })

  test('code done creates a security review, and its critical finding sends the code task to review', async () => {
    const { db, config } = env
    const code = addTask(db, { type: 'code', data: { intent: 'add login', repo: '/tmp/example', base_commit: 'abc1234' } })
    const worker = fakeWorker((ctx) => {
      if (ctx.task.type === 'security_review') {
        return result('done', 'hardcoded token found', {
          alerts: [{ severity: 'critical', message: 'hardcoded token in login.ts' }],
        })
      }
      return result('done', 'login added')
    })
    const runner = createRunner({ db, config, worker })
    await runner.start()
    await waitFor(() => statusOf(db, code.id) === 'review')
    await runner.stop()
    const review = listTasks(db).find((t) => t.type === 'security_review')
    assert.equal(review?.data.review_of, code.id)
    const finding = listAlerts(db, false).find((a) => a.kind === 'security_finding')
    assert.equal(finding?.task_id, code.id)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM deps WHERE task_id = ? AND depends_on = ? AND kind = ?')
      .get(review!.id, code.id, 'discovered_from')?.n, 1)
  })
})
