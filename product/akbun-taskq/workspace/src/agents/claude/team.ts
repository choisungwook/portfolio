import { join } from 'node:path'
import {
  createSdkMcpServer, query as sdkQuery, tool,
  type HookCallback, type Options, type SDKMessage, type SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { Config } from '../../config.ts'
import { claudeExecutable } from '../../resources.ts'
import { decideTeamRead, tamperOf } from '../../worker/gate.ts'
import { ToolError, type TeamTool } from '../../team/tools.ts'
import type { TeamBackend, TurnRequest, TurnResult } from '../../team/types.ts'
import { buildEnv } from './auth.ts'

export type TeamQueryFn = (params: { prompt: AsyncIterable<SDKUserMessage>; options: Options }) => AsyncIterable<SDKMessage>

const SERVER = 'team'
const READ_TOOLS = ['Read', 'Glob', 'Grep']
const INFERENCE_AUTH_ERRORS = new Set(['authentication_failed', 'cloud_credential_error'])
const MISSING_SESSION = /no conversation found|session .* not found/i

// A resident agent is one Claude session that is resumed for every turn, not a process that stays up. The session file
// survives a taskq restart, so the agent keeps its conversation; an idle agent costs nothing.
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
    // The abort the read hook triggers on a tamper attempt surfaces as an error; report the attempt, not the abort.
    if (state.tampered) return { outcome: 'failed', error: state.tampered, tampered: state.tampered, session_id: sessionId }
    throw error
  } finally {
    request.signal.removeEventListener('abort', onAbort)
  }
  return { outcome: 'failed', error: 'session ended without a result', session_id: sessionId, auth_failed: authFailed || undefined }
}

function optionsFor(config: Config, request: TurnRequest, abort: AbortController, state: { tampered?: string }): Options {
  return {
    cwd: request.cwd,
    env: buildEnv(config),
    pathToClaudeCodeExecutable: claudeExecutable(),
    model: config.model,
    // The built-in tool set is cut to the read tools, and nothing from the user's settings is loaded: no hooks, no
    // permission rules, no MCP servers, no skills. The team server below is the only way the agent changes anything.
    tools: READ_TOOLS,
    settingSources: [],
    strictMcpConfig: true,
    mcpServers: { [SERVER]: serverFor(request.tools) },
    permissionMode: 'dontAsk',
    allowedTools: [...READ_TOOLS, ...request.tools.map((t) => `mcp__${SERVER}__${t.name}`)],
    hooks: { PreToolUse: [{ hooks: [readGate(config, request, abort, state)] }] },
    maxTurns: config.bots.turnMaxTurns,
    maxBudgetUsd: config.bots.turnBudgetUsd,
    resume: request.resume ?? undefined,
    abortController: abort,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: request.system },
  }
}

// allowedTools lets every Read through the permission check, so the path rule lives in a hook, which runs first and
// whose deny holds in every permission mode. A hook that throws denies. A read of taskq's own data or config ends the
// turn as tampered, as it ends a task run (knowledge/decisions/2026-11-tamper-stops-run.md).
function readGate(config: Config, request: TurnRequest, abort: AbortController, state: { tampered?: string }): HookCallback {
  return async (input) => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    if (input.tool_name.startsWith(`mcp__${SERVER}__`)) return {}
    let allowed = false
    try {
      const toolInput = typeof input.tool_input === 'object' && input.tool_input !== null ? input.tool_input as Record<string, unknown> : {}
      const dataDir = join(config.home, 'data')
      const tamper = tamperOf(input.tool_name, toolInput, { cwd: request.cwd, outputs: request.cwd, dataDir })
      if (tamper !== null) {
        state.tampered ??= tamper
        abort.abort()
      } else {
        allowed = decideTeamRead(input.tool_name, toolInput, { cwd: request.cwd, roots: request.readRoots, dataDir }) === 'allow'
      }
    } catch {
      allowed = false
    }
    if (allowed) return {}
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse', permissionDecision: 'deny',
        permissionDecisionReason: `You may read only your own folder and: ${request.readRoots.join(', ') || 'nothing else'}.`,
      },
    }
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
