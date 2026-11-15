import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

const JSON_TYPE = { 'content-type': 'application/json' }

describe('api token, content type and stream cap', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const host = () => ({ host: `127.0.0.1:${env.config.port}` })
  const app = () => createApp({ db: env.db, config: env.config }, TOKEN)
  const withToken = (token: string) => ({ ...host(), 'x-taskq-token': token })

  test('[critical] every /api request needs the token header; a wrong or missing one is 401', async () => {
    assert.equal((await app().request('/api/tasks', { headers: host() })).status, 401)
    assert.equal((await app().request('/api/tasks', { headers: withToken('nope') })).status, 401)
    assert.equal((await app().request('/api/tasks', { headers: withToken(TOKEN) })).status, 200)
  })

  test('static UI files need no token', async () => {
    const res = await app().request('/', { headers: host() })
    assert.notEqual(res.status, 401)
  })

  test('the event stream also accepts ?token=, and no other route does', async () => {
    const ok = await app().request(`/api/events/stream?token=${TOKEN}`, { headers: host() })
    assert.equal(ok.status, 200)
    await ok.body!.cancel()
    assert.equal((await app().request(`/api/events/stream?token=${'x'.repeat(TOKEN.length)}`, { headers: host() })).status, 401)
    assert.equal((await app().request(`/api/tasks?token=${TOKEN}`, { headers: host() })).status, 401)
  })

  test('[critical] a write must be application/json; jsonx and a missing type are 415', async () => {
    const body = JSON.stringify({ type: 'research', intent: 'x' })
    const post = (headers: Record<string, string>) => app().request('/api/tasks', {
      method: 'POST', headers: { ...withToken(TOKEN), ...headers }, body,
    })
    assert.equal((await post({ 'content-type': 'application/jsonx' })).status, 415)
    assert.equal((await post({})).status, 415)
    assert.equal((await post({ 'content-type': 'text/plain' })).status, 415)
    assert.equal((await post({ 'content-type': 'application/json; charset=utf-8' })).status, 201)
  })

  test('at most 8 event streams are open; the 9th gets 429 until one closes', async () => {
    const server = app()
    const open = async () => server.request(`/api/events/stream?token=${TOKEN}`, { headers: host() })
    const readers = []
    for (let i = 0; i < 8; i += 1) {
      const res = await open()
      assert.equal(res.status, 200)
      readers.push(res.body!.getReader())
    }
    assert.equal((await open()).status, 429)
    // A client disconnect cancels the response body, which ends the stream and frees its slot.
    await readers[0].cancel()
    await new Promise((resolve) => setTimeout(resolve, 50))
    const again = await open()
    assert.equal(again.status, 200)
    readers.push(again.body!.getReader())
    for (const reader of readers.slice(1)) await reader.cancel()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })

  test('[critical] a write from a foreign Origin is 403, and the local UI origin is accepted', async () => {
    const body = JSON.stringify({ type: 'research', intent: 'origin check' })
    const post = (origin: string) => app().request('/api/tasks', {
      method: 'POST', headers: { ...withToken(TOKEN), ...JSON_TYPE, origin }, body,
    })
    assert.equal((await post('https://evil.example')).status, 403)
    assert.equal((await post(`http://127.0.0.1:${env.config.port}`)).status, 201)
  })

  test('[critical] a task created by POST without a status is a draft', async () => {
    const res = await app().request('/api/tasks', {
      method: 'POST', headers: { ...withToken(TOKEN), ...JSON_TYPE }, body: JSON.stringify({ type: 'research', intent: 'idea' }),
    })
    assert.equal((await res.json()).status, 'draft')
  })
})
