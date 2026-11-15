import { test } from 'node:test'
import assert from 'node:assert/strict'
import { claimTask, releaseTask } from '../src/db/tasks.ts'
import { endRun, insertRun } from '../src/db/runs.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import { addTask, setup, statusOf } from './helpers.ts'

test('two tasks with one lock_key cannot both be claimed by two runners', () => {
  const env = setup()
  try {
    const a = addTask(env.db, { lock_key: 'repo-a' })
    const b = addTask(env.db, { lock_key: 'repo-a' })
    assert.equal(claimTask(env.db, a.id, 'runner-a'), true)
    assert.equal(claimTask(env.db, b.id, 'runner-b'), false)
    assert.equal(statusOf(env.db, b.id), 'ready')
  } finally {
    env.cleanup()
  }
})

test('releaseTask and endRun act only for the runner that holds the claim', () => {
  const env = setup()
  try {
    const task = addTask(env.db)
    assert.equal(claimTask(env.db, task.id, 'runner-a'), true)
    const runId = newId()
    insertRun(env.db, { id: runId, task_id: task.id, session_id: null, started_at: nowSec() })
    const run = { id: runId, task_id: task.id, intent: 'x', outcome: 'done' as const, summary: 'ok', stats: {}, ended_at: nowSec() }
    assert.equal(releaseTask(env.db, task.id, 'ready', 'runner-b'), false)
    assert.equal(endRun(env.db, run, 'runner-b'), false)
    assert.equal(statusOf(env.db, task.id), 'running')
    assert.equal(env.db.prepare('SELECT ended_at FROM runs WHERE id = ?').get(runId)?.ended_at, null)
    assert.equal(endRun(env.db, run, 'runner-a'), true)
    assert.equal(releaseTask(env.db, task.id, 'done', 'runner-a'), true)
    assert.equal(statusOf(env.db, task.id), 'done')
  } finally {
    env.cleanup()
  }
})
