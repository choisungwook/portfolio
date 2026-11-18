import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type { Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import { createApp } from '../src/api/server.ts'
import { USER, postMessage, getAgent } from '../src/db/team.ts'
import { createClaudeTeamBackend, type TeamQueryFn } from '../src/agents/claude/team.ts'
import { createCatalog, STATIC_MODELS } from '../src/team/catalog.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

// The compose bar of a bot chat: model list, effort, permission mode, slash commands and the message queue.

describe('bot compose bar', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('[critical] without a running SDK the catalog falls back to the built-in models and the bot\'s skills', async () => {
    const res = await call('GET', '/bots/taskq/catalog')
    assert.equal(res.status, 200)
    const body = await res.json() as { fallback: boolean; models: { id: string }[]; commands: unknown[]; sdk: string }
    assert.equal(body.fallback, true)
    assert.equal(body.sdk, 'claude')
    assert.deepEqual(body.models.map((m) => m.id), STATIC_MODELS.claude.map((m) => m.id))
    assert.equal((await call('GET', '/bots/nobody/catalog')).status, 404)
  })

  test('the Claude catalog reads models and commands from an idle session, and keeps the short skill name', async () => {
    const calls: Options[] = []
    const runQuery: TeamQueryFn = ({ options }) => {
      calls.push(options)
      const stream = (async function* (): AsyncGenerator<SDKMessage> {})()
      return Object.assign(stream, {
        supportedModels: async () => [{ value: 'claude-sonnet-5-5', displayName: 'Sonnet 5.5', description: 'x', supportsEffort: true, supportedEffortLevels: ['low', 'high'] }],
        supportedCommands: async () => [{ name: 'taskq-taskq-skills:review', description: 'review a diff', argumentHint: '<pr>' }, { name: 'compact', description: 'c', argumentHint: '' }],
      }) as unknown as ReturnType<TeamQueryFn>
    }
    const backend = createClaudeTeamBackend(runQuery)
    const catalog = createCatalog(env.db, env.config, () => backend)
    const first = await catalog('taskq')
    assert.equal(first?.fallback, false)
    assert.deepEqual(first?.models, [{ id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', description: 'x', efforts: ['low', 'high'] }])
    assert.deepEqual(first?.commands.map((c) => c.name), ['compact', 'review'])
    assert.deepEqual(calls[0].tools, [])
    await catalog('taskq')
    assert.equal(calls.length, 1, 'the second read comes from the cache')
    await catalog('taskq', true)
    assert.equal(calls.length, 2, 'refresh asks the SDK again')
  })

  test('[critical] model, effort and permission mode chosen in the compose bar are saved on the bot', async () => {
    const current = await (await call('GET', '/bots/coder')).json() as Record<string, unknown>
    const res = await call('PUT', '/bots/coder', { ...current, model: 'claude-sonnet-5-5', effort: 'high', permission_mode: 'acceptEdits' })
    assert.equal(res.status, 200)
    const saved = getAgent(env.db, 'coder')!
    assert.equal(saved.model, 'claude-sonnet-5-5')
    assert.equal(saved.effort, 'high')
    assert.equal(saved.permission_mode, 'acceptEdits')
  })

  test('the bot list shows how many messages wait for each bot', async () => {
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'one' })
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'two' })
    const body = await (await call('GET', '/bots')).json() as { agents: { name: string; queued: number }[] }
    assert.equal(body.agents.find((a) => a.name === 'coder')?.queued, 2)
    assert.equal(body.agents.find((a) => a.name === 'planner')?.queued, 0)
  })
})
