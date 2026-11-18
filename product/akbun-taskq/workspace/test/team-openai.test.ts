import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createOpenAITeamBackend, type OpenAIRunArgs, type OpenAIRunFn } from '../src/agents/openai/team.ts'
import type { CodexSpawn } from '../src/agents/openai/codex.ts'
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
    assert.equal(result.outcome, 'done')
    assert.equal(result.session_id, 'resp-1')
    assert.equal(result.turns, 4)
    assert.equal(result.cost_usd, 1.25 + 1)
    assert.deepEqual(result.usage, { input_tokens: 1_000_000, output_tokens: 100_000 })
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

  test('[critical] a Bedrock bot keeps its conversation itself and starts empty after a reset', async () => {
    const seen: OpenAIRunArgs[] = []
    const run: OpenAIRunFn = async (args) => {
      seen.push(args)
      return { inputTokens: 10, outputTokens: 5, requests: 1, lastInputTokens: 900, history: [...(args.history ?? []), { role: 'user', content: args.input }, { role: 'assistant', content: 'ok' }] }
    }
    const bedrock = { ...request, agent: { ...request.agent, provider: 'bedrock' as const } }
    const first = await createOpenAITeamBackend(run).runTurn(env.config, { ...bedrock, resume: null })
    assert.equal(first.session_id, 'local:coder')
    assert.deepEqual(first.context, { tokens: 900, window: 128_000 })
    assert.equal(seen[0].provider, 'bedrock')
    assert.equal(seen[0].model, 'openai.gpt-oss-120b-1:0')
    assert.equal(seen[0].previousResponseId, undefined)
    await createOpenAITeamBackend(run).runTurn(env.config, { ...bedrock, resume: 'local:coder', prompt: 'second' })
    assert.equal(seen[1].history?.length, 2, 'the second turn carries the first')
    await createOpenAITeamBackend(run).runTurn(env.config, { ...bedrock, resume: null, prompt: 'after reset' })
    assert.deepEqual(seen[2].history, [])
  })

  test('[critical] a ChatGPT-plan bot runs codex exec with its sandbox, team tools over MCP, and resumes its thread', async () => {
    const calls: { command: string; args: string[]; input: string }[] = []
    const codex: CodexSpawn = async function* (command, args, input) {
      calls.push({ command, args, input })
      yield JSON.stringify({ type: 'thread.started', thread_id: 'th-1' })
      yield JSON.stringify({ type: 'turn.started' })
      yield JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 5000, cached_input_tokens: 4000, output_tokens: 300 } })
    }
    const agent = { ...request.agent, provider: 'chatgpt' as const, permission_mode: 'acceptEdits' as const, effort: 'high' as const }
    const result = await createOpenAITeamBackend(undefined, fetch, codex).runTurn(env.config, { ...request, agent, resume: 'th-0' })
    assert.equal(result.outcome, 'done')
    assert.equal(result.session_id, 'th-1')
    assert.equal(result.cost_usd, 0, 'the plan has no per-turn price')
    assert.deepEqual(result.usage, { input_tokens: 5000, output_tokens: 300, cache_read_tokens: 4000, cache_write_tokens: 0 })
    const { command, args, input } = calls[0]
    assert.equal(command, 'codex')
    assert.equal(input, '1 new message')
    assert.deepEqual(args.slice(0, 2), ['exec', '--experimental-json'])
    assert.ok(args.includes('workspace-write') && args.includes('--skip-git-repo-check'))
    assert.ok(args.join(' ').includes(`mcp_servers.taskq.args=`) && args.join(' ').includes('"--bot", "coder"'))
    assert.ok(args.includes('approval_policy="never"') && args.includes('model_reasoning_effort="high"'))
    assert.deepEqual(args.slice(-2), ['resume', 'th-0'])
    const failing: CodexSpawn = async function* () { throw new Error('spawn codex ENOENT') }
    const missing = await createOpenAITeamBackend(undefined, fetch, failing).runTurn(env.config, { ...request, agent })
    assert.match(missing.error ?? '', /Codex CLI was not found/)
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
