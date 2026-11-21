import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { insertProposal } from '../src/db/proposals.ts'
import { addTask, setup, TOKEN, type TestEnv } from './helpers.ts'

const JSON_HEADERS = { 'content-type': 'application/json' }

describe('api', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const host = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })

  test('[critical] a foreign Host is rejected and the local Host is accepted', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const foreign = await app.request('/api/tasks', { headers: { host: 'evil.example:4517' } })
    assert.equal(foreign.status, 403)
    const local = await app.request('/api/tasks', { headers: host() })
    assert.equal(local.status, 200)
  })

  test('POST /tasks validates the body', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const post = (body: unknown, headers: Record<string, string> = JSON_HEADERS) =>
      app.request('/api/tasks', { method: 'POST', headers: { ...host(), ...headers }, body: JSON.stringify(body) })
    assert.equal((await post({ type: 'nope', intent: 'x' })).status, 400)
    assert.equal((await post({ type: 'research', intent: '   ' })).status, 400)
    assert.equal((await post({ type: 'research', intent: 'x', depends_on: ['zzz'] })).status, 400)
    // The JSON-only rule and the draft default are in api-auth.test.ts.
    assert.equal((await post({ type: 'research', intent: 'survey' })).status, 201)
    const ready = await post({ type: 'research', intent: 'survey', status: 'ready' })
    assert.equal((await ready.json()).status, 'ready')
  })

  test('proposal apply rejects a target outside memory/ and accepts one inside', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const outside = insertProposal(env.db, { task_id: null, kind: 'memory', target_path: '/etc/hosts', diff: '\nx\n' })
    const rejected = await app.request(`/api/proposals/${outside}/apply`, { method: 'POST', headers: { ...host(), ...JSON_HEADERS } })
    assert.equal(rejected.status, 400)

    const inside = insertProposal(env.db, { task_id: null, kind: 'memory', target_path: 'memory/notes.md', diff: '\nfact\n' })
    const accepted = await app.request(`/api/proposals/${inside}/apply`, { method: 'POST', headers: { ...host(), ...JSON_HEADERS } })
    assert.equal(accepted.status, 200)
    assert.equal(readFileSync(join(env.home, 'memory', 'notes.md'), 'utf8'), '\nfact\n')
  })

  test('GET /tasks reports blocked tasks', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const blocker = addTask(env.db, { status: 'draft' })
    addTask(env.db, { deps: [{ depends_on: blocker.id, kind: 'blocks' }] })
    const rows = await (await app.request('/api/tasks?status=ready', { headers: host() })).json() as { blocked: boolean }[]
    assert.equal(rows.length, 1)
    assert.equal(rows[0].blocked, true)
  })
})
