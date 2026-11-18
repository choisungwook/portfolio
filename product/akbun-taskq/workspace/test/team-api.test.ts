import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { listMessages } from '../src/db/team.ts'
import { writePage } from '../src/db/wiki.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

describe('team api', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const app = () => createApp({ db: env.db, config: env.config }, TOKEN)
  const headers = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })
  const post = (body: unknown) => ({ method: 'POST', headers: { ...headers(), 'content-type': 'application/json' }, body: JSON.stringify(body) })

  test('the roster is listed without instructions, and a user message goes to the lead by default', async () => {
    const team = await (await app().request('/api/team', { headers: headers() })).json() as { enabled: boolean; agents: Record<string, unknown>[] }
    assert.equal(team.enabled, false)
    assert.deepEqual(team.agents.map((a) => a.name), ['lead', 'planner', 'coder', 'reviewer', 'doc-reviewer'])
    assert.equal('instructions' in team.agents[0], false)
    const res = await app().request('/api/team/messages', post({ body: 'survey X' }))
    assert.equal(res.status, 201)
    assert.equal(listMessages(env.db, { recipient: 'lead', limit: 5 })[0].sender, 'user')
  })

  test('an unknown recipient and an empty body are refused', async () => {
    await app().request('/api/team', { headers: headers() })
    assert.equal((await app().request('/api/team/messages', post({ to: 'ghost', body: 'x' }))).status, 404)
    assert.equal((await app().request('/api/team/messages', post({ body: '  ' }))).status, 400)
  })

  test('wiki pages are listed, searched and read by slug', async () => {
    writePage(env.db, { slug: 'repos/taskq', title: 'taskq', body: 'node sqlite', author: 'coder', base_revision: 0 })
    const found = await (await app().request('/api/team/wiki?q=sqlite', { headers: headers() })).json() as { slug: string }[]
    assert.deepEqual(found.map((p) => p.slug), ['repos/taskq'])
    const page = await (await app().request('/api/team/wiki/page?slug=repos/taskq', { headers: headers() })).json() as { body: string }
    assert.equal(page.body, 'node sqlite')
    assert.equal((await app().request('/api/team/wiki/page?slug=nope', { headers: headers() })).status, 404)
  })

  test('pause and resume', async () => {
    await app().request('/api/team/pause', post({}))
    let team = await (await app().request('/api/team', { headers: headers() })).json() as { paused: boolean }
    assert.equal(team.paused, true)
    await app().request('/api/team/resume', post({}))
    team = await (await app().request('/api/team', { headers: headers() })).json() as { paused: boolean }
    assert.equal(team.paused, false)
  })
})
