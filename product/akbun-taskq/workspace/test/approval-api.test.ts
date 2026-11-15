import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { ApprovalError, approvalDecision, decideApproval, insertApproval, openApproval } from '../src/db/approvals.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { endRun, insertRun } from '../src/db/runs.ts'
import { setStatus } from '../src/db/tasks.ts'
import { listEvents } from '../src/db/events.ts'
import { recoverStale } from '../src/runner/recover.ts'
import { addTask, fakeWorker, result, setup, stopRunners, startRunner, statusOf, waitFor, TOKEN, type TestEnv } from './helpers.ts'

// Longer than 500 characters, so the stored event copy is clipped while the pending input must stay whole.
const EXACT = 'aws s3 ls # -----BEGIN PRIVATE KEY----- ; aws iam delete-user x ' + 'y'.repeat(600)

describe('approval shows exactly what runs', () => {
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
  const post = (path: string, body: unknown) => app().request(`/api${path}`, {
    method: 'POST', headers: headers(), body: JSON.stringify(body),
  })

  // Starts a task that asks for approval of each command in turn. Answers are collected in `answers`.
  async function askFor(commands: unknown[], answers: boolean[] = []) {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'run commands' } })
    const runner = startRunner({
      db, config, worker: fakeWorker(async (ctx) => {
        for (const input of commands) answers.push(await ctx.requestApproval({ tool: 'Bash', input }))
        return result('done', 'ok')
      }),
    })
    await runner.start()
    return { task, runner }
  }

  test('[critical] the pending input is the exact text, unmasked, and the event and alert carry only the masked copy', async () => {
    const { db } = env
    const { task } = await askFor([{ command: EXACT }])
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    const detail = await (await app().request(`/api/tasks/${task.id}`, { headers: headers() })).json() as {
      pending_approval: { request_id: string; tool: string; input: { command: string }; bytes: number }
    }
    assert.equal(detail.pending_approval.tool, 'Bash')
    assert.equal(detail.pending_approval.input.command, EXACT)
    assert.equal(detail.pending_approval.bytes, Buffer.byteLength(JSON.stringify({ command: EXACT })))

    const event = listEvents(db, { task_id: task.id, limit: 100 }).find((e) => e.kind === 'permission_request')!
    assert.ok(!event.payload.includes('delete-user'), event.payload)
    const alert = listAlerts(db, false).find((a) => a.kind === 'approval_required')!
    assert.equal(alert.ref, detail.pending_approval.request_id)
    assert.equal(alert.message, 'Approval needed: Bash: aws s3 ls # [REDACTED:private-key]')
  })

  test('[critical] a decision must name the open request: other ids get 409, a missing id 400, and a second click 409', async () => {
    const { db } = env
    const { task, runner } = await askFor([{ command: 'echo one' }])
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    const open = openApproval(db, task.id)!.request_id

    assert.equal((await post(`/tasks/${task.id}/approve`, {})).status, 400)
    assert.equal((await post(`/tasks/${task.id}/deny`, { request_id: 'stale-card' })).status, 409)
    assert.equal(statusOf(db, task.id), 'needs_approval')

    assert.equal((await post(`/tasks/${task.id}/approve`, { request_id: open })).status, 200)
    assert.equal((await post(`/tasks/${task.id}/approve`, { request_id: open })).status, 409)
    await waitFor(() => statusOf(db, task.id) === 'done')
    await runner.stop()

    const row = db.prepare('SELECT decision, input FROM approvals WHERE request_id = ?').get(open)!
    assert.equal(row.decision, 'approved')
    assert.equal(row.input, null, 'the unmasked input is removed once decided')
    assert.equal(listAlerts(db, false).some((a) => a.kind === 'approval_required' && a.acked_at === null), false)
  })

  test('a stale card for an earlier command cannot answer a later one', async () => {
    const { db } = env
    const answers: boolean[] = []
    const { task, runner } = await askFor([{ command: 'echo first' }, { command: 'echo second' }], answers)
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    const first = openApproval(db, task.id)!.request_id
    assert.equal((await post(`/tasks/${task.id}/approve`, { request_id: first })).status, 200)
    await waitFor(() => openApproval(db, task.id) !== null)
    const second = openApproval(db, task.id)!.request_id
    assert.notEqual(second, first)

    assert.equal((await post(`/tasks/${task.id}/deny`, { request_id: first })).status, 409)
    assert.equal(approvalDecision(db, second), null)
    assert.equal((await post(`/tasks/${task.id}/deny`, { request_id: second })).status, 200)
    await waitFor(() => answers.length === 2)
    await runner.stop()
    assert.deepEqual(answers, [true, false])
  })

  test('GET /api/approvals lists open requests with their task title', async () => {
    const { db } = env
    const { task, runner } = await askFor([{ command: 'echo listed' }])
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    const res = await app().request('/api/approvals', { headers: headers() })
    const rows = await res.json() as { task_id: string; task_title: string; request_id: string; tool: string; input: unknown }[]
    assert.equal(rows.length, 1)
    assert.equal(rows[0].task_id, task.id)
    assert.equal(rows[0].task_title, 'run commands')
    assert.equal(rows[0].request_id, openApproval(db, task.id)!.request_id)
    assert.deepEqual(rows[0].input, { command: 'echo listed' })
    await runner.stop()
  })

  test('decideApproval throws ApprovalError when nothing is open', () => {
    const { db } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'idle' } })
    assert.throws(() => decideApproval(db, task.id, 'anything', true), ApprovalError)
  })

  test('a run that ends and a recovered task both expire their open requests and drop the input', () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'expire me' } })
    insertRun(db, { id: 'run-a', task_id: task.id, session_id: null, started_at: 1 })
    insertApproval(db, { request_id: 'req-a', task_id: task.id, run_id: 'run-a', tool: 'Bash', input: '{"command":"x"}', created_at: 1 })
    endRun(db, { id: 'run-a', task_id: task.id, intent: 'expire me', outcome: 'failed', summary: null, stats: {}, ended_at: 2 })
    assert.equal(approvalDecision(db, 'req-a'), 'expired')
    assert.equal((db.prepare('SELECT input FROM approvals WHERE request_id = ?').get('req-a') as { input: unknown }).input, null)

    insertRun(db, { id: 'run-b', task_id: task.id, session_id: null, started_at: 3 })
    insertApproval(db, { request_id: 'req-b', task_id: task.id, run_id: 'run-b', tool: 'Bash', input: '{"command":"y"}', created_at: 3 })
    setStatus(db, task.id, 'needs_approval')
    db.prepare('UPDATE tasks SET heartbeat_at = 1, claimed_by = ? WHERE id = ?').run('gone', task.id)
    recoverStale(db, config, true, new Set())
    assert.equal(approvalDecision(db, 'req-b'), 'expired')
    assert.equal(openApproval(db, task.id), null)
  })
})
