import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { HookCallback, Options, SDKMessage, SDKUserMessage } from '@anthropic-ai/claude-agent-sdk'
import { createClaudeTeamBackend, call, type TeamQueryFn } from '../src/agents/claude/team.ts'
import { getAgent, seedAgents } from '../src/db/team.ts'
import { ToolError, type TeamTool } from '../src/team/tools.ts'
import type { TurnRequest } from '../src/team/types.ts'
import { LiveInput } from '../src/team/live-input.ts'
import { seedTestBots, setup, type TestEnv } from './helpers.ts'

function fake(script: (options: Options) => unknown[] | Promise<unknown[]>) {
  const calls: Options[] = []
  const prompts: string[] = []
  const query: TeamQueryFn = ({ prompt, options }) => {
    calls.push(options)
    // Like the SDK: the first user message runs the script; each later one (a live push) gets its own result.
    return (async function* () {
      const input = (prompt as AsyncIterable<SDKUserMessage>)[Symbol.asyncIterator]()
      const first = await input.next()
      if (first.done) return
      prompts.push(String(first.value.message.content))
      for (const message of await script(options)) yield message as SDKMessage
      for (;;) {
        const next = await input.next()
        if (next.done) return
        prompts.push(String(next.value.message.content))
        yield done({ num_turns: 1, total_cost_usd: 0.01 }) as unknown as SDKMessage
      }
    })()
  }
  return { query, calls, prompts }
}

const done = (extra: Record<string, unknown> = {}) => ({
  type: 'result', subtype: 'success', session_id: 'sess-1', num_turns: 3, total_cost_usd: 0.02, errors: [], ...extra,
})

describe('claude team backend', () => {
  let env: TestEnv
  let request: TurnRequest
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    const cwd = join(env.home, 'team', 'taskq')
    mkdirSync(cwd, { recursive: true })
    request = {
      agent: getAgent(env.db, 'taskq')!, system: 'orders', prompt: '1 new message', tools: [], cwd,
      plugins: [], sharedDir: join(env.home, 'shared'), maxTurns: 30, budgetUsd: 1, resume: 'sess-0', signal: new AbortController().signal,
    }
  })
  test.afterEach(() => env.cleanup())

  test('[critical] a message pushed into a running turn is answered in the same session before the turn ends', async () => {
    const live = new LiveInput()
    const f = fake(() => {
      assert.equal(live.push('2 new messages'), true)
      return [{ type: 'system', subtype: 'init', session_id: 'sess-1' }, done()]
    })
    const result = await createClaudeTeamBackend(f.query).runTurn(env.config, { ...request, live })
    assert.deepEqual(f.prompts, ['1 new message', '2 new messages'])
    assert.equal(result.outcome, 'done')
    assert.equal(result.turns, 4)
    assert.equal(result.cost_usd, 0.03)
    assert.equal(live.push('too late'), false)
  })

  test('effort reaches the session when the bot sets it', async () => {
    const f = fake(() => [done()])
    await createClaudeTeamBackend(f.query).runTurn(env.config, { ...request, agent: { ...request.agent, effort: 'high' } })
    assert.equal(f.calls[0].effort, 'high')
  })

  test('a turn resumes the session in auto mode, unsandboxed, with no user settings by default', async () => {
    const f = fake(() => [{ type: 'system', subtype: 'init', session_id: 'sess-1' }, done()])
    const result = await createClaudeTeamBackend(f.query).runTurn(env.config, request)
    assert.deepEqual(result, { outcome: 'done', session_id: 'sess-1', turns: 3, cost_usd: 0.02 })
    const options = f.calls[0]
    assert.equal(options.resume, 'sess-0')
    assert.equal(options.tools, undefined)
    assert.equal(options.permissionMode, 'auto')
    assert.equal(options.sandbox, undefined)
    assert.deepEqual(options.plugins, [])
    assert.deepEqual(options.settingSources, [])
    assert.equal(options.strictMcpConfig, true)
    assert.deepEqual(Object.keys(options.mcpServers ?? {}), ['team'])
    assert.equal(options.maxBudgetUsd, 1)
    assert.deepEqual(options.additionalDirectories, [join(env.home, 'shared')])
    assert.deepEqual(f.prompts, ['1 new message'])
  })

  test('the gate stops a call that reaches taskq and refuses blocked commands; nothing else is blocked by default', async () => {
    const decideWith = async (blocked: string[], tool: string, input: Record<string, unknown>) => {
      const f = fake(() => [done()])
      await createClaudeTeamBackend(f.query).runTurn(env.config, { ...request, agent: { ...request.agent, blocked_commands: blocked } })
      const hook = f.calls[0].hooks!.PreToolUse![0].hooks[0] as HookCallback
      const out = await hook({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input } as never, undefined, { signal: new AbortController().signal })
      return (out as { hookSpecificOutput?: { permissionDecision?: string } }).hookSpecificOutput?.permissionDecision ?? 'allow'
    }
    assert.equal(await decideWith([], 'Bash', { command: 'rm -rf build' }), 'allow')
    assert.equal(await decideWith([], 'Read', { file_path: '/etc/hosts' }), 'allow')
    assert.equal(await decideWith([], 'Read', { file_path: join(env.home, 'data', 'taskq.db') }), 'deny')
    assert.equal(await decideWith([], 'Edit', { file_path: join(env.home, 'taskq.config.json') }), 'deny')
    assert.equal(await decideWith(['rm -rf *', 'git push*'], 'Bash', { command: 'cd x && rm -rf build' }), 'deny')
    assert.equal(await decideWith(['git push*'], 'Bash', { command: 'git status' }), 'allow')
    assert.equal(await decideWith(['git push*'], 'mcp__team__wiki_list', {}), 'allow')
  })

  test('settings reach the session: sandbox, permission mode, model and plugins', async () => {
    const f = fake(() => [done()])
    const agent = { ...request.agent, sandbox: true, allowed_domains: ['example.com'], permission_mode: 'acceptEdits' as const, model: 'claude-x' }
    await createClaudeTeamBackend(f.query).runTurn(env.config, { ...request, agent, plugins: ['/p/one'] })
    const options = f.calls[0]
    assert.equal(options.permissionMode, 'acceptEdits')
    assert.equal(options.model, 'claude-x')
    assert.deepEqual(options.sandbox?.network?.allowedDomains, ['example.com'])
    assert.deepEqual(options.plugins, [{ type: 'local', path: '/p/one' }])
    assert.equal(options.strictMcpConfig, false)
  })

  test('a call that reaches taskq ends the turn as tampered', async () => {
    const f = fake(async (options) => {
      const hook = options.hooks!.PreToolUse![0].hooks[0] as HookCallback
      await hook({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: join(env.home, 'data', 'taskq.db') } } as never, undefined, { signal: new AbortController().signal })
      return [done()]
    })
    const result = await createClaudeTeamBackend(f.query).runTurn(env.config, request)
    assert.match(result.tampered ?? '', /data directory/)
  })

  test('a budget stop is a failed turn that keeps the session and cost', async () => {
    const f = fake(() => [done({ subtype: 'error_max_budget_usd', errors: ['budget'] })])
    const result = await createClaudeTeamBackend(f.query).runTurn(env.config, request)
    assert.equal(result.outcome, 'failed')
    assert.equal(result.session_id, 'sess-1')
    assert.equal(result.cost_usd, 0.02)
  })

  test('a resumed session that no longer exists is reported, not retried', async () => {
    const query: TeamQueryFn = () => (async function* () {
      yield* []
      throw new Error('No conversation found with session ID: sess-0')
    })()
    const result = await createClaudeTeamBackend(query).runTurn(env.config, request)
    assert.equal(result.session_missing, true)
  })

  test('a model login error is reported as auth_failed', async () => {
    const f = fake(() => [{ type: 'assistant', error: 'authentication_failed', message: { content: [] } }, done()])
    const result = await createClaudeTeamBackend(f.query).runTurn(env.config, request)
    assert.equal(result.auth_failed, true)
  })

  test('a tool error reaches the model as an error result', async () => {
    const failing: TeamTool = { name: 'x', description: 'x', input: {}, readOnly: true, handler: () => { throw new ToolError('not allowed') } }
    const crashing: TeamTool = { ...failing, handler: () => { throw new Error('db closed') } }
    assert.deepEqual(await call(failing, {}), { isError: true, content: [{ type: 'text', text: 'not allowed' }] })
    assert.match(JSON.stringify(await call(crashing, {})), /tool failed: db closed/)
  })
})
