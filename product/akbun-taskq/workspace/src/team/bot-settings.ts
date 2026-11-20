import { existsSync, statSync } from 'node:fs'
import { isAbsolute } from 'node:path'
import { EFFORTS, PERMISSION_MODES, type BotEffort, type BotPermissionMode, type BotProvider, type BotSdk, type BotSettings, PROVIDERS } from '../db/team.ts'
import { BOT_DEFAULTS } from './roster.ts'
import { PERMISSIONS_BY_SDK } from './catalog.ts'

// Shared by the API and the CLI: turns a request body into BotSettings, or explains what is wrong.
export const BOT_NAME = /^[a-z][a-z0-9-]{0,31}$/
const HOST = /^[a-z0-9*][a-z0-9.*-]{0,252}$/

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

function text(value: unknown, key: string, limit: number, fallback = ''): string {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'string' || value.length > limit) throw new Error(`${key} must be a string up to ${limit} characters`)
  return value.trim()
}

function list(value: unknown, key: string, check: (item: string) => boolean, limit = 100): string[] {
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.length > limit || !value.every((item) => typeof item === 'string')) {
    throw new Error(`${key} must be an array of up to ${limit} strings`)
  }
  const items = [...new Set((value as string[]).map((item) => item.trim()).filter(Boolean))]
  const bad = items.find((item) => !check(item))
  if (bad !== undefined) throw new Error(`${key} has an invalid entry: ${bad}`)
  return items
}

function providerOf(value: unknown): BotProvider | null {
  if (value === null || value === '' || value === undefined) return null
  if (!PROVIDERS.includes(value as BotProvider)) throw new Error(`provider must be one of ${PROVIDERS.join(', ')}`)
  return value as BotProvider
}

function sdkOf(value: unknown): BotSdk {
  if (value !== 'claude' && value !== 'openai' && value !== 'kiro') throw new Error('sdk must be claude, openai or kiro')
  return value
}

function effortOf(value: unknown): BotEffort | null {
  if (value === null || value === '' || value === undefined) return null
  if (!EFFORTS.includes(value as BotEffort)) throw new Error(`effort must be one of ${EFFORTS.join(', ')}, or empty`)
  return value as BotEffort
}

// An optional number limit: null or '' means "use the global default".
function limit(value: unknown, key: string, min: number, max: number, integer: boolean): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) {
    throw new Error(`${key} must be ${integer ? 'an integer' : 'a number'} from ${min} to ${max}, or empty for the global default`)
  }
  return n
}

export function parseBotSettings(body: unknown, known: { skills: Set<string>; plugins: Set<string>; mcp?: Set<string> }, base?: BotSettings): Parsed<BotSettings> {
  try {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) throw new Error('body must be a JSON object')
    const o = body as Record<string, unknown>
    const from = base ?? { ...BOT_DEFAULTS, role: 'custom', description: '', instructions: '' }
    const has = (key: string) => key in o
    const mode = has('permission_mode') ? o.permission_mode : from.permission_mode
    if (!PERMISSION_MODES.includes(mode as BotPermissionMode)) throw new Error(`permission_mode must be one of ${PERMISSION_MODES.join(', ')}`)
    const workdir = has('workdir') ? (o.workdir === null || o.workdir === '' ? null : text(o.workdir, 'workdir', 500)) : from.workdir
    if (workdir !== null && !(isAbsolute(workdir) && existsSync(workdir) && statSync(workdir).isDirectory())) {
      throw new Error('workdir must be an absolute path to an existing directory')
    }
    const bool = (key: keyof BotSettings) => {
      if (!has(key)) return from[key] as boolean
      if (typeof o[key] !== 'boolean') throw new Error(`${key} must be true or false`)
      return o[key] as boolean
    }
    const value: BotSettings = {
      role: has('role') ? text(o.role, 'role', 40) || 'custom' : from.role,
      description: has('description') ? text(o.description, 'description', 500) : from.description,
      instructions: has('instructions') ? text(o.instructions, 'instructions', 8000) : from.instructions,
      may_message_user: bool('may_message_user'),
      enabled: bool('enabled'),
      permission_mode: mode as BotPermissionMode,
      sandbox: bool('sandbox'),
      allowed_domains: has('allowed_domains') ? list(o.allowed_domains, 'allowed_domains', (h) => HOST.test(h)) : from.allowed_domains,
      blocked_commands: has('blocked_commands') ? list(o.blocked_commands, 'blocked_commands', (c) => c.length <= 200) : from.blocked_commands,
      workdir,
      skills: has('skills') ? list(o.skills, 'skills', (n) => known.skills.has(n)) : from.skills,
      plugins: has('plugins') ? list(o.plugins, 'plugins', (n) => known.plugins.has(n)) : from.plugins,
      mcp_servers: has('mcp_servers') ? list(o.mcp_servers, 'mcp_servers', (n) => known.mcp?.has(n) ?? false) : from.mcp_servers ?? [],
      model: has('model') ? (text(o.model, 'model', 100) || null) : from.model,
      sdk: has('sdk') ? sdkOf(o.sdk) : from.sdk,
      provider: has('provider') ? providerOf(o.provider) : from.provider ?? null,
      effort: has('effort') ? effortOf(o.effort) : from.effort,
      hourly_turns: has('hourly_turns') ? limit(o.hourly_turns, 'hourly_turns', 1, 1000, true) : from.hourly_turns,
      turn_max_turns: has('turn_max_turns') ? limit(o.turn_max_turns, 'turn_max_turns', 1, 500, true) : from.turn_max_turns,
      charter_owns: has('charter_owns') ? text(o.charter_owns, 'charter_owns', 2000) : from.charter_owns ?? '',
      charter_good: has('charter_good') ? text(o.charter_good, 'charter_good', 2000) : from.charter_good ?? '',
      charter_never: has('charter_never') ? text(o.charter_never, 'charter_never', 2000) : from.charter_never ?? '',
      ask_first: has('ask_first') ? list(o.ask_first, 'ask_first', (c) => c.length <= 200) : from.ask_first ?? [],
    }
    if (!value.description) throw new Error('description is required: other bots delegate by it')
    if (value.sdk !== 'openai') value.provider = null
    // The OpenAI Agents SDK has no auto mode or permission modes; taskq builds an OpenAI bot's tools from plan,
    // acceptEdits or bypassPermissions. A bot switched to OpenAI without a mode given gets acceptEdits.
    if (!PERMISSIONS_BY_SDK[value.sdk].includes(value.permission_mode)) {
      if (has('permission_mode')) throw new Error(`a ${value.sdk} bot's permission_mode must be one of ${PERMISSIONS_BY_SDK[value.sdk].join(', ')}`)
      value.permission_mode = 'acceptEdits'
    }
    return { ok: true, value }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
