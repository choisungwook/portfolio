import type { SDKResultMessage } from '@anthropic-ai/claude-agent-sdk'
import type { Outcome, RunStats, Severity, TaskType, WorkerResult } from '../types.ts'
import { clip } from './text.ts'

const TASK_TYPES: TaskType[] = ['ops_read', 'ops_change', 'code', 'research', 'security_review']
const OUTCOMES: Outcome[] = ['done', 'failed', 'needs_auth', 'review']
const SEVERITIES: Severity[] = ['critical', 'high', 'normal']

// The structured result the model must return as its final output.
export const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    outcome: { type: 'string', enum: OUTCOMES },
    summary: { type: 'string' },
    alerts: {
      type: 'array',
      items: {
        type: 'object',
        properties: { severity: { type: 'string', enum: SEVERITIES }, message: { type: 'string' } },
        required: ['severity', 'message'],
        additionalProperties: false,
      },
    },
    followups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { type: { type: 'string', enum: TASK_TYPES }, intent: { type: 'string' } },
        required: ['type', 'intent'],
        additionalProperties: false,
      },
    },
    auth_scope: { type: 'string', enum: ['target'] },
  },
  required: ['outcome', 'summary', 'alerts', 'followups'],
  additionalProperties: false,
}

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

export function fromStructured(value: unknown, stats: RunStats): WorkerResult {
  if (!isRecord(value) || !OUTCOMES.includes(value.outcome as Outcome) || typeof value.summary !== 'string') {
    return failed('worker returned no valid structured result', stats)
  }
  const alerts = Array.isArray(value.alerts) ? value.alerts.filter(isAlert) : []
  const followups = Array.isArray(value.followups) ? value.followups.filter(isFollowup) : []
  const result: WorkerResult = { outcome: value.outcome as Outcome, summary: value.summary, stats, alerts, followups }
  if (value.auth_scope === 'target') result.auth_scope = 'target'
  return result
}

export function failed(summary: string, stats: RunStats = {}, budgetExceeded = false): WorkerResult {
  const result: WorkerResult = { outcome: 'failed', summary, stats, alerts: [], followups: [] }
  if (budgetExceeded) result.budget_exceeded = true
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isAlert(value: unknown): value is { severity: Severity; message: string } {
  return isRecord(value) && SEVERITIES.includes(value.severity as Severity) && typeof value.message === 'string'
}

function isFollowup(value: unknown): value is { type: TaskType; intent: string } {
  return isRecord(value) && TASK_TYPES.includes(value.type as TaskType) && typeof value.intent === 'string'
}
