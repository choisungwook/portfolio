import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { join, sep } from 'node:path'
import { createRetrospector, safeName } from '../src/memory/retrospect.ts'
import { claudeAsk } from '../src/agents/claude/ask.ts'
import { findSimilar } from '../src/memory/similar.ts'
import { createRunner } from '../src/runner/runner.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { listProposals } from '../src/db/proposals.ts'
import { insertRun, endRun } from '../src/db/runs.ts'
import { newId } from '../src/ids.ts'
import { nowSec } from '../src/time.ts'
import type { Task, WorkerResult } from '../src/types.ts'
import { addTask, fakeWorker, result, setup, statusOf, waitFor, type TestEnv } from './helpers.ts'
import { fakeQuery, success } from './fake-query.ts'

const notes = (memory: unknown[], skills: unknown[] = []) => success({ memory, skills })
const finished: WorkerResult = result('done', 'checked the staging cluster')

describe('retrospect', () => {
  let env: TestEnv
  const made: TestEnv[] = []
  const fresh = (overrides: Parameters<typeof setup>[0] = {}) => {
    env = setup(overrides)
    made.push(env)
    return env
  }
  test.afterEach(() => {
    for (const item of made.splice(0)) item.cleanup()
  })

  test('creates pending memory proposals and sanitizes file names', async () => {
    fresh()
    const task = addTask(env.db, { data: { intent: 'deploy staging' } })
    const { query } = fakeQuery(() => [notes([
      { file: '../../etc/passwd', text: 'escape attempt' },
      { file: 'Pref Notes.md', text: 'prefers short summaries' },
    ], [{ file: 'skill-a', text: 'should be dropped: no skillsDir' }])])
    await createRetrospector({ db: env.db, config: env.config, ask: (request) => claudeAsk(env.config, request, query) })(task as Task, finished)
    const rows = listProposals(env.db, 'pending')
    assert.equal(rows.length, 2)
    const memoryDir = join(env.home, 'memory')
    for (const row of rows) {
      assert.equal(row.kind, 'memory')
      assert.ok(row.target_path.startsWith(memoryDir + sep), `escaped: ${row.target_path}`)
    }
    assert.deepEqual(rows.map((row) => row.target_path.slice(memoryDir.length + 1)).sort(), ['etc-passwd.md', 'pref-notes.md'])
    assert.equal(listAlerts(env.db, true).filter((a) => a.kind === 'proposal_pending').length, 1)
  })

  test('skill proposals never target SKILL.md: they go to a proposed file beside it, for the user to merge', async () => {
    fresh({ skillsDir: join(process.env.TMPDIR ?? '/tmp', 'example-skills-dir') })
    const task = addTask(env.db, { data: { intent: 'deploy staging' } })
    const { query } = fakeQuery(() => [notes([], [{ file: 'deploy-staging', text: 'steps' }])])
    const before = Math.floor(Date.now() / 1000)
    await createRetrospector({ db: env.db, config: env.config, ask: (request) => claudeAsk(env.config, request, query) })(task as Task, finished)
    const rows = listProposals(env.db, 'pending')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].kind, 'skill')
    const dir = join(env.config.skillsDir!, 'deploy-staging')
    const match = /^proposed-(\d+)\.md$/.exec(rows[0].target_path.slice(dir.length + 1))
    assert.ok(rows[0].target_path.startsWith(dir + sep), rows[0].target_path)
    assert.ok(match, rows[0].target_path)
    assert.ok(Number(match[1]) >= before)
  })

  test('two skill notes with the same name in one run get different proposal files', async () => {
    fresh({ skillsDir: join(process.env.TMPDIR ?? '/tmp', 'example-skills-dir') })
    const task = addTask(env.db, { data: { intent: 'deploy staging' } })
    const { query } = fakeQuery(() => [notes([], [
      { file: 'deploy-staging', text: 'first' }, { file: 'deploy-staging', text: 'second' },
    ])])
    await createRetrospector({ db: env.db, config: env.config, ask: (request) => claudeAsk(env.config, request, query) })(task as Task, finished)
    const targets = listProposals(env.db, 'pending').map((row) => row.target_path)
    assert.equal(targets.length, 2)
    assert.notEqual(targets[0], targets[1])
  })

  test('the retrospect session loads no settings and has no tools', async () => {
    fresh()
    const task = addTask(env.db)
    const { query, calls } = fakeQuery(() => [notes([])])
    await createRetrospector({ db: env.db, config: env.config, ask: (request) => claudeAsk(env.config, request, query) })(task as Task, finished)
    assert.deepEqual(calls[0].tools, [])
    assert.deepEqual(calls[0].settingSources, [])
    assert.equal(calls[0].permissionMode, 'dontAsk')
    assert.equal(calls[0].maxTurns, 3)
  })

  test('safeName keeps only a [a-z0-9-]+ stem', () => {
    assert.equal(safeName('../../etc/passwd'), 'etc-passwd')
    assert.equal(safeName('Hello World.MD'), 'hello-world')
    assert.equal(safeName('...'), null)
    assert.equal(safeName(''), null)
  })
})

describe('findSimilar', () => {
  let env: TestEnv
  test.beforeEach(() => { env = setup() })
  test.afterEach(() => env.cleanup())

  test('finds a finished run by shared words and never treats user text as FTS syntax', () => {
    const past = addTask(env.db, { data: { intent: 'deploy the staging cluster' } })
    const runId = newId()
    insertRun(env.db, { id: runId, task_id: past.id, session_id: null, started_at: nowSec() - 10 })
    endRun(env.db, { id: runId, task_id: past.id, intent: past.data.intent, outcome: 'done', summary: 'rolled out', stats: {}, ended_at: nowSec() })
    const current = addTask(env.db, { data: { intent: 'deploy "staging" NEAR(a b) OR *' } })
    const found = findSimilar(env.db, current)
    assert.equal(found.length, 1)
    assert.equal(found[0].task_id, past.id)
    assert.equal(findSimilar(env.db, addTask(env.db, { data: { intent: '"' } })).length, 0)
  })
})

describe('runner wiring', () => {
  let env: TestEnv
  test.beforeEach(() => { env = setup() })
  test.afterEach(() => env.cleanup())

  test('a retrospect that never resolves does not block the task from finishing', async () => {
    const task = addTask(env.db)
    const runner = createRunner({
      db: env.db, config: env.config, worker: fakeWorker(() => result('done', 'ok')),
      retrospect: () => new Promise<void>(() => {}),
    })
    await runner.start()
    await waitFor(() => statusOf(env.db, task.id) === 'review')
    await runner.stop()
  })

  test('a failing retrospect does not fail the task', async () => {
    const task = addTask(env.db)
    const runner = createRunner({
      db: env.db, config: env.config, worker: fakeWorker(() => result('done', 'ok')),
      retrospect: async () => { throw new Error('retrospect down') },
    })
    await runner.start()
    await waitFor(() => statusOf(env.db, task.id) === 'review')
    await runner.stop()
  })
})
