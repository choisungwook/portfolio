import { join } from 'node:path'
import {
  createSdkMcpServer, query as sdkQuery, tool,
  type HookCallback, type ModelInfo, type Options, type SDKMessage, type SDKUserMessage, type SlashCommand,
} from '@anthropic-ai/claude-agent-sdk'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Config } from '../../config.ts'
import { claudeExecutable } from '../../resources.ts'
import { botGate } from '../../team/bot-gate.ts'
import { ToolError, type TeamTool } from '../../team/tools.ts'
import type { Catalog, CatalogRequest, TeamBackend, TurnRequest, TurnResult } from '../../team/types.ts'
import { buildEnv, configForBot } from './auth.ts'
import { LiveInput } from '../../team/live-input.ts'
import { worktreesDir } from '../../workspace/worktree.ts'
import { modelName } from '../../team/model-name.ts'
import { COMPACTION_SETTINGS } from './compaction.ts'

export type TeamQueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => AsyncIterable<SDKMessage>

const SERVER = 'team'
const INFERENCE_AUTH_ERRORS = new Set(['authentication_failed', 'cloud_credential_error'])
const MISSING_SESSION = /no conversation found|session .* not found/i

// A bot is one Claude session that is resumed for every turn, not a process that stays up. The session file survives a
// taskq restart, so the bot keeps its conversation; an idle bot costs nothing. The bot's settings decide its tools'
// reach: permission mode (auto by default), sandbox (off by default) and blocked commands (none by default).
export function createClaudeTeamBackend(runQuery: TeamQueryFn = sdkQuery): TeamBackend {
  return {
    sdk: 'claude',
    supportsLiveInput: true,
    catalog: (config, request) => claudeCatalog(config, request, runQuery),
    async runTurn(config, request) {
      try {
        return await runTurn(config, request, runQuery)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (request.resume && MISSING_SESSION.test(message)) return { outcome: 'failed', error: message.slice(0, 300), session_missing: true }
        if (/authentication_failed|cloud_credential_error|invalid x-api-key|status code 401/i.test(message)) {
          return { outcome: 'failed', error: 'model provider login failed', auth_failed: true }
        }
        return { outcome: 'failed', error: message.slice(0, 300) }
      }
    },
  }
}

async function runTurn(config: Config, request: TurnRequest, runQuery: TeamQueryFn): Promise<TurnResult> {
  const abort = new AbortController()
  const onAbort = () => abort.abort()
  request.signal.addEventListener('abort', onAbort, { once: true })
  let sessionId: string | undefined
  let authFailed = false
  const state: { tampered?: string } = {}
  // The turn ends when the session has answered every input: the first prompt and whatever the hub pushed while the bot
  // was working. One result may answer several inputs (user_message_uuids). num_turns is per result, so it adds up;
  // total_cost_usd is the session's running total, so the latest one is kept and the hub turns it into this turn's cost.
  const live = request.live ?? new LiveInput()
  let turns = 0
  let total = 0
  // Tokens add up over the turn's results; the context is the last model call's input (with cache) against the model's
  // context window, which modelUsage reports.
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
  let context: { tokens: number; window: number | null } | undefined
  let model: string | undefined
  try {
    for await (const message of runQuery({ prompt: userMessages(live, request.prompt), options: optionsFor(config, request, abort, state) })) {
      if (message.type === 'system' && message.subtype === 'init') sessionId = message.session_id
      // A compaction shows in the bot's conversation like a step, so a shorter memory of the past has a visible reason.
      else if (message.type === 'system' && message.subtype === 'compact_boundary') {
        const { trigger, pre_tokens: tokens } = message.compact_metadata
        request.onStep?.('Compact', { description: `${trigger === 'auto' ? 'Auto' : 'Manual'}-compacted ${tokens.toLocaleString('en-US')} tokens of conversation` })
      }
      else if (message.type === 'assistant' && message.error && INFERENCE_AUTH_ERRORS.has(message.error)) authFailed = true
      else if (message.type === 'assistant') {
        const u = message.message.usage
        if (u) context = { tokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), window: context?.window ?? null }
        model = message.message.model ?? model
      }
      else if (message.type === 'result') {
        turns += message.num_turns
        total = message.total_cost_usd
        usage.input_tokens += message.usage?.input_tokens ?? 0
        usage.output_tokens += message.usage?.output_tokens ?? 0
        usage.cache_read_tokens += message.usage?.cache_read_input_tokens ?? 0
        usage.cache_write_tokens += message.usage?.cache_creation_input_tokens ?? 0
        const windows = Object.values(message.modelUsage ?? {}).map((m) => m.contextWindow).filter((w) => w > 0)
        if (context && windows.length) context = { ...context, window: Math.max(...windows) }
        const ids = message.user_message_uuids ?? (message.user_message_uuid ? [message.user_message_uuid] : undefined)
        live.answer(ids, !ids && message.queued_turn_count === 0)
        const base = { session_id: sessionId ?? message.session_id, turns, session_total_usd: total, usage: { ...usage }, context, model }
        const failed = message.subtype !== 'success'
        const pending = live.unanswered() > 0 || (message.queued_turn_count ?? 0) > 0
        if (state.tampered || authFailed || failed || !pending) live.close()
        if (state.tampered) return { ...base, outcome: 'failed', error: state.tampered, tampered: state.tampered }
        if (authFailed) return { ...base, outcome: 'failed', error: 'model provider login failed', auth_failed: true }
        if (failed) return { ...base, outcome: 'failed', error: message.errors.length > 0 ? message.errors.join('; ').slice(0, 300) : message.subtype }
        if (live.isClosed()) return { ...base, outcome: 'done' }
      }
    }
  } catch (error) {
    // The abort the gate triggers on a tamper attempt surfaces as an error; report the attempt, not the abort.
    if (state.tampered) return { outcome: 'failed', error: state.tampered, tampered: state.tampered, session_id: sessionId }
    throw error
  } finally {
    live.close()
    request.signal.removeEventListener('abort', onAbort)
  }
  return { outcome: 'failed', error: 'session ended without a result', session_id: sessionId, auth_failed: authFailed || undefined }
}

function optionsFor(config: Config, request: TurnRequest, abort: AbortController, state: { tampered?: string }): Options {
  const agent = request.agent
  const dataDir = join(config.home, 'data')
  return {
    cwd: request.cwd,
    env: buildEnv(configForBot(config, agent)),
    pathToClaudeCodeExecutable: claudeExecutable(),
    model: agent.model ?? config.model,
    // The user's own Claude settings are not loaded: a bot is what its settings say, nothing more. Skills and plugins
    // come from the bot's snapshot (src/team/bot-plugin.ts). Plugin MCP servers load only when the bot has plugins.
    settingSources: [],
    settings: COMPACTION_SETTINGS,
    // The skill copy is taskq's own plugin with skills only; it never brings MCP servers.
    plugins: request.plugins.map((path) => (path.endsWith('skills-plugin') ? { type: 'local' as const, path, skipMcpDiscovery: true } : { type: 'local' as const, path })),
    strictMcpConfig: request.plugins.length === 0,
    // The bots' own tools, plus the registered MCP servers this bot picked (started over stdio by Claude Code).
    mcpServers: {
      ...Object.fromEntries((request.mcpServers ?? []).map((s) => [s.name, { type: 'stdio' as const, command: s.command, args: s.args }])),
      [SERVER]: serverFor(request.tools),
    },
    permissionMode: agent.permission_mode,
    allowDangerouslySkipPermissions: agent.permission_mode === 'bypassPermissions' || undefined,
    allowedTools: request.tools.map((t) => `mcp__${SERVER}__${t.name}`),
    // Nobody watches a bot's turn, so a call its mode would ask about is refused with a reason instead of waiting.
    canUseTool: async () => ({ behavior: 'deny', message: 'Nobody is present to approve this. Change this bot\'s permission mode, or ask the user through the orchestrator.' }),
    hooks: { PreToolUse: [{ hooks: [gateHook(config, request, abort, state)] }] },
    sandbox: agent.sandbox ? {
      enabled: true,
      failIfUnavailable: true,
      allowUnsandboxedCommands: false,
      filesystem: { allowWrite: [request.cwd, request.sharedDir, worktreesDir(config)], denyRead: [dataDir, join(config.home, 'taskq.config.json'), join(config.home, 'browser')] },
      network: { allowedDomains: agent.allowed_domains },
    } : undefined,
    effort: agent.effort ?? undefined,
    maxTurns: request.maxTurns,
    // The shared folder, and the task worktrees a bot works in when it starts a code task.
    additionalDirectories: [request.sharedDir, worktreesDir(config)],
    resume: request.resume ?? undefined,
    abortController: abort,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: request.system },
  }
}

// The bot's gate (src/team/bot-gate.ts) as a PreToolUse hook, which runs before the permission mode and whose deny
// holds in every mode. A call that reaches taskq itself ends the turn as tampered. A hook that throws denies.
function gateHook(config: Config, request: TurnRequest, abort: AbortController, state: { tampered?: string }): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? input.tool_input as Record<string, unknown> : {}
    try {
      request.onStep?.(input.tool_name, toolInput)
    } catch { /* showing the step must never stop the call */ }
    if (input.tool_name.startsWith(`mcp__${SERVER}__`)) return {}
    let reason: string
    try {
      const verdict = botGate(config, request.agent, request.cwd, input.tool_name, toolInput, request.approvals)
      if (verdict.action === 'allow') return {}
      if (verdict.action === 'stop') {
        state.tampered ??= verdict.reason
        abort.abort()
        reason = 'This call reaches taskq itself. The turn is stopped for review.'
      } else {
        reason = verdict.reason
      }
    } catch {
      reason = 'The gate check failed, so the call is denied.'
    }
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }
  }
}

function serverFor(tools: TeamTool[]) {
  return createSdkMcpServer({
    name: SERVER,
    tools: tools.map((t) => tool(t.name, t.description, t.input, async (args) => call(t, args as Record<string, unknown>),
      { annotations: { readOnlyHint: t.readOnly } })),
  })
}

export async function call(t: TeamTool, args: Record<string, unknown>): Promise<CallToolResult> {
  try {
    return { content: [{ type: 'text', text: JSON.stringify(await t.handler(args)) }] }
  } catch (error) {
    const message = error instanceof ToolError ? error.message : `tool failed: ${error instanceof Error ? error.message : String(error)}`
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

// Custom SDK MCP tools need the streaming input form of the prompt. The stream stays open while the turn runs, so the
// hub can add messages that arrive meanwhile; it closes once the session has answered them all.
async function* userMessages(live: LiveInput, first: string): AsyncIterable<SDKUserMessage> {
  for await (const input of live.texts(first)) {
    yield { type: 'user', message: { role: 'user', content: input.text }, parent_tool_use_id: null, uuid: input.uuid as SDKUserMessage['uuid'] }
  }
}

// The models the account can use and the slash commands the bot's plugins bring, read from a session that is started
// and closed without a prompt: no model call, no cost. Used by the model menu and the slash command list.
const CATALOG_TIMEOUT_MS = 18_000

async function claudeCatalog(config: Config, request: CatalogRequest, runQuery: TeamQueryFn): Promise<Catalog> {
  let release: () => void = () => {}
  const idle = new Promise<void>((resolve) => { release = resolve })
  // The catalog gives up after 20 s; the session is ended here too so a slow SDK does not leave a process behind.
  const abort = new AbortController()
  const timer = setTimeout(() => { release(); abort.abort() }, CATALOG_TIMEOUT_MS)
  // An input stream that sends nothing and ends when released, so the session starts and answers control requests only.
  const nothing = (): AsyncIterable<SDKUserMessage> => ({
    [Symbol.asyncIterator]: () => ({ next: () => idle.then(() => ({ done: true as const, value: undefined })) }),
  })
  const q = runQuery({
    prompt: nothing(),
    options: {
      cwd: request.cwd, env: buildEnv(configForBot(config, request.agent)), pathToClaudeCodeExecutable: claudeExecutable(), settingSources: [],
      plugins: request.plugins.map((path) => ({ type: 'local' as const, path, skipMcpDiscovery: true })), tools: [], abortController: abort,
    },
  }) as AsyncIterable<SDKMessage> & { supportedModels?: () => Promise<ModelInfo[]>; supportedCommands?: () => Promise<SlashCommand[]> }
  try {
    const [models, commands] = await Promise.all([q.supportedModels?.() ?? [], q.supportedCommands?.() ?? []])
    return {
      models: models.map((m) => ({ id: m.value, name: modelName(m.displayName, m.resolvedModel ?? m.value), description: m.description, efforts: m.supportsEffort ? m.supportedEffortLevels ?? [] : [] })),
      commands: commands.map((c) => ({ name: c.name, description: c.description, hint: c.argumentHint })),
    }
  } finally {
    clearTimeout(timer)
    release()
    try {
      for await (const _ of q) { /* drain until the session exits */ }
    } catch {
      // An aborted session ends with an error; it is closed either way.
    }
  }
}
