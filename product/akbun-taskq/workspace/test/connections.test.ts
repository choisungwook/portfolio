import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { endTurn, getAgent, postMessage, setAgentEnabled, startTurn, updateAgent, USER } from '../src/db/team.ts'
import { createTeamHub, isTeamPaused, LOGIN_FAILED, pauseTeam, signedOutKey } from '../src/team/hub.ts'
import { setMeta } from '../src/db/meta.ts'
import { teamChanged } from '../src/wake.ts'
import { botConnection, clearConnectionCache, codexModelProvider, listConnections, testConnection, type Checks } from '../src/team/connections.ts'
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
    env = setup()
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
    assert.deepEqual(team, { paused: false, pause_reason: null })
    const by = Object.fromEntries(connections.map((c) => [c.id, c]))
    assert.deepEqual(Object.keys(by), ['claude:api', 'claude:subscription', 'claude:bedrock', 'openai:api', 'openai:bedrock', 'openai:chatgpt', 'kiro'])
    assert.deepEqual(by.kiro.bots, ['coder'])
    assert.deepEqual(by['openai:chatgpt'].bots, ['reviewer'])
    assert.ok(by['claude:bedrock'].bots.includes('taskq') && !by['claude:bedrock'].bots.includes('coder'), 'the Connections choice is the default')
    assert.match(by['claude:bedrock'].detail, /region .*, AWS profile/)
    assert.equal(by['openai:api'].status, 'ok')
    assert.match(by['openai:bedrock'].reason ?? '', /AWS_BEARER_TOKEN_BEDROCK/)
    assert.deepEqual([by['openai:chatgpt'].status, by['openai:chatgpt'].reason], ['error', 'Not logged in'])
    assert.deepEqual([by.kiro.last?.agent, by.kiro.last?.outcome, by.kiro.last?.error], ['coder', 'failed', 'Kiro is not signed in'])
    assert.equal(by.kiro.last_ok_at, null)
  })

  test('[critical] a recheck that passes turns a bot back on after its login failed, and resumes bots paused for the Claude login', async () => {
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'kiro', provider: null })
    const hub = createTeamHub({ db: env.db, config: env.config, backend: { runTurn: async () => ({ outcome: 'failed', error: 'signed out', auth_failed: true }) },
      backends: { kiro: { runTurn: async () => ({ outcome: 'failed', error: 'signed out', auth_failed: true }) } }, retryAfterSec: 0 })
    await hub.start()
    try {
      postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
      postMessage(env.db, { sender: USER, recipient: 'taskq', body: 'hi' })
      teamChanged.notify()
      const until = Date.now() + 3000
      while (!(getAgent(env.db, 'coder')?.enabled === false && isTeamPaused(env.db)) && Date.now() < until) await new Promise((r) => setTimeout(r, 10))
    } finally {
      await hub.stop()
    }
    assert.equal(getAgent(env.db, 'coder')?.enabled, false)
    assert.equal(isTeamPaused(env.db), true)
    // Saving another setting while the bot is off (how a login is usually fixed) keeps it restorable.
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, effort: 'low' })
    // The cached check the UI polls changes nothing; the rerun does.
    await listConnections(env.db, env.config, { checks: passing })
    assert.equal(getAgent(env.db, 'coder')?.enabled, false)
    await listConnections(env.db, env.config, { checks: passing, refresh: true })
    assert.equal(getAgent(env.db, 'coder')?.enabled, true)
    assert.equal(isTeamPaused(env.db), false)
    // A bot the user turned off stays off.
    setAgentEnabled(env.db, 'coder', false)
    await listConnections(env.db, env.config, { checks: passing, refresh: true })
    assert.equal(getAgent(env.db, 'coder')?.enabled, false)
  })

  test('[critical] Bedrock with an AWS profile comes back on the polled check; with only a key it waits for the rerun', async () => {
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'openai', provider: 'bedrock' })
    const off = () => {
      setAgentEnabled(env.db, 'coder', false)
      setMeta(env.db, signedOutKey('coder'), '1')
      clearConnectionCache()
    }
    const checks: Checks = { ...passing, env: { AWS_BEARER_TOKEN_BEDROCK: 'key' }, bedrockToken: async () => 'token' }
    off()
    await listConnections(env.db, env.config, { checks })
    assert.equal(getAgent(env.db, 'coder')?.enabled, false, 'a key that is only present proves nothing')
    env.config.bots.bedrockProfile = 'example-sso'
    off()
    await listConnections(env.db, env.config, { checks })
    assert.equal(getAgent(env.db, 'coder')?.enabled, true)
  })

  test('[critical] a silent bot says why, in the order a message meets the reasons', async () => {
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
    assert.equal(((await all.json()) as { connections: unknown[] }).connections.length, 7)
    const one = await get('/bots/coder/connection')
    assert.equal(((await one.json()) as { connection: { id: string } }).connection.id, 'claude:api')
    assert.equal((await get('/bots/nobody/connection')).status, 404)
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    const turn = startTurn(env.db, 'coder', 5)!
    endTurn(env.db, turn.turn.id, { outcome: 'failed', error: 'ANTHROPIC_API_KEY is not set' }, 3)
    const errors = (await (await get('/bots/coder/turn-errors')).json()) as { outcome: string; error: string }[]
    assert.deepEqual(errors.map((e) => [e.outcome, e.error]), [['failed', 'ANTHROPIC_API_KEY is not set']])
    assert.equal((await get('/bots/nobody/turn-errors')).status, 404)
  })

  test('[critical] a Claude bot signs in its own way; the test button gives a check 5 seconds and restores what it turned off', async () => {
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, provider: 'subscription' })
    const { connections } = await listConnections(env.db, env.config, { checks: passing })
    assert.deepEqual(connections.find((c) => c.id === 'claude:subscription')?.bots, ['coder'])
    const seen: string[] = []
    const slow: Checks = { ...passing, async claude(config) { seen.push(config.provider); return new Promise(() => {}) } }
    const started = Date.now()
    const late = await testConnection(env.db, env.config, 'claude:api', slow, 50)
    assert.deepEqual([late.status, seen], ['error', ['api_key']])
    assert.ok(Date.now() - started < 1000)
    setAgentEnabled(env.db, 'coder', false)
    setMeta(env.db, signedOutKey('coder'), '1')
    pauseTeam(env.db, `${LOGIN_FAILED} for coder`)
    await testConnection(env.db, env.config, 'claude:api', passing)
    assert.equal(isTeamPaused(env.db), true, 'another Claude method passing does not fix coder')
    assert.equal((await testConnection(env.db, env.config, 'claude:subscription', passing)).status, 'ok')
    assert.equal(getAgent(env.db, 'coder')?.enabled, true)
    assert.equal(isTeamPaused(env.db), false)
  })

  test('the model provider of Codex is read from the top of its config.toml', () => {
    assert.equal(codexModelProvider(env.home), null, 'no config.toml')
    writeFileSync(join(env.home, 'config.toml'), 'model = "openai.gpt"\nmodel_provider = "amazon-bedrock"\n\n[model_providers.x]\nmodel_provider = "inner"\n')
    assert.equal(codexModelProvider(env.home), 'amazon-bedrock')
    writeFileSync(join(env.home, 'config.toml'), '[profiles.a]\nmodel_provider = "inner"\n')
    assert.equal(codexModelProvider(env.home), null, 'a key inside a table is not the top-level one')
  })
})
