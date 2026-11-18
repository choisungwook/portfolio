import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Options } from '@anthropic-ai/claude-agent-sdk'
import { resolveConfig } from '../src/config.ts'
import { createSdkWorker } from '../src/agents/claude/worker.ts'
import { mask } from '../src/mask.ts'
import type { Task, TaskType, WorkerContext, WorkerResult } from '../src/types.ts'
import { fakeQuery, hookOf, init, success } from './fake-query.ts'

// A temp TASKQ_HOME: the worker creates <home>/outputs, and nothing here reaches the real SDK.
const home = mkdtempSync(join(tmpdir(), 'sdk-worker-test-'))
after(() => rmSync(home, { recursive: true, force: true }))
const config = resolveConfig(home)
const outputs = join(home, 'outputs')
const repo = '/work/example-repo'

function taskOf(type: TaskType, extra: Partial<Task> = {}): Task {
  return {
    id: 't-9', type, status: 'running', priority: 0, lock_key: null, claimed_by: null, heartbeat_at: null,
    session_id: null, data: { intent: 'check the example instances', repo }, created_at: 0, updated_at: 0,
    ...extra,
  }
}

// A WorkerContext that records what the worker did through it.
function ctxOf(task: Task, approve: () => Promise<boolean> = async () => true) {
  const events: { kind: string; payload: Record<string, unknown> }[] = []
  const sessions: string[] = [], patches: Record<string, unknown>[] = [], approvals: { tool: string }[] = []
  const ctx: WorkerContext = {
    task, runId: 'run-1', resumeSessionId: null, similar: [], handoffs: [], signal: new AbortController().signal,
    emit: (kind, payload) => { events.push({ kind, payload }) },
    onSession: (id) => { sessions.push(id) },
    patchData: (patch) => { patches.push(patch) },
    requestApproval: async (req) => { approvals.push({ tool: req.tool }); return approve() },
  }
  return { ctx, events, sessions, patches, approvals }
}

const toolInput = (command: string) => ({ tool_name: 'Bash', tool_input: { command }, tool_use_id: 'tu-1', hook_event_name: 'PreToolUse' })
const done = success({ outcome: 'done', summary: 'ok', alerts: [], followups: [] })
const signal = () => ({ signal: new AbortController().signal })

describe('sdk worker', () => {
  test('stores the session id from the init message and returns the structured result', async () => {
    const { query } = fakeQuery(() => [init('sess-42'), success({ outcome: 'done', summary: 'ok', alerts: [], followups: [] })])
    const { ctx, sessions } = ctxOf(taskOf('research'))
    const result = await createSdkWorker(config, { query })(ctx)
    assert.deepEqual(sessions, ['sess-42'])
    assert.equal(result.outcome, 'done')
    assert.equal(result.summary, 'ok')
    assert.equal(result.stats.turns, 2)
  })

  test('the built options carry the sdk settings from the design', async () => {
    const { query, calls } = fakeQuery(() => [done])
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_read')).ctx)
    const options = calls[0] as Options
    assert.equal(options.permissionMode, 'dontAsk')
    assert.deepEqual(options.settingSources, ['user'])
    assert.equal(options.maxTurns, config.maxTurns)
    assert.equal(options.env?.CLAUDE_CODE_USE_BEDROCK, '1')
    assert.equal((options.outputFormat as { type: string }).type, 'json_schema')
    assert.equal(options.systemPrompt && typeof options.systemPrompt === 'object' && 'append' in options.systemPrompt, true)
  })

  test('read-only tasks run in outputs, which the worker creates, and load no MCP servers', async () => {
    const { query, calls } = fakeQuery(() => [done])
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_read')).ctx)
    const options = calls[0] as Options
    assert.equal(options.cwd, outputs)
    assert.ok(existsSync(outputs))
    assert.equal(options.strictMcpConfig, true)
    assert.deepEqual(options.mcpServers, {})
  })

  test('sandbox refuses unsandboxed commands and denies reads of credentials and the data directory', async () => {
    const { query, calls } = fakeQuery(() => [done])
    await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    const sandbox = (calls[0] as Options).sandbox!
    assert.equal(sandbox.allowUnsandboxedCommands, false)
    assert.ok(sandbox.filesystem?.denyRead?.includes(join(home, 'data')))
    assert.ok(sandbox.filesystem?.denyRead?.includes(join(homedir(), '.ssh')))
  })

  test('project settings load only for a code task whose repo is in trustedRepos', async () => {
    const trusted = Object.assign(resolveConfig(home), { trustedRepos: [repo] })
    const run = async (cfg: typeof config, task: Task) => {
      const { query, calls } = fakeQuery(() => [done])
      await createSdkWorker(cfg, { query, headOf: async () => 'head' })(ctxOf(task).ctx)
      return (calls[0] as Options).settingSources
    }
    assert.deepEqual(await run(trusted, taskOf('code')), ['user', 'project'])
    assert.deepEqual(await run(config, taskOf('code')), ['user'])
    assert.deepEqual(await run(trusted, taskOf('ops_change')), ['user'])
  })

  test('a code task records base_commit before the run', async () => {
    const injectedHead = 'injected-head-sha'
    const { query } = fakeQuery(() => [done])
    const { ctx, patches } = ctxOf(taskOf('code'))
    await createSdkWorker(config, { query, headOf: async () => injectedHead })(ctx)
    assert.deepEqual(patches, [{ base_commit: injectedHead }])
    assert.equal(patches[0].base_commit, injectedHead)
  })

  test('security_review prompt names the absolute outputs path and the git commands', async () => {
    const { query, prompts } = fakeQuery(() => [done])
    const task = taskOf('security_review', { data: { intent: 'review', repo, base_commit: 'abc123', review_of: 't-0' } })
    await createSdkWorker(config, { query })(ctxOf(task).ctx)
    assert.ok(prompts[0].includes(`git -C ${repo} diff --no-ext-diff --no-textconv --text abc123`), prompts[0])
    assert.ok(prompts[0].includes(`git -C ${repo} log --oneline abc123..HEAD`), prompts[0])
    assert.ok(prompts[0].includes(outputs), prompts[0])
  })

  test('tool hooks emit tool_call and a tool_result of up to 20000 characters', async () => {
    const long = 'x'.repeat(30000)
    const awsKey = 'AKIAEXAMPLE0000000000'
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PreToolUse')(toolInput('aws ec2 describe-instances --profile p') as never, 'tu-1', signal())
      await hookOf(options, 'PostToolUse')({
        hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, tool_response: `${long} ${awsKey}`, tool_use_id: 'tu-1',
      } as never, 'tu-1', signal())
      return [done]
    })
    const { ctx, events } = ctxOf(taskOf('ops_read'))
    await createSdkWorker(config, { query })(ctx)
    const call = events.find((e) => e.kind === 'tool_call')!
    assert.equal(call.payload.tool, 'Bash')
    const result = events.find((e) => e.kind === 'tool_result')!
    assert.equal(String(result.payload.summary).length, 20003)
    assert.ok(!mask(JSON.stringify(result.payload)).includes(awsKey), 'key must be masked when persisted')
  })

  test('ops_read denies a mutating aws command at the PreToolUse hook', async () => {
    let decision: unknown
    const { query } = fakeQuery(async (options) => {
      decision = await hookOf(options, 'PreToolUse')(toolInput('aws ec2 terminate-instances --instance-ids i-0example') as never, 'tu-1', signal())
      return [done]
    })
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_read')).ctx)
    assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, 'deny')
  })

  test('a gate allow for a read-only aws pipeline is explicit, so the pipeline is not asked again', async () => {
    const decisions: unknown[] = []
    const { query } = fakeQuery(async (options) => {
      const pre = hookOf(options, 'PreToolUse')
      decisions.push(await pre(toolInput('aws ec2 describe-instances --profile p | jq .') as never, 'tu-1', signal()))
      decisions.push(await pre({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: join(outputs, 'a.md') }, tool_use_id: 'x' } as never, 'x', signal()))
      return [done]
    })
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_change')).ctx)
    assert.equal((decisions[0] as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, 'allow')
    assert.deepEqual(decisions[1], {})
  })

  test('[critical] ops_change canUseTool waits for the approval and denies when it resolves false', async () => {
    let resolveApproval!: (value: boolean) => void
    const pending = new Promise<boolean>((resolve) => { resolveApproval = resolve })
    let decision: { behavior: string } | undefined
    const { query } = fakeQuery(async (options) => {
      const pendingDecision = options.canUseTool!('Bash', { command: 'aws ec2 stop-instances' }, { signal: new AbortController().signal } as never)
      let settled = false
      void pendingDecision.then(() => { settled = true })
      await new Promise((resolve) => setTimeout(resolve, 20))
      assert.equal(settled, false, 'canUseTool must wait for the user')
      resolveApproval(false)
      decision = await pendingDecision as { behavior: string }
      return [done]
    })
    const { ctx, approvals } = ctxOf(taskOf('ops_change'), () => pending)
    await createSdkWorker(config, { query })(ctx)
    assert.deepEqual(approvals, [{ tool: 'Bash' }])
    assert.equal(decision?.behavior, 'deny')
  })

  test('[critical] a call that reaches the taskq config stops the run for review', async () => {
    let decision: unknown
    const { query } = fakeQuery(async (options) => {
      decision = await hookOf(options, 'PreToolUse')({
        hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: join(home, 'taskq.config.json') }, tool_use_id: 'tu-7',
      } as never, 'tu-7', signal())
      throw new Error('aborted by hook')
    })
    const { ctx, events } = ctxOf(taskOf('research'))
    const result = await createSdkWorker(config, { query })(ctx)
    assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, 'deny')
    assert.equal(result.outcome, 'failed')
    assert.equal(result.tampered, true)
    assert.ok(events.some((e) => e.kind === 'tamper_blocked'))
  })

  test('[critical] a glob that could match the taskq config stops the run', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PreToolUse')({
        hook_event_name: 'PreToolUse', tool_name: 'Glob', tool_input: { pattern: join(home, 'taskq.config*.json') }, tool_use_id: 'tu-11',
      } as never, 'tu-11', signal())
      throw new Error('aborted by hook')
    })
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    assert.equal(result.tampered, true)
  })

  test('[critical] a call that turns the sandbox off stops the run', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PreToolUse')({
        hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls', dangerouslyDisableSandbox: true }, tool_use_id: 'tu-8',
      } as never, 'tu-8', signal())
      throw new Error('aborted by hook')
    })
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('ops_read')).ctx)
    assert.equal(result.tampered, true)
  })

  test('a write outside the allowed roots is denied without stopping the run', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PreToolUse')({
        hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: '/etc/example.txt', content: 'x' }, tool_use_id: 'tu-9',
      } as never, 'tu-9', signal())
      return [done]
    })
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    assert.equal(result.outcome, 'done')
    assert.equal(result.tampered, undefined)
  })

  test('[critical] a policy check that throws denies the call', async () => {
    let decision: unknown
    const { query } = fakeQuery(async (options) => {
      const input = { get dangerouslyDisableSandbox(): boolean { throw new Error('boom') } }
      decision = await hookOf(options, 'PreToolUse')({
        hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: input, tool_use_id: 'tu-10',
      } as never, 'tu-10', signal())
      return [done]
    })
    const { ctx, events } = ctxOf(taskOf('research'))
    await createSdkWorker(config, { query })(ctx)
    assert.equal((decision as { hookSpecificOutput: { permissionDecision: string } }).hookSpecificOutput.permissionDecision, 'deny')
    assert.ok(events.some((e) => e.kind === 'error' && e.payload.source === 'gate'))
  })

  test('expired target credentials in a failed aws call return needs_auth with target scope', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PostToolUseFailure')({
        hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'aws ec2 describe-instances --profile p' }, tool_use_id: 'tu-2',
        error: 'An error occurred (ExpiredToken) when calling the DescribeInstances operation',
      } as never, 'tu-2', signal())
      throw new Error('aborted by hook')
    })
    const { ctx, events } = ctxOf(taskOf('ops_read'))
    const result: WorkerResult = await createSdkWorker(config, { query })(ctx)
    assert.equal(result.outcome, 'needs_auth')
    assert.equal(result.auth_scope, 'target')
    assert.ok(events.some((e) => e.kind === 'auth_required'))
  })

  test('an aws call that succeeded and printed an expiry message does not stop the run', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PostToolUse')({
        hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'aws ec2 describe-instances --profile p' },
        tool_response: 'ExpiredToken mentioned in a tag', tool_use_id: 'tu-4',
      } as never, 'tu-4', signal())
      return [done]
    })
    const { ctx, events } = ctxOf(taskOf('ops_read'))
    const result = await createSdkWorker(config, { query })(ctx)
    assert.equal(result.outcome, 'done')
    assert.equal(events.some((e) => e.kind === 'auth_required'), false)
  })

  test('an aws call flagged as an error with an expiry message stops the run', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PostToolUse')({
        hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: { command: 'aws ec2 describe-instances --profile p' },
        tool_response: { is_error: true, stdout: 'ExpiredToken' }, tool_use_id: 'tu-5',
      } as never, 'tu-5', signal())
      throw new Error('aborted by hook')
    })
    const { ctx, events } = ctxOf(taskOf('ops_read'))
    const result = await createSdkWorker(config, { query })(ctx)
    assert.equal(result.outcome, 'needs_auth')
    assert.ok(events.some((e) => e.kind === 'auth_required'))
  })

  test('a failed chain whose first segment is not aws does not flip the task to needs_auth', async () => {
    const { query } = fakeQuery(async (options) => {
      await hookOf(options, 'PostToolUseFailure')({
        hook_event_name: 'PostToolUseFailure', tool_name: 'Bash', tool_input: { command: 'cat README.md && aws --version' },
        error: 'ExpiredToken', tool_use_id: 'tu-6',
      } as never, 'tu-6', signal())
      return [done]
    })
    const { ctx, events } = ctxOf(taskOf('ops_read'))
    const result = await createSdkWorker(config, { query })(ctx)
    assert.equal(result.outcome, 'done')
    assert.equal(events.some((e) => e.kind === 'auth_required'), false)
  })

  test('error_max_budget_usd is a budget_exceeded failure', async () => {
    const { query } = fakeQuery(() => [success(undefined, { subtype: 'error_max_budget_usd', errors: ['budget'], total_cost_usd: 5.1 })])
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    assert.equal(result.outcome, 'failed')
    assert.equal(result.budget_exceeded, true)
    assert.equal(result.stats.cost_usd, 5.1)
  })

  test('an authentication failure from the model provider returns needs_auth with inference scope', async () => {
    const { query } = fakeQuery(() => [
      { type: 'assistant', error: 'authentication_failed', session_id: 's' },
      success(undefined, { subtype: 'error_during_execution', errors: [] }),
    ])
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    assert.equal(result.outcome, 'needs_auth')
    assert.equal(result.auth_scope, 'inference')
  })

  test('the PreToolUse hook gates ops_read to read tools and read-only aws', async () => {
    const decisions: string[] = []
    const { query } = fakeQuery(async (options) => {
      const pre = hookOf(options, 'PreToolUse')
      for (const [tool_name, tool_input] of [['Read', { file_path: '/etc/hosts' }], ['WebFetch', { url: 'https://example.com' }], ['Bash', { command: 'aws s3 ls' }]] as const) {
        const out = await pre({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'x' } as never, 'x', signal()) as { hookSpecificOutput?: { permissionDecision: string } }
        decisions.push(out.hookSpecificOutput?.permissionDecision ?? 'pass')
      }
      return [done]
    })
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_read')).ctx)
    assert.deepEqual(decisions, ['deny', 'deny', 'allow'])
  })

  test('the PreToolUse hook sends every non-read ops_change call to the permission prompt', async () => {
    const decisions: string[] = []
    const { query } = fakeQuery(async (options) => {
      const pre = hookOf(options, 'PreToolUse')
      for (const [tool_name, tool_input] of [['Write', { file_path: join(outputs, 'x') }], ['Bash', { command: 'aws s3 ls' }], ['mcp__example__do', {}]] as const) {
        const out = await pre({ hook_event_name: 'PreToolUse', tool_name, tool_input, tool_use_id: 'x' } as never, 'x', signal()) as { hookSpecificOutput?: { permissionDecision: string } }
        decisions.push(out.hookSpecificOutput?.permissionDecision ?? 'pass')
      }
      return [done]
    })
    await createSdkWorker(config, { query })(ctxOf(taskOf('ops_change')).ctx)
    assert.deepEqual(decisions, ['ask', 'allow', 'deny'])
  })

  test('a structured outcome outside the schema becomes failed', async () => {
    const { query, calls } = fakeQuery(() => [success({ outcome: 'needs_approval', summary: 'wait', alerts: [], followups: [] })])
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('ops_change')).ctx)
    assert.equal(result.outcome, 'failed')
    const schema = (calls[0].outputFormat as unknown as { schema: { properties: { outcome: { enum: string[] } } } }).schema
    assert.equal(schema.properties.outcome.enum.includes('needs_approval'), false)
  })

  test('a thrown error becomes a failed result with a short summary', async () => {
    const { query } = fakeQuery(() => { throw new Error('boom'.repeat(200)) })
    const result = await createSdkWorker(config, { query })(ctxOf(taskOf('research')).ctx)
    assert.equal(result.outcome, 'failed')
    assert.ok(result.summary.length <= 300)
  })
})
