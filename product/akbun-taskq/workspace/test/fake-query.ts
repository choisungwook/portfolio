import type { HookCallback, Options, SDKMessage } from '@anthropic-ai/claude-agent-sdk'
import type { QueryFn } from '../src/worker/sdk-worker.ts'

// A fake SDK query: `script` receives the options the worker built and returns the messages to yield.
// It may call the hooks and canUseTool itself, the way the SDK would during a run.
export function fakeQuery(script: (options: Options) => Promise<unknown[]> | unknown[]): { query: QueryFn; calls: Options[]; prompts: string[] } {
  const calls: Options[] = []
  const prompts: string[] = []
  const query: QueryFn = ({ prompt, options }) => {
    calls.push(options)
    prompts.push(prompt)
    return (async function* () {
      for (const message of await script(options)) yield message as SDKMessage
    })()
  }
  return { query, calls, prompts }
}

export function hookOf(options: Options, event: 'PreToolUse' | 'PostToolUse' | 'PostToolUseFailure'): HookCallback {
  const matchers = options.hooks?.[event] ?? []
  return matchers[0].hooks[0]
}

export const success = (structured: unknown, extra: Record<string, unknown> = {}) => ({
  type: 'result', subtype: 'success', session_id: 'sess-done', num_turns: 2, total_cost_usd: 0.01,
  usage: { input_tokens: 10, output_tokens: 20 }, structured_output: structured, errors: [], ...extra,
})

export const init = (sessionId: string) => ({ type: 'system', subtype: 'init', session_id: sessionId })
