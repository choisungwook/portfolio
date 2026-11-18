import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { getMeta, isQueuePaused, pauseBy } from '../src/db/meta.ts'
import { setStatus, getTask } from '../src/db/tasks.ts'
import { cancel, pause, retry, unpause } from '../src/cli/operator.ts'
import { addTask, setup, type TestEnv } from './helpers.ts'

describe('taskq pause, unpause, cancel, retry', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  test('the CLI uses the same transitions as the API and prints the outcome', () => {
    const { db, config } = env
    const logs: string[] = []
    const log = console.log
    console.log = (...parts: unknown[]) => logs.push(parts.join(' '))
    try {
      pause({ config, db }, ['--reason', 'hand stop'])
      assert.equal(isQueuePaused(db), true)
      assert.equal(getMeta(db, 'pause_reason'), 'hand stop')
      assert.equal(pauseBy(db), 'user')
      unpause({ config, db }, [])
      assert.equal(isQueuePaused(db), false)

      const waiting = addTask(db, { type: 'ops_read', data: { intent: 'login first' } })
      setStatus(db, waiting.id, 'needs_auth')
      cancel({ config, db }, [waiting.id])
      assert.equal(getTask(db, waiting.id)!.status, 'cancelled')

      const failed = addTask(db, { data: { intent: 'failed' } })
      setStatus(db, failed.id, 'failed')
      retry({ config, db }, [failed.id, '--draft'])
      assert.equal(getTask(db, failed.id)!.status, 'draft')

      const done = addTask(db, { data: { intent: 'done' } })
      setStatus(db, done.id, 'done')
      assert.throws(() => cancel({ config, db }, [done.id]), /only running, needs_approval or needs_auth/)
      assert.throws(() => retry({ config, db }, ['0'.repeat(8)]), /task not found/)
    } finally {
      console.log = log
    }
    assert.equal(logs.length, 4)
    assert.equal(logs[0], 'queue paused')
    assert.equal(logs[1], 'queue resumed')
    assert.match(logs[2], / cancelled$/)
    assert.match(logs[3], / draft$/)
  })
})
