import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { insertAlert, listAlerts } from '../src/db/alerts.ts'
import { getTask, setStatus } from '../src/db/tasks.ts'
import { addTask, fakeWorker, result, setup, startRunner, statusOf, stopRunners, TOKEN, waitFor, type TestEnv } from './helpers.ts'

// A failed task as a finished run leaves it: claim cleared is not yet true, so the test sets the claim and session.
function failedTask(env: TestEnv, intent: string): string {
  const task = addTask(env.db, { data: { intent } })
  env.db.prepare(`UPDATE tasks SET status = 'failed', claimed_by = 'old-runner', heartbeat_at = 1, session_id = 'sess-old' WHERE id = ?`)
    .run(task.id)
  insertAlert(env.db, { task_id: task.id, run_id: null, severity: 'high', kind: 'failed', message: `Failed: ${intent}` })
  insertAlert(env.db, { task_id: task.id, run_id: null, severity: 'normal', kind: 'budget_exceeded', message: 'Budget exceeded' })
  return task.id
}

describe('retry', () => {
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
  const retry = (id: string, body: unknown) => app().request(`/api/tasks/${id}/retry`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  })
  const openAlerts = (id: string) => listAlerts(env.db, false).filter((a) => a.task_id === id)

  test('retry sends a failed task back to ready with a fresh start, and acknowledges its failure alerts', async () => {
    const { db, config } = env
    const id = failedTask(env, 'try again')
    const res = await retry(id, {})
    assert.equal(res.status, 200)
    const task = getTask(db, id)!
    assert.equal(task.status, 'ready')
    assert.equal(task.claimed_by, null)
    assert.equal(task.heartbeat_at, null)
    assert.equal(task.session_id, null, 'the session is cleared unless resume is asked for')
    assert.equal(openAlerts(id).length, 0)

    const seen: (string | null)[] = []
    const runner = startRunner({ db, config, worker: fakeWorker((ctx) => { seen.push(ctx.resumeSessionId); return result('done', 'ok') }) })
    await runner.start()
    await waitFor(() => statusOf(db, id) === 'review')
    await runner.stop()
    assert.deepEqual(seen, [null])
  })

  test('a retry never resumes the old session; draft puts the task back as a draft; a task that is not failed is 409', async () => {
    const { db } = env
    const fresh = failedTask(env, 'asked to resume')
    assert.equal((await retry(fresh, { resume: true })).status, 200)
    assert.equal(getTask(db, fresh)!.session_id, null, 'a task is not tied to a session: resume is ignored')

    const draft = failedTask(env, 'as draft')
    assert.equal((await retry(draft, { draft: true })).status, 200)
    assert.equal(statusOf(db, draft), 'draft')

    const done = addTask(db, { data: { intent: 'done already' } })
    setStatus(db, done.id, 'done')
    assert.equal((await retry(done.id, {})).status, 409)
    assert.equal((await retry('0'.repeat(8), {})).status, 404)
  })

  test('retry clears a pending cancel marker, so the task is not cancelled as soon as it runs again', async () => {
    const { db } = env
    const id = failedTask(env, 'marker')
    db.prepare(`INSERT INTO meta (key, value) VALUES (?, '1')`).run(`cancel:${id}`)
    assert.equal((await retry(id, {})).status, 200)
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM meta WHERE key = ?').get(`cancel:${id}`)!.n, 0)
  })
})
