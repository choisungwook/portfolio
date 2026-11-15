import type { RunFilter } from '../db/runs.ts'
import { HttpError } from './http.ts'

// Enum values the API accepts. Filters outside these lists are rejected with 400, never passed to SQL.
export const FILTER_TYPES = ['ops_read', 'ops_change', 'code', 'research', 'security_review'] as const
export const FILTER_OUTCOMES = ['done', 'failed', 'needs_approval', 'needs_auth', 'review', 'stale'] as const
export const TASK_STATUSES = ['draft', 'ready', 'running', 'needs_approval', 'needs_auth', 'review', 'done', 'failed'] as const
export const PROPOSAL_STATUSES = ['pending', 'applied', 'rejected'] as const
const LOCK_KEY_MAX = 100

type Query = Record<string, string | undefined>

// Integer query value within [min, max]. Missing values take the default.
export function intParam(value: string | undefined, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined || value === '') return fallback
  if (!/^-?\d+$/.test(value)) throw new HttpError(400, `${name} must be an integer`)
  const n = Number(value)
  if (n < min || n > max) throw new HttpError(400, `${name} must be between ${min} and ${max}`)
  return n
}

export function enumParam<T extends string>(value: string | undefined, name: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === '') return undefined
  if (!(allowed as readonly string[]).includes(value)) throw new HttpError(400, `${name} must be one of ${allowed.join(', ')}`)
  return value as T
}

// Shared by /runs and /stats/daily: type, lock_key and outcome filters.
export function filterParams(query: Query): Omit<RunFilter, 'from' | 'to'> {
  const lock = query.lock_key === undefined || query.lock_key === '' ? undefined : query.lock_key
  if (lock !== undefined && lock.length > LOCK_KEY_MAX) throw new HttpError(400, `lock_key must be at most ${LOCK_KEY_MAX} characters`)
  return {
    type: enumParam(query.type, 'type', FILTER_TYPES),
    lock_key: lock,
    outcome: enumParam(query.outcome, 'outcome', FILTER_OUTCOMES),
  }
}
