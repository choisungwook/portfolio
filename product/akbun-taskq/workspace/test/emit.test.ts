import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { listEvents } from '../src/db/events.ts'
import { addTask, fakeWorker, result, setup, statusOf, waitFor, type TestEnv, stopRunners, startRunner } from './helpers.ts'

describe('emit path', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(async () => {
    await stopRunners()
    env.cleanup()
  })

  test('a secret that straddles the 500-character limit is masked before clipping', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'research' })
    const long = 'x'.repeat(497) + 'AKIAEXAMPLEKEYID0000' + 'y'.repeat(100)
    const runner = startRunner({
      db, config, worker: fakeWorker((ctx) => {
        ctx.emit('tool_result', { summary: long, nested: { text: 'z'.repeat(20000) } })
        return result('done', 'ok')
      }),
    })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    const row = listEvents(db, { task_id: task.id, limit: 100 }).find((e) => e.kind === 'tool_result')!
    const payload = JSON.parse(row.payload) as { summary: string; nested: { text: string } }
    assert.ok(!payload.summary.includes('AKIA'), payload.summary)
    assert.ok(payload.summary.length <= 500 + 40 && payload.summary.includes('…(+'), payload.summary)
    assert.ok(payload.nested.text.endsWith('…(+19500 chars)'), payload.nested.text.slice(-30))
    assert.ok(payload.nested.text.length <= 520)
  })
})
