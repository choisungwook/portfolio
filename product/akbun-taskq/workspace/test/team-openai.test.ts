import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createOpenAITeamBackend, type OpenAIRunArgs, type OpenAIRunFn } from '../src/agents/openai/team.ts'
import { getAgent, listTurns, postMessage, USER, updateAgent } from '../src/db/team.ts'
import { parseBotSettings } from '../src/team/bot-settings.ts'
import { createTeamHub, type TeamHub } from '../src/team/hub.ts'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import type { TeamBackend, TurnRequest } from '../src/team/types.ts'
import { teamChanged } from '../src/wake.ts'
import { seedTestBots, setup, waitFor, type TestEnv } from './helpers.ts'

// OpenAI bots: same hub and tools as Claude bots, a different SDK underneath. No model is called; the SDK run is faked.

describe('openai team backend', () => {
  let env: TestEnv
  let request: TurnRequest
  let hub: TeamHub | undefined
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'openai', permission_mode: 'acceptEdits' })
    const cwd = join(env.home, 'team', 'coder')
    mkdirSync(cwd, { recursive: true })
    const agent = getAgent(env.db, 'coder')!
    request = {
      agent, system: 'orders', prompt: '1 new message', cwd, plugins: [], sharedDir: join(env.home, 'shared'), maxTurns: 30, budgetUsd: 1,
      tools: teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) }), resume: 'resp-0', signal: new AbortController().signal,
    }
    mkdirSync(request.sharedDir, { recursive: true })
  })
  test.afterEach(async () => {
    await hub?.stop()
    hub = undefined
    env.cleanup()
  })

  const fake = (body: (args: OpenAIRunArgs) => Promise<void> | void = () => {}) => {
    const calls: OpenAIRunArgs[] = []
    const run: OpenAIRunFn = async (args) => {
      calls.push(args)
      await body(args)
      return { lastResponseId: 'resp-1', inputTokens: 1_000_000, outputTokens: 100_000, requests: 4 }
    }
    return { run, calls }
  }
  const toolNamed = (args: OpenAIRunArgs, name: string) => args.tools.find((t) => t.name === name)!

  test('[critical] a turn continues the conversation by response id and charges the estimated cost', async () => {
    const f = fake()
    const result = await createOpenAITeamBackend(f.run).runTurn(env.config, request)
    assert.deepEqual(result, { outcome: 'done', session_id: 'resp-1', turns: 4, cost_usd: 1.25 + 1 })
    const args = f.calls[0]
    assert.equal(args.previousResponseId, 'resp-0')
    assert.equal(args.model, 'gpt-5')
    assert.equal(args.instructions, 'orders')
    assert.ok(args.tools.some((t) => t.name === 'send_message'), 'team tools are shared with Claude bots')
    assert.equal((toolNamed(args, 'send_message').parameters as { type: string }).type, 'object')
  })

  test('[critical] the permission mode decides the file and shell tools; there is no auto mode', async () => {
    const names = async (mode: 'plan' | 'acceptEdits' | 'bypassPermissions', sandbox = false) => {
      const f = fake()
      await createOpenAITeamBackend(f.run).runTurn(env.config, { ...request, agent: { ...request.agent, permission_mode: mode, sandbox } })
      return f.calls[0].tools.map((t) => t.name).filter((n) => ['read_file', 'list_dir', 'write_file', 'shell'].includes(n))
    }
    assert.deepEqual(await names('plan'), ['read_file', 'list_dir'])
    assert.deepEqual(await names('acceptEdits'), ['read_file', 'list_dir', 'write_file'])
    assert.deepEqual(await names('bypassPermissions'), ['read_file', 'list_dir', 'write_file', 'shell'])
    assert.deepEqual(await names('bypassPermissions', true), ['read_file', 'list_dir', 'write_file'], 'no unsandboxed shell for a sandboxed bot')
    const known = { skills: new Set<string>(), plugins: new Set<string>() }
    const switched = parseBotSettings({ sdk: 'openai' }, known, getAgent(env.db, 'planner')!)
    assert.equal(switched.ok && switched.value.permission_mode, 'acceptEdits')
    const explicit = parseBotSettings({ sdk: 'openai', permission_mode: 'auto' }, known, getAgent(env.db, 'planner')!)
    assert.equal(explicit.ok, false)
  })

  test('[critical] a file tool that reaches taskq\'s data stops the turn as tampered; writes stay in the bot\'s folders', async () => {
    const writes = fake(async (args) => {
      assert.match(await toolNamed(args, 'write_file').run({ path: 'notes.md', content: 'hi' }), /wrote/)
      assert.match(await toolNamed(args, 'write_file').run({ path: '/tmp/elsewhere.md', content: 'x' }), /^error: write_file is limited/)
      assert.match(await toolNamed(args, 'send_message').run({ to: 'nobody', body: 'x' }), /^error: /)
    })
    await createOpenAITeamBackend(writes.run).runTurn(env.config, request)
    assert.equal(readFileSync(join(request.cwd, 'notes.md'), 'utf8'), 'hi')
    const outside = join(env.home, 'outside.txt')
    writeFileSync(outside, 'keep')
    symlinkSync(outside, join(request.sharedDir, 'link.md'))
    const link = fake(async (args) => {
      assert.match(await toolNamed(args, 'write_file').run({ path: join(request.sharedDir, 'link.md'), content: 'x' }), /^error: /)
    })
    await createOpenAITeamBackend(link.run).runTurn(env.config, request)
    assert.equal(readFileSync(outside, 'utf8'), 'keep', 'a symlink at the file name is not followed')
    const reach = fake(async (args) => {
      await toolNamed(args, 'read_file').run({ path: join(env.home, 'data', 'taskq.db') }).catch(() => {})
      assert.equal(args.signal.aborted, true)
    })
    const result = await createOpenAITeamBackend(reach.run).runTurn(env.config, request)
    assert.equal(result.outcome, 'failed')
    assert.match(result.tampered ?? '', /data directory/)
  })

  test('errors: no key, a rejected key, and a lost conversation', async () => {
    const saved = process.env.OPENAI_API_KEY
    delete process.env.OPENAI_API_KEY
    assert.match((await createOpenAITeamBackend().runTurn(env.config, request)).error ?? '', /OPENAI_API_KEY/)
    if (saved !== undefined) process.env.OPENAI_API_KEY = saved
    const failing = (error: unknown): OpenAIRunFn => async () => { throw error }
    const rejected = await createOpenAITeamBackend(failing(Object.assign(new Error('401'), { status: 401 }))).runTurn(env.config, request)
    assert.equal(rejected.auth_failed, true)
    const lost = await createOpenAITeamBackend(failing(new Error('400 previous_response_not_found'))).runTurn(env.config, request)
    assert.equal(lost.session_missing, true)
  })

  test('[critical] the hub runs an OpenAI bot on the OpenAI backend and a Claude bot on the Claude backend', async () => {
    const seen: string[] = []
    const make = (sdk: string): TeamBackend => ({ async runTurn(_c, r) { seen.push(`${sdk}:${r.agent.name}`); return { outcome: 'done', cost_usd: 0 } } })
    hub = createTeamHub({ db: env.db, config: env.config, backend: make('claude'), backends: { openai: make('openai') }, retryAfterSec: 0 })
    await hub.start()
    postMessage(env.db, { sender: USER, recipient: 'coder', body: 'hi' })
    postMessage(env.db, { sender: USER, recipient: 'planner', body: 'hi' })
    teamChanged.notify()
    await waitFor(() => listTurns(env.db, 5).filter((t) => t.ended_at !== null).length === 2)
    assert.deepEqual(seen.sort(), ['claude:planner', 'openai:coder'])
  })
})
