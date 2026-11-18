import { join } from 'node:path'
import {
  createSdkMcpServer, query as sdkQuery, tool,
  type HookCallback, type Options, type SDKMessage, type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Config } from '../../config.ts'
import { claudeExecutable } from '../../resources.ts'
import { botGate } from '../../team/bot-gate.ts'
import { ToolError, type TeamTool } from '../../team/tools.ts'
import type { TeamBackend, TurnRequest, TurnResult } from '../../team/types.ts'
import { buildEnv } from './auth.ts'

export type TeamQueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => AsyncIterable<SDKMessage>

const SERVER = 'team'
const INFERENCE_AUTH_ERRORS = new Set(['authentication_failed', 'cloud_credential_error'])
const MISSING_SESSION = /no conversation found|session .* not found/i

// A bot is one Claude session that is resumed for every turn, not a process that stays up. The session file survives a
// taskq restart, so the bot keeps its conversation; an idle bot costs nothing. The bot's settings decide its tools'
// reach: permission mode (auto by default), sandbox (off by default) and blocked commands (none by default).
export function createClaudeTeamBackend(runQuery: TeamQueryFn = sdkQuery): TeamBackend {
  return {
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
  try {
    for await (const message of runQuery({ prompt: once(request.prompt), options: optionsFor(config, request, abort, state) })) {
      if (message.type === 'system' && message.subtype === 'init') sessionId = message.session_id
      else if (message.type === 'assistant' && message.error && INFERENCE_AUTH_ERRORS.has(message.error)) authFailed = true
      else if (message.type === 'result') {
        const base = { session_id: sessionId ?? message.session_id, turns: message.num_turns, cost_usd: message.total_cost_usd }
        if (state.tampered) return { ...base, outcome: 'failed', error: state.tampered, tampered: state.tampered }
        if (authFailed) return { ...base, outcome: 'failed', error: 'model provider login failed', auth_failed: true }
        if (message.subtype === 'success') return { ...base, outcome: 'done' }
        return { ...base, outcome: 'failed', error: message.errors.length > 0 ? message.errors.join('; ').slice(0, 300) : message.subtype }
      }
    }
  } catch (error) {
    // The abort the gate triggers on a tamper attempt surfaces as an error; report the attempt, not the abort.
    if (state.tampered) return { outcome: 'failed', error: state.tampered, tampered: state.tampered, session_id: sessionId }
    throw error
  } finally {
    request.signal.removeEventListener('abort', onAbort)
  }
  return { outcome: 'failed', error: 'session ended without a result', session_id: sessionId, auth_failed: authFailed || undefined }
}

function optionsFor(config: Config, request: TurnRequest, abort: AbortController, state: { tampered?: string }): Options {
  const agent = request.agent
  const dataDir = join(config.home, 'data')
  return {
    cwd: request.cwd,
    env: buildEnv(config),
    pathToClaudeCodeExecutable: claudeExecutable(),
    model: agent.model ?? config.model,
    // The user's own Claude settings are not loaded: a bot is what its settings say, nothing more. Skills and plugins
    // come from the bot's snapshot (src/team/bot-plugin.ts). Plugin MCP servers load only when the bot has plugins.
    settingSources: [],
    // The skill copy is taskq's own plugin with skills only; it never brings MCP servers.
    plugins: request.plugins.map((path) => (path.endsWith('skills-plugin') ? { type: 'local' as const, path, skipMcpDiscovery: true } : { type: 'local' as const, path })),
    strictMcpConfig: request.plugins.length === 0,
    mcpServers: { [SERVER]: serverFor(request.tools) },
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
      filesystem: { allowWrite: [request.cwd, request.sharedDir], denyRead: [dataDir, join(config.home, 'taskq.config.json')] },
      network: { allowedDomains: agent.allowed_domains },
    } : undefined,
    maxTurns: request.maxTurns,
    maxBudgetUsd: request.budgetUsd,
    additionalDirectories: [request.sharedDir],
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
    if (input.tool_name.startsWith(`mcp__${SERVER}__`)) return {}
    let reason: string
    try {
      const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? input.tool_input as Record<string, unknown> : {}
      const verdict = botGate(config, request.agent, request.cwd, input.tool_name, toolInput)
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
    return { content: [{ type: 'text', text: JSON.stringify(t.handler(args)) }] }
  } catch (error) {
    const message = error instanceof ToolError ? error.message : `tool failed: ${error instanceof Error ? error.message : String(error)}`
    return { isError: true, content: [{ type: 'text', text: message }] }
  }
}

// Custom SDK MCP tools need the streaming input form of the prompt, so the turn's text is sent as a one-message stream.
async function* once(text: string): AsyncIterable<SDKUserMessage> {
  yield { type: 'user', message: { role: 'user', content: text }, parent_tool_use_id: null }
}
