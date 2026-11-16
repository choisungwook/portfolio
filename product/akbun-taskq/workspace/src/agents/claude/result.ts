import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import type { RunStats, WorkerResult } from '../../types.ts'
import { failed, fromStructured } from '../../worker/result-schema.ts'
import { clip } from '../../worker/text.ts'

// Maps the SDK's final result message to a WorkerResult. Budget and turn limits count as budget_exceeded.
export function toWorkerResult(message: SDKResultMessage, toolCalls: number): WorkerResult {
  const stats: RunStats = {
    turns: message.num_turns,
    input_tokens: message.usage.input_tokens,
    output_tokens: message.usage.output_tokens,
    cost_usd: message.total_cost_usd,
    tool_calls: toolCalls,
  }
  if (message.subtype !== 'success') {
    const limit = message.subtype === 'error_max_turns' || message.subtype === 'error_max_budget_usd'
    const reason = message.errors.length > 0 ? message.errors.join('; ') : message.subtype
    return failed(clip(reason, 300), stats, limit)
  }
  return fromStructured(message.structured_output, stats)
}
