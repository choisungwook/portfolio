import type { HookCallback, HookCallbackMatcher, HookEvent, HookJSONOutput } from '@anthropic-ai/claude-agent-sdk'
import type { WorkerContext } from '../../types.ts'
import { decide, tamperOf, type GateContext, type Decision } from '../../worker/gate.ts'
import { splitSegments } from '../../worker/aws-guard.ts'
import { clip } from '../../worker/text.ts'

// Substrings of tool output that mean the target account login has expired.
const EXPIRED_PATTERNS = [
  'ExpiredToken', 'The SSO session associated with this profile has expired', 'Unable to locate credentials', 'aws sso login',
]
// The runner masks secrets and then clips, so the worker keeps enough output for a whole key block to reach the masker.
const RESULT_CLIP = 20000

export interface RunState { toolCalls: number; expired: boolean; tamper?: string }

export function detectExpiredCredentials(text: string): boolean {
  return EXPIRED_PATTERNS.some((pattern) => text.includes(pattern))
}

// Only a chain whose first segment is aws can report an expired target login. `cat README.md && aws --version` cannot.
export function isAwsChain(command: string): boolean {
  const segments = splitSegments(command)
  return segments !== null && segments[0]?.[0] === 'aws'
}

export function buildHooks(
  ctx: WorkerContext, state: RunState, abort: AbortController, gate: GateContext,
): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const pre: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name !== 'PreToolUse') return {}
    const toolInput = asRecord(input.tool_input)
    state.toolCalls += 1
    ctx.emit('tool_call', { tool: input.tool_name, input: clipInput(toolInput) })
    const tamper = tamperOf(input.tool_name, toolInput, gate)
    if (tamper !== null) {
      if (state.tamper === undefined) {
        state.tamper = tamper
        ctx.emit('tamper_blocked', { tool: input.tool_name, reason: tamper })
        abort.abort()
      }
      return verdict('deny', 'This call reaches taskq itself. The run is stopped for review.')
    }
    const decision = decide(ctx.task.type, input.tool_name, toolInput, gate)
    if (decision === 'allow') return explicitAllow(ctx.task.type, input.tool_name)
    return verdict(decision, decision === 'deny' ? 'This tool is not allowed for this task type.' : 'This call needs the user approval.')
  }

  // A hook that throws would let the SDK fall back to the permission mode, which allows edits in acceptEdits and auto.
  const failClosed = (hook: HookCallback): HookCallback => async (...args) => {
    try {
      return await hook(...args)
    } catch (error) {
      ctx.emit('error', { source: 'gate', error: clip(String(error), 300) })
      return verdict('deny', 'The policy check failed, so the call is denied.')
    }
  }

  const post: HookCallback = async (input): Promise<HookJSONOutput> => {
    if (input.hook_event_name === 'PostToolUse') {
      observe(input.tool_name, stringify(input.tool_response), commandOf(input.tool_input), flagged(input.tool_response))
    } else if (input.hook_event_name === 'PostToolUseFailure') {
      observe(input.tool_name, stringify(input.error), commandOf(input.tool_input), true)
    }
    return {}
  }

  // Emits the result, and stops the run when the target login has expired in a failed aws call.
  function observe(tool: string, text: string, command: string, failed: boolean): void {
    ctx.emit('tool_result', { tool, summary: clip(text, RESULT_CLIP) })
    if (!failed || tool !== 'Bash' || !isAwsChain(command)) return
    if (!state.expired && detectExpiredCredentials(text)) {
      state.expired = true
      ctx.emit('auth_required', { scope: 'target', tool })
      abort.abort()
    }
  }

  return {
    PreToolUse: [{ hooks: [failClosed(pre)] }],
    PostToolUse: [{ hooks: [post] }],
    PostToolUseFailure: [{ hooks: [post] }],
  }
}

function verdict(decision: Exclude<Decision, 'allow'>, reason: string): HookJSONOutput {
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }
}

// The permission rules would otherwise re-ask a pipeline such as `aws ... | jq .`, which only Bash(aws *) covers.
function explicitAllow(type: string, tool: string): HookJSONOutput {
  if ((type !== 'ops_read' && type !== 'ops_change') || tool !== 'Bash') return {}
  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', permissionDecisionReason: 'Read-only aws command.' } }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}
}

function commandOf(toolInput: unknown): string {
  return String(asRecord(toolInput).command ?? '')
}

function clipInput(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === 'string' ? clip(value, 500) : value]))
}

// A Bash result the SDK marks as an error. Only then is an expiry message in the output a failed call.
function flagged(response: unknown): boolean {
  const record = asRecord(response)
  return record.is_error === true || record.isError === true
}

function stringify(value: unknown): string {
  return typeof value === 'string' ? value : (JSON.stringify(value) ?? '')
}
