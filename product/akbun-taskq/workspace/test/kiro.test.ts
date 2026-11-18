import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { createKiroTeamBackend, type KiroSpawn } from '../src/agents/kiro/team.ts'
import { startLogin } from '../src/agents/kiro/login.ts'
import { getAgent, listTurns, postMessage, USER, updateAgent } from '../src/db/team.ts'
import { createTeamHub, type TeamHub } from '../src/team/hub.ts'
import type { TurnRequest } from '../src/team/types.ts'
import { teamChanged } from '../src/wake.ts'
import { seedTestBots, setup, waitFor, TOKEN, type TestEnv } from './helpers.ts'

// Kiro bots: headless kiro-cli in the bot's folder, signed in with the user's AWS SSO session. No kiro-cli runs here.

describe('kiro bots', () => {
  let env: TestEnv
  let hub: TeamHub | undefined
  let request: TurnRequest
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'kiro', permission_mode: 'acceptEdits' })
    const cwd = join(env.home, 'team', 'coder')
    mkdirSync(cwd, { recursive: true })
    request = {
      agent: getAgent(env.db, 'coder')!, system: 'You are coder.', prompt: '1 new message', tools: [], cwd, plugins: [],
      sharedDir: join(env.home, 'shared'), maxTurns: 10, budgetUsd: 1, resume: null, signal: new AbortController().signal,
      skills: [{ name: 'notes', description: 'd', path: '/skills/notes' }], mcpServers: [{ name: 'github', command: 'npx', args: ['gh'], description: '' }],
    }
  })
  test.afterEach(async () => {
    await hub?.stop()
    hub = undefined
    env.cleanup()
  })

  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown) =>
    createApp({ db: env.db, config: env.config }, TOKEN).request(`/api${path}`, {
      method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body),
    })

  test('[critical] a turn writes the bot as a Kiro agent and runs kiro-cli headless with its trust list; usage is read from the records', async () => {
    const calls: { command: string; args: string[]; cwd: string }[] = []
    const kiro: KiroSpawn = async function* (command, args, cwd) {
      calls.push({ command, args, cwd })
      yield 'warning: plain text'
      yield JSON.stringify({ type: 'session', sessionId: 'k-1' })
      yield JSON.stringify({ type: 'completion', usage: { input_tokens: 700, output_tokens: 90 }, credits: 0.4, contextUsagePercentage: 12.5 })
    }
    const result = await createKiroTeamBackend(kiro).runTurn(env.config, request)
    assert.equal(result.outcome, 'done')
    assert.equal(result.session_id, 'k-1')
    assert.deepEqual(result.usage, { input_tokens: 700, output_tokens: 90, credits: 0.4 })
    assert.deepEqual(result.context, { tokens: 125, window: 1000 })
    const { command, args, cwd } = calls[0]
    assert.equal(command, 'kiro-cli')
    assert.equal(cwd, join(env.home, 'team', 'coder'))
    assert.deepEqual(args.slice(0, 7), ['chat', '--v3', '--no-interactive', '--output-format', 'stream-json', '--agent', 'taskq-coder'])
    assert.ok(args.includes('--trust-tools=@builtin,@mcp'))
    assert.equal(args.at(-1), '1 new message')
    const agent = JSON.parse(readFileSync(join(cwd, '.kiro', 'agents', 'taskq-coder.json'), 'utf8')) as Record<string, unknown>
    assert.equal(agent.prompt, 'You are coder.')
    assert.deepEqual(agent.tools, ['read', 'write', '@taskq', '@github'])
    assert.deepEqual(agent.resources, ['skill:///skills/notes/SKILL.md'])
    assert.deepEqual((agent.mcpServers as Record<string, { args: string[] }>).taskq.args.slice(-3), ['mcp', '--bot', 'coder'])

    await createKiroTeamBackend(kiro).runTurn(env.config, { ...request, resume: 'k-1' })
    assert.ok(calls[1].args.join(' ').includes('--resume-id k-1'))
    await createKiroTeamBackend(kiro).runTurn(env.config, { ...request, resume: 'kiro:latest', agent: { ...request.agent, permission_mode: 'bypassPermissions', sandbox: true } })
    assert.ok(calls[2].args.includes('--resume') && calls[2].args.includes('--trust-all-tools') && calls[2].args.includes('--sandbox'))
  })

  test('a missing kiro-cli and a lost login are reported; the hub runs Kiro bots on the Kiro backend', async () => {
    const missing: KiroSpawn = async function* () {
      yield* failWith('spawn kiro-cli ENOENT')
    }
    assert.match((await createKiroTeamBackend(missing).runTurn(env.config, request)).error ?? '', /kiro-cli was not found/)
    const expired: KiroSpawn = async function* () {
      yield* failWith('kiro-cli exited with code 1: Not logged in. Run kiro-cli login')
    }
    assert.equal((await createKiroTeamBackend(expired).runTurn(env.config, request)).auth_failed, true)
    const seen: string[] = []
    hub = createTeamHub({
      db: env.db, config: env.config, retryAfterSec: 0,
      backend: { async runTurn(_c, r) { seen.push(`claude:${r.agent.name}`); return { outcome: 'done', cost_usd: 0 } } },
      backends: { kiro: { sdk: 'kiro', async runTurn(_c, r) { seen.push(`kiro:${r.agent.name}`); return { outcome: 'done', cost_usd: 0, usage: { input_tokens: 5, output_tokens: 1, credits: 0.2 } } } } },
    })
    await hub.start()
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => listTurns(env.db, 5).some((t) => t.ended_at !== null))
    assert.deepEqual(seen, ['kiro:coder'])
    const usage = await (await call('GET', '/usage?period=all')).json() as { by_sdk: { sdk: string; credits: number; input_tokens: number }[] }
    assert.deepEqual(usage.by_sdk.map((r) => [r.sdk, r.credits, r.input_tokens]), [['kiro', 0.2, 5]])
  })

  test('[critical] the SSO login shows the device code and URL; bad start URLs and regions are refused', async () => {
    assert.equal((await call('POST', '/kiro/login', { start_url: 'http://evil', region: 'us-east-1' })).status, 400)
    const fakeChild = () => {
      const child = new EventEmitter() as ChildProcess
      const stdout = new PassThrough()
      Object.assign(child, { stdout, stderr: new PassThrough(), kill: () => true })
      setTimeout(() => stdout.write('Open https://device.sso.us-east-1.amazonaws.com/ and enter code ABCD-EFGH\n'), 5)
      return child
    }
    const runs: string[][] = []
    const state = await startLogin(env.config, { start_url: 'https://acme.awsapps.com/start', region: 'us-east-1' }, (_c, args) => {
      runs.push(args)
      return fakeChild()
    })
    assert.equal(state.url, 'https://device.sso.us-east-1.amazonaws.com/')
    assert.equal(state.code, 'ABCD-EFGH')
    assert.deepEqual(runs[0], ['login', '--identity-provider', 'https://acme.awsapps.com/start', '--region', 'us-east-1', '--use-device-flow'])
    assert.ok(!existsSync(join(env.home, 'kiro-token')), 'taskq stores no token')
  })
})

// A spawn that fails the way a missing or signed-out CLI does.
async function* failWith(message: string): AsyncGenerator<string> {
  yield* []
  throw new Error(message)
}
