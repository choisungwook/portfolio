import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { endTurn, getAgent, postMessage, startTurn, updateAgent, USER } from '../src/db/team.ts'
import { pauseTeam } from '../src/team/hub.ts'
import { botConnection, clearConnectionCache, listConnections, type Checks } from '../src/team/connections.ts'
import { createApp } from '../src/api/server.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

// Which connection each bot uses, whether it works, and why a bot is silent. No CLI or cloud call runs here.

const passing: Checks = {
  async claude() { return { status: 'ok', reason: null } },
  async codex() { return { status: 'error', reason: 'Not logged in' } },
  async kiro() { return { status: 'ok', reason: null } },
  env: { OPENAI_API_KEY: 'sk-test' },
}

describe('connections', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    clearConnectionCache()
    env = setup({ bots: { ...setup().config.bots, enabled: true } })
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  test('[critical] each bot is listed under its connection, with the check and the last turn on it', async () => {
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'kiro' })
    updateAgent(env.db, 'reviewer', { ...getAgent(env.db, 'reviewer')!, sdk: 'openai', provider: 'chatgpt' })
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    const turn = startTurn(env.db, 'coder', 5)!
    endTurn(env.db, turn.turn.id, { outcome: 'failed', error: 'Kiro is not signed in' }, 3)
    const { team, connections } = await listConnections(env.db, env.config, { checks: passing })
    assert.deepEqual(team, { enabled: true, paused: false, pause_reason: null })
    const by = Object.fromEntries(connections.map((c) => [c.id, c]))
    assert.deepEqual(Object.keys(by), ['claude', 'openai:api', 'openai:bedrock', 'openai:chatgpt', 'kiro'])
    assert.deepEqual(by.kiro.bots, ['coder'])
    assert.deepEqual(by['openai:chatgpt'].bots, ['reviewer'])
    assert.ok(by.claude.bots.includes('taskq') && !by.claude.bots.includes('coder'))
    assert.match(by.claude.detail, /provider bedrock, region .*, AWS profile/)
    assert.equal(by['openai:api'].status, 'ok')
    assert.match(by['openai:bedrock'].reason ?? '', /AWS_BEARER_TOKEN_BEDROCK/)
    assert.deepEqual([by['openai:chatgpt'].status, by['openai:chatgpt'].reason], ['error', 'Not logged in'])
    assert.deepEqual([by.kiro.last?.agent, by.kiro.last?.outcome, by.kiro.last?.error], ['coder', 'failed', 'Kiro is not signed in'])
    assert.equal(by.kiro.last_ok_at, null)
  })

  test('[critical] a silent bot says why, in the order a message meets the reasons', async () => {
    const off = setup()
    await seedTestBots(off.db)
    assert.match((await botConnection(off.db, off.config, 'coder', { checks: passing }))?.blocker ?? '', /Bots are off: set bots.enabled/)
    off.cleanup()

    pauseTeam(env.db, 'daily budget spent')
    assert.match((await botConnection(env.db, env.config, 'coder', { checks: passing }))?.blocker ?? '', /paused: daily budget spent/)
    env.db.prepare(`DELETE FROM meta WHERE key LIKE 'team_pause%'`).run()

    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'openai', provider: 'chatgpt' })
    const chatgpt = await botConnection(env.db, env.config, 'coder', { checks: passing })
    assert.equal(chatgpt?.connection.id, 'openai:chatgpt')
    assert.equal(chatgpt?.blocker, 'Its connection fails: Not logged in')

    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'claude', provider: null })
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    const turn = startTurn(env.db, 'coder', 5)!
    endTurn(env.db, turn.turn.id, { outcome: 'failed', error: 'model access denied' }, 3)
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'again' })
    const failed = await botConnection(env.db, env.config, 'coder', { checks: passing })
    assert.equal(failed?.blocker, 'Its last turn failed: model access denied')
    assert.ok((failed?.waiting ?? 0) >= 1)

    const retry = startTurn(env.db, 'coder', 5)!
    assert.equal((await botConnection(env.db, env.config, 'coder', { checks: passing }))?.blocker, null, 'a bot with an open turn is working')
    endTurn(env.db, retry.turn.id, { outcome: 'cancelled', error: 'stopped' }, 3)
    assert.equal((await botConnection(env.db, env.config, 'coder', { checks: passing }))?.blocker, null, 'a cancelled turn is not a failure')

    const healthy = await botConnection(env.db, env.config, 'planner', { checks: passing })
    assert.equal(healthy?.blocker, null)
  })

  test('the API answers for every connection, for one bot and its failed turns; an unknown bot is 404', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const get = (path: string) => app.request(`/api${path}`, { headers: { 'x-taskq-token': TOKEN, host: `127.0.0.1:${env.config.port}` } })
    env.config.provider = 'api_key'
    const all = await get('/connections')
    assert.equal(all.status, 200)
    assert.equal(((await all.json()) as { connections: unknown[] }).connections.length, 5)
    const one = await get('/bots/coder/connection')
    assert.equal(((await one.json()) as { connection: { id: string } }).connection.id, 'claude')
    assert.equal((await get('/bots/nobody/connection')).status, 404)
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    const turn = startTurn(env.db, 'coder', 5)!
    endTurn(env.db, turn.turn.id, { outcome: 'failed', error: 'ANTHROPIC_API_KEY is not set' }, 3)
    const errors = (await (await get('/bots/coder/turn-errors')).json()) as { outcome: string; error: string }[]
    assert.deepEqual(errors.map((e) => [e.outcome, e.error]), [['failed', 'ANTHROPIC_API_KEY is not set']])
    assert.equal((await get('/bots/nobody/turn-errors')).status, 404)
  })
})
