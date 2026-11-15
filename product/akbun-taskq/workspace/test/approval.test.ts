import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { decideApproval, openApproval } from '../src/db/approvals.ts'
import { listEvents } from '../src/db/events.ts'
import { addTask, fakeWorker, result, setup, sleep, statusOf, waitFor, type TestEnv, stopRunners, startRunner } from './helpers.ts'

const permissionRequests = (env: TestEnv, taskId: string) =>
  listEvents(env.db, { task_id: taskId, limit: 100 }).filter((e) => e.kind === 'permission_request')

describe('approval', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  test('[critical] a payload with quotes, backslashes and newlines is stored as valid JSON and can be approved', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'curl it' } })
    const command = 'curl -H "token: abc123" https://x\\n{"a": "b"}\nnext line'
    let answer: boolean | undefined
    const runner = startRunner({
      db, config, worker: fakeWorker(async (ctx) => {
        answer = await ctx.requestApproval({ tool: 'Bash', input: { command } })
        return result('done', 'ok')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'needs_approval')
    decideApproval(db, task.id, openApproval(db, task.id)!.request_id, true)
    await waitFor(() => answer !== undefined)
    await runner.stop()
    const stored = JSON.parse(permissionRequests(env, task.id)[0].payload) as { input: { command: string } }
    assert.ok(!stored.input.command.includes('abc123'), stored.input.command)
    assert.ok(stored.input.command.includes('token: [REDACTED]'), stored.input.command)
    assert.equal(answer, true)
  })

  test('two parallel requests are opened one at a time and answered in order', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'ops_change', data: { intent: 'two approvals' } })
    const answers: boolean[] = []
    const runner = startRunner({
      db, config, worker: fakeWorker(async (ctx) => {
        answers.push(...await Promise.all([
          ctx.requestApproval({ tool: 'Bash', input: { n: 1 } }),
          ctx.requestApproval({ tool: 'Bash', input: { n: 2 } }),
        ]))
        return result('done', 'ok')
      }),
    })
    try {
      await runner.start()
      await waitFor(() => permissionRequests(env, task.id).length === 1 && statusOf(db, task.id) === 'needs_approval')
      await sleep(100)
      assert.equal(permissionRequests(env, task.id).length, 1, 'the second request must wait for the first')
      decideApproval(db, task.id, openApproval(db, task.id)!.request_id, true)
      await waitFor(() => permissionRequests(env, task.id).length === 2 && statusOf(db, task.id) === 'needs_approval')
      decideApproval(db, task.id, openApproval(db, task.id)!.request_id, false)
      await waitFor(() => statusOf(db, task.id) === 'done')
    } finally {
      await runner.stop()
    }
    assert.deepEqual(answers, [true, false])
    assert.deepEqual(permissionRequests(env, task.id).map((e) => JSON.parse(e.payload).input.n), [1, 2])
  })
})
