import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import type { ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { createKiroTeamBackend, kiroModels, type KiroSpawn } from '../src/agents/kiro/team.ts'
import { startLogin, whoami } from '../src/agents/kiro/login.ts'
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
      sharedDir: join(env.home, 'shared'), maxTurns: 10, resume: null, signal: new AbortController().signal,
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
    const calls: { command: string; args: string[]; input: string; cwd: string }[] = []
    const kiro: KiroSpawn = async function* (command, args, input, cwd) {
      calls.push({ command, args, input, cwd })
      yield 'warning: plain text'
      yield JSON.stringify({ type: 'session', sessionId: 'k-1' })
      yield JSON.stringify({ type: 'completion', usage: { input_tokens: 700, output_tokens: 90 }, credits: 0.4, contextUsagePercentage: 12.5 })
    }
    const result = await createKiroTeamBackend(kiro).runTurn(env.config, { ...request, turnId: 7 })
    assert.equal(result.outcome, 'done')
    assert.equal(result.session_id, 'k-1')
    assert.deepEqual(result.usage, { input_tokens: 700, output_tokens: 90, credits: 0.4 })
    assert.deepEqual(result.context, { tokens: 13, window: 100 }, 'Kiro reports a percentage')
    const { command, args, input, cwd } = calls[0]
    assert.equal(command, 'kiro-cli')
    assert.equal(cwd, join(env.home, 'team', 'coder'))
    assert.deepEqual(args.slice(0, 7), ['chat', '--v3', '--no-interactive', '--output-format', 'stream-json', '--agent', 'taskq-coder'])
    assert.ok(args.includes('--trust-tools=@builtin,@mcp'))
    assert.equal(input, '1 new message', 'the prompt goes in on stdin, not argv')
    assert.ok(!args.includes('1 new message'))
    const agent = JSON.parse(readFileSync(join(cwd, '.kiro', 'agents', 'taskq-coder.json'), 'utf8')) as Record<string, unknown>
    assert.equal(agent.prompt, 'You are coder.')
    assert.deepEqual(agent.tools, ['read', 'write', '@taskq', '@github'])
    assert.deepEqual(agent.resources, ['skill:///skills/notes/SKILL.md'])
    const taskq = (agent.mcpServers as Record<string, { args: string[]; env: Record<string, string> }>).taskq
    assert.deepEqual(taskq.args.slice(-3), ['mcp', '--bot', 'coder'])
    assert.equal(taskq.env.TASKQ_TURN_ID, '7', 'team tool writes count for the turn')

    await createKiroTeamBackend(kiro).runTurn(env.config, { ...request, resume: 'k-1' })
    assert.ok(calls[1].args.join(' ').includes('--resume-id k-1'))
    const unnamed: KiroSpawn = async function* (command, args, input, cwd) {
      calls.push({ command, args, input, cwd })
      yield JSON.stringify({ type: 'completion' })
    }
    const fresh = await createKiroTeamBackend(unnamed).runTurn(env.config, request)
    assert.match(fresh.session_id ?? '', /^kiro:\d+$/, 'an unnamed session gets its own id')
    await createKiroTeamBackend(unnamed).runTurn(env.config, { ...request, resume: fresh.session_id ?? null, agent: { ...request.agent, permission_mode: 'bypassPermissions', sandbox: true } })
    assert.ok(!calls[2].args.includes('--resume'))
    assert.ok(calls[3].args.includes('--resume') && calls[3].args.includes('--trust-all-tools') && calls[3].args.includes('--sandbox'))
  })

  test('a missing kiro-cli and a lost login are reported; the hub runs Kiro bots on the Kiro backend', async () => {
    const missing: KiroSpawn = async function* () {
      yield* failWith('spawn kiro-cli ENOENT')
    }
    const notFound = await createKiroTeamBackend(missing).runTurn(env.config, request)
    assert.match(notFound.error ?? '', /kiro-cli was not found/)
    assert.equal(notFound.cost_usd, 0, 'a failed Kiro turn is not charged the turn budget')
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
    assert.deepEqual(runs[0], ['login', '--use-device-flow', '--identity-provider', 'https://acme.awsapps.com/start', '--license', 'pro', '--region', 'us-east-1'])
    assert.ok(!existsSync(join(env.home, 'kiro-token')), 'taskq stores no token')
  })
})

// What kiro-cli says decides what happens to the bot and its messages: a lost login turns the bot off, a spent quota
// or a refused request is not retried, anything else is retried.
describe('kiro failures and sign-in', () => {
  let env: TestEnv
  let request: TurnRequest
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'kiro' })
    const cwd = join(env.home, 'team', 'coder')
    mkdirSync(cwd, { recursive: true })
    request = { agent: getAgent(env.db, 'coder')!, system: 's', prompt: 'p', tools: [], cwd, plugins: [], sharedDir: join(env.home, 'shared'), maxTurns: 10, resume: null, signal: new AbortController().signal }
  })
  test.afterEach(() => env.cleanup())

  const exits = (text: string): KiroSpawn => async function* () {
    yield* failWith(`kiro-cli exited with code 1: ${text}`)
  }
  const signedOut = async () => ({ signed_out: true })
  const signedIn = async () => ({ signed_out: false })

  test('[critical] a lost login turns the bot off, a spent quota or refused request is not retried, the rest is retried', async () => {
    const turn = (run: KiroSpawn, who = signedIn) => createKiroTeamBackend(run, who).runTurn(env.config, request)
    for (const text of ['ExpiredTokenException: token is expired', 'The bearer token included in the request is invalid', 'SSO session has expired']) {
      assert.equal((await turn(exits(text))).auth_failed, true, text)
    }
    // An error record in the stream counts the same as an exit message.
    const record: KiroSpawn = async function* () {
      yield JSON.stringify({ type: 'error', message: 'Not logged in' })
    }
    assert.equal((await turn(record)).auth_failed, true)
    // Ambiguous words are a lost login only when whoami says so.
    assert.equal((await turn(exits('dispatch failure'), signedOut)).auth_failed, true)
    for (const text of ['HTTP 401 Unauthorized', 'mcp server github: 401 Unauthorized', 'SyntaxError: invalid token at line 3']) {
      assert.equal((await turn(exits(text), signedIn)).auth_failed, undefined, `${text} is not a lost login while whoami is signed in`)
    }
    const other = await turn(exits('AccessDeniedException: not authorized to use this model'), signedIn)
    assert.deepEqual([other.auth_failed, other.rejected], [undefined, undefined])
    const quota = await turn(exits('You have reached your monthly request limit'), signedOut)
    assert.deepEqual([quota.auth_failed, quota.rejected], [undefined, true], 'a quota is not a sign-in problem and not a rate limit')
    assert.equal((await turn(exits('Improperly formed request'))).rejected, true)
    assert.equal((await turn(exits('Too many requests in this session, rate limit exceeded'))).rejected, undefined, 'a rate limit is retried')
    const throttled = await turn(exits('ThrottlingException: rate limit exceeded'))
    assert.deepEqual([throttled.auth_failed, throttled.rejected], [undefined, undefined])
  })

  test('whoami proves a lost login only by a non-zero exit that says so; a timeout proves nothing', async () => {
    const run = (error: object | null, out: string) => whoami(env.config, (_c, _a, done) => done(error as Error | null, out, ''))
    assert.deepEqual(await run(Object.assign(new Error('exit 1'), { code: 1 }), 'Not logged in'), { signed_in: false, signed_out: true, text: 'Not logged in' })
    const slow = await run(Object.assign(new Error('timeout'), { killed: true }), '')
    assert.deepEqual([slow.signed_in, slow.signed_out], [false, false])
    assert.deepEqual(await run(null, 'Logged in with IAM Identity Center'), { signed_in: true, signed_out: false, text: 'Logged in with IAM Identity Center' })
  })

  test('the model menu lists what kiro-cli lists, with text around the JSON ignored', async () => {
    const text = 'warning: update available\n' + JSON.stringify({ models: [
      { model_id: 'auto', model_name: 'Auto', context_window_tokens: 200000, rate_multiplier: 1 },
      { model_id: 'claude-x', model_name: 'Claude X', context_window_tokens: 1000000, rate_multiplier: 2.2 },
    ] })
    assert.deepEqual(kiroModels(text).map((m) => [m.id, m.name, m.description]), [['auto', 'Auto', '200k context, 1x credits'], ['claude-x', 'Claude X', '1000k context, 2.2x credits']])
    assert.deepEqual(kiroModels('not json'), [])
    assert.equal(kiroModels(`warning: [beta] update\n${JSON.stringify([{ model_id: 'auto' }])}\nnote: {done}`).length, 1, 'brackets around the JSON do not hide it')
    const catalog = await createKiroTeamBackend(undefined, undefined, async () => text).catalog!(env.config, { agent: request.agent, cwd: request.cwd, plugins: [] })
    assert.equal(catalog.models.length, 2)
  })

  // The real wrapper, with a stand-in for kiro-cli that behaves the way the login does: it refuses to run without a
  // terminal and asks for the start URL and region even though both were given.
  test('the login runs under a terminal and accepts the start URL and region it is asked for', { skip: !existsSync('/usr/bin/expect') }, async () => {
    const fake = join(env.home, 'fake-kiro')
    writeFileSync(fake, `#!/bin/sh
[ -t 0 ] || { echo "error: not a terminal"; exit 2; }
printf '\\033[1mEnter Start URL\\033[0m (https://acme.awsapps.com/start): '; read a
printf 'Enter Region: '; read b
echo "Open https://device.sso.us-east-1.amazonaws.com/?user_code=WXYZ-1234 and confirm the code: WXYZ-1234."
sleep 5
`)
    chmodSync(fake, 0o755)
    env.config.bots.kiroPath = fake
    const state = await startLogin(env.config, { start_url: 'https://acme.awsapps.com/start', region: 'us-east-1' })
    assert.equal(state.code, 'WXYZ-1234', state.output)
    assert.equal(state.url, 'https://device.sso.us-east-1.amazonaws.com/?user_code=WXYZ-1234', 'the device page, not the start URL the prompt shows')
    assert.doesNotMatch(state.output, /\x1b/, 'colour codes are stripped')
  })
})

// A spawn that fails the way a missing or signed-out CLI does.
async function* failWith(message: string): AsyncGenerator<string> {
  yield* []
  throw new Error(message)
}
