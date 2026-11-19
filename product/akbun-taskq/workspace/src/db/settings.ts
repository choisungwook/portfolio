import type { Config } from '../config.ts'
import type { Db } from './open.ts'
import { getMeta, setMeta } from './meta.ts'

// Settings the user changes in the app. They live in the SQLite file under TASKQ_HOME, so they survive a restart and
// an upgrade (a new binary opens the same file). taskq.config.json gives the starting values; a value saved here wins.

export interface Limits {
  daily_budget_usd: number      // every bot turn and bot-owned task run since local midnight
  turns_per_hour_total: number  // all bots together; a loop between bots shows here first
  max_concurrent_turns: number  // bots working at the same time
  bot_turns_per_hour: number    // per-bot default; a bot's own setting overrides it
  turn_budget_usd: number       // per-turn default
  turn_max_turns: number        // per-turn default
  session_max_tokens: number    // a conversation larger than this is handed over to a new session (src/team/hub.ts)
}

export const LIMIT_RANGES: Record<keyof Limits, { min: number; max: number; integer: boolean }> = {
  daily_budget_usd: { min: 0.1, max: 10_000, integer: false },
  turns_per_hour_total: { min: 1, max: 10_000, integer: true },
  max_concurrent_turns: { min: 1, max: 20, integer: true },
  bot_turns_per_hour: { min: 1, max: 1000, integer: true },
  turn_budget_usd: { min: 0.01, max: 100, integer: false },
  turn_max_turns: { min: 1, max: 500, integer: true },
  session_max_tokens: { min: 50_000, max: 2_000_000, integer: true },
}

export function limits(db: Db, config: Config): Limits {
  const b = config.bots
  const defaults: Limits = {
    daily_budget_usd: b.dailyBudgetUsd,
    turns_per_hour_total: Math.max(b.hourlyTurnsPerAgent * 3, 60),
    max_concurrent_turns: b.maxConcurrentTurns,
    bot_turns_per_hour: b.hourlyTurnsPerAgent,
    turn_budget_usd: b.turnBudgetUsd,
    turn_max_turns: b.turnMaxTurns,
    session_max_tokens: 100_000,
  }
  const out = { ...defaults }
  for (const key of Object.keys(LIMIT_RANGES) as (keyof Limits)[]) {
    const saved = getMeta(db, `limit_${key}`)
    if (saved !== null && Number.isFinite(Number(saved))) out[key] = Number(saved)
  }
  return out
}

// Validates every given key first and writes nothing on an error, so a form never half-saves.
export function setLimits(db: Db, patch: Record<string, unknown>): string | null {
  const entries = Object.entries(patch)
  for (const [key, value] of entries) {
    const range = LIMIT_RANGES[key as keyof Limits]
    if (!range) return `unknown limit ${key}`
    if (typeof value !== 'number' || !Number.isFinite(value) || value < range.min || value > range.max || (range.integer && !Number.isInteger(value))) {
      return `${key} must be ${range.integer ? 'an integer' : 'a number'} from ${range.min} to ${range.max}`
    }
  }
  for (const [key, value] of entries) setMeta(db, `limit_${key}`, String(value))
  return null
}

export type Language = 'ko' | 'en'
export type ThemeMode = 'system' | 'dark' | 'light'

export function language(db: Db): Language {
  return getMeta(db, 'ui_language') === 'en' ? 'en' : 'ko'
}

export function themeMode(db: Db): ThemeMode {
  const value = getMeta(db, 'ui_theme')
  return value === 'dark' || value === 'system' ? value : 'light'
}
