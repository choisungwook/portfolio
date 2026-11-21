import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import {
  USER, agentsWithMail, endTurn, getAgent, listMessages, postMessage, recoverTurns, seedAgents, startTurn,
} from '../src/db/team.ts'
import { getPage, writePage, pageHistory } from '../src/db/wiki.ts'
import { hybridSearch } from '../src/team/search.ts'
import { ToolError, repoAllowed, teamTools } from '../src/team/tools.ts'
import { getTask } from '../src/db/tasks.ts'
import { setOwner } from '../src/team/owner.ts'
import { listAlerts } from '../src/db/alerts.ts'
import { createRunner } from '../src/runner/runner.ts'
import { TOKEN, addTask, fakeWorker, seedTestBots, result, setup, sleep, statusOf, waitFor, type TestEnv } from './helpers.ts'
import { createApp } from '../src/api/server.ts'

function tool(env: TestEnv, agent: string, name: string) {
  const found = teamTools({ db: env.db, config: env.config, agent, search: hybridSearch(env.db) }).find((t) => t.name === name)
  assert.ok(found, name)
  return (args: Record<string, unknown>) => found.handler(args) as Record<string, unknown>
}

describe('team mailbox', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  test('giving a draft to a bot leaves a note in its conversation without starting a turn', () => {
    const { db } = env
    const draft = addTask(db, { type: 'research', status: 'draft' })
    setOwner(db, draft.id, 'taskq', USER)
    assert.match(listMessages(db, { agent: 'taskq', limit: 5 })[0].body, /is now yours/)
    assert.deepEqual(agentsWithMail(db, Math.floor(Date.now() / 1000), 60), [])
    const ready = addTask(db, { type: 'research' })
    setOwner(db, ready.id, 'taskq', USER)
    assert.deepEqual(agentsWithMail(db, Math.floor(Date.now() / 1000), 60), ['taskq'])
  })

  test('making an owned draft ready wakes its owner', async () => {
    const { db, config } = env
    const draft = addTask(db, { type: 'research', status: 'draft' })
    setOwner(db, draft.id, 'taskq', USER)
    const app = createApp({ db, config }, TOKEN)
    const headers = { host: `127.0.0.1:${config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
    const res = await app.request(`/api/tasks/${draft.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'ready' }) })
    assert.equal(res.status, 200)
    assert.deepEqual(agentsWithMail(db, Math.floor(Date.now() / 1000), 60), ['taskq'])
  })

  test('a turn takes every unread message once and blocks a second turn', () => {
    const { db } = env
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'first' })
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'second' })
    assert.deepEqual(agentsWithMail(db, Math.floor(Date.now() / 1000), 60), ['taskq'])
    const started = startTurn(db, 'taskq', 20)
    assert.deepEqual(started?.messages.map((m) => m.body), ['first', 'second'])
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'third' })
    assert.equal(startTurn(db, 'taskq', 20), undefined)
    assert.deepEqual(agentsWithMail(db, Math.floor(Date.now() / 1000), 60), [])
  })

  test('a failed turn returns its messages, and the third failure sets them aside', () => {
    const { db } = env
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'hello' })
    for (let attempt = 1; attempt <= 2; attempt++) {
      const { turn } = startTurn(db, 'taskq', 20)!
      assert.deepEqual(endTurn(db, turn.id, { outcome: 'failed', error: 'boom' }, 3).setAside, [])
    }
    const { turn } = startTurn(db, 'taskq', 20)!
    const aside = endTurn(db, turn.id, { outcome: 'failed', error: 'boom' }, 3)
    assert.equal(aside.setAside.length, 1)
    assert.equal(aside.reason, 'attempts')
    assert.equal(startTurn(db, 'taskq', 20), undefined)
  })

  test('an interrupted turn does not count as an attempt, and recovery reopens a crashed turn', () => {
    const { db } = env
    postMessage(db, { sender: USER, recipient: 'taskq', body: 'hello' })
    for (let i = 0; i < 5; i++) {
      const { turn } = startTurn(db, 'taskq', 20)!
      endTurn(db, turn.id, { outcome: 'interrupted' }, 3)
    }
    startTurn(db, 'taskq', 20)
    assert.equal(recoverTurns(db).length, 1)
    const again = startTurn(db, 'taskq', 20)
    assert.equal(again?.messages.length, 1)
  })

  test('message text is masked before it is stored', () => {
    const { db } = env
    postMessage(db, { sender: 'taskq', recipient: USER, body: 'key AKIAABCDEFGHIJKLMNOP leaked' })
    const [stored] = listMessages(db, { recipient: USER, limit: 1 })
    assert.doesNotMatch(stored.body, /AKIAABCDEFGHIJKLMNOP/)
  })
})

describe('team wiki', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  test('a write based on an old revision is refused with the current page', () => {
    const { db } = env
    assert.deepEqual(writePage(db, { slug: 'repos/taskq', title: 'taskq', body: 'uses sqlite', author: 'coder', base_revision: 0 }), { ok: true, revision: 1 })
    assert.deepEqual(writePage(db, { slug: 'repos/taskq', title: 'taskq', body: 'uses sqlite and hono', author: 'reviewer', base_revision: 1 }), { ok: true, revision: 2 })
    const stale = writePage(db, { slug: 'repos/taskq', title: 'taskq', body: 'overwrite', author: 'coder', base_revision: 1 })
    assert.equal(stale.ok, false)
    assert.equal(stale.ok === false && stale.current?.body, 'uses sqlite and hono')
    assert.equal(getPage(db, 'repos/taskq')?.updated_by, 'reviewer')
    assert.deepEqual(pageHistory(db, 'repos/taskq').map((r) => r.revision), [2, 1])
  })

  test('search finds the latest text only, and operators in the query are plain words', () => {
    const { db } = env
    writePage(db, { slug: 'decisions/storage', title: 'Storage', body: 'we picked postgres', author: 'taskq', base_revision: 0 })
    writePage(db, { slug: 'decisions/storage', title: 'Storage', body: 'we picked sqlite', author: 'taskq', base_revision: 1 })
    const search = hybridSearch(db)
    assert.deepEqual(search('postgres'), [])
    assert.equal(search('sqlite OR "x').length, 1)
  })

  test('a slug outside the pattern is refused', () => {
    const r = writePage(env.db, { slug: '../etc', title: 'x', body: 'x', author: 'taskq', base_revision: 0 })
    assert.equal(r.ok, false)
  })
})

describe('team tools', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  test('only an agent allowed to message the user can, and the user sees an alert', () => {
    assert.throws(() => tool(env, 'coder', 'send_message')({ to: USER, body: 'done' }), ToolError)
    tool(env, 'taskq', 'send_message')({ to: USER, body: 'report ready' })
    assert.ok(listAlerts(env.db, false).some((a) => a.kind === 'team_message' && a.message.includes('report ready')))
  })

  test('an agent cannot message itself or an unknown agent', () => {
    assert.throws(() => tool(env, 'taskq', 'send_message')({ to: 'taskq', body: 'x' }), /yourself/)
    assert.throws(() => tool(env, 'taskq', 'send_message')({ to: 'ghost', body: 'x' }), /no enabled agent/)
  })

  test('account tasks are drafts, agent priority is capped, and the owner is recorded', () => {
    const ops = tool(env, 'planner', 'create_task')({ type: 'ops_read', intent: 'list buckets' })
    assert.equal(ops.status, 'draft')
    const research = tool(env, 'planner', 'create_task')({ type: 'research', intent: 'survey the cache options', owner: 'doc-reviewer' })
    assert.equal(research.status, 'ready')
    assert.equal(getTask(env.db, String(research.task_id))?.owner, 'doc-reviewer')
    const skilled = tool(env, 'planner', 'create_task')({ type: 'research', intent: 'look up account limits', target_profile: 'example-prod' })
    assert.equal(skilled.status, 'draft')
    assert.throws(() => tool(env, 'planner', 'create_task')({ type: 'research', intent: 'jump the queue', priority: 50 }))
  })

  test('a code task needs a trusted repo or one under a read root, compared by real path', () => {
    const root = join(env.home, 'repos')
    const inside = join(root, 'app')
    const outside = join(env.home, 'elsewhere')
    mkdirSync(inside, { recursive: true })
    mkdirSync(outside, { recursive: true })
    symlinkSync(outside, join(root, 'link'))
    env.config.bots.readRoots = [root]
    assert.equal(repoAllowed(env.config, inside), true)
    assert.equal(repoAllowed(env.config, join(root, 'link')), false)
    assert.throws(() => tool(env, 'coder', 'create_task')({ type: 'code', intent: 'x', repo: outside }), /trustedRepos/)
    assert.equal(tool(env, 'coder', 'create_task')({ type: 'code', intent: 'x', repo: inside }).status, 'ready')
  })

  test('the open task cap stops agents from flooding the queue', () => {
    env.config.bots.maxOpenTasks = 2
    const create = tool(env, 'planner', 'create_task')
    const a = create({ type: 'research', intent: 'compare queue libraries' })
    create({ type: 'research', intent: 'measure sqlite write latency' })
    assert.throws(() => create({ type: 'research', intent: 'read the hono changelog' }), /queued or running/)
    env.db.prepare("UPDATE tasks SET status = 'review' WHERE id = ?").run(String(a.task_id))
    assert.equal(create({ type: 'research', intent: 'read the hono changelog' }).status, 'ready')
  })
})

describe('task results reach the owner', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  test('a finished task posts its summary to the owner, and a code task review goes to the reviewer', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'code', owner: 'coder', data: { intent: 'fix bug', repo: env.home } })
    const runner = createRunner({
      db, config, worker: fakeWorker((ctx) => ctx.task.type === 'code' ? result('done', 'fixed; npm test passed') : result('done', 'no findings')),
      preflight: async () => ({ ok: true }),
    })
    await runner.start()
    // A bot's task waits for its bot; the user's run button still runs it once.
    await sleep(50)
    assert.equal(statusOf(db, task.id), 'ready')
    runner.runNow(task.id)
    await waitFor(() => statusOf(db, task.id) === 'done')
    await waitFor(() => listMessages(db, { recipient: 'reviewer', limit: 5 }).length === 1)
    await runner.stop()
    assert.match(listMessages(db, { recipient: 'reviewer', limit: 1 })[0].body, /is now yours/)
    const [toCoder] = listMessages(db, { recipient: 'coder', limit: 5 })
    assert.equal(toCoder.sender, 'queue')
    assert.equal(toCoder.task_id, task.id)
    assert.match(toCoder.body, /fixed; npm test passed/)
  })

  test('a task the user added reports to nobody', async () => {
    const { db, config } = env
    const task = addTask(db, { type: 'research' })
    const runner = createRunner({ db, config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    await waitFor(() => statusOf(db, task.id) === 'review')
    await runner.stop()
    assert.equal(listMessages(db, { limit: 10 }).length, 0)
  })
})
