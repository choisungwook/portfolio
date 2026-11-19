import { mkdirSync } from 'node:fs'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { EFFORTS, PERMISSION_MODES, getAgent, type BotPermissionMode, type BotProvider, type BotSdk, type TeamAgent } from '../db/team.ts'
import { listEntries } from '../db/bot-registry.ts'
import { pluginPaths } from './bot-plugin.ts'
import { agentDir } from './prompt.ts'
import type { Catalog, TeamBackend } from './types.ts'

// The model list and slash commands shown in a bot's compose bar. The SDK is asked once per bot and the answer kept for
// CACHE_SEC; the refresh button asks again. When the SDK cannot answer (no login, no network), a built-in
// list is shown with `fallback` set, so the menus still work and say where the list came from.

const CACHE_SEC = 600
const ASK_TIMEOUT_MS = 20_000

export interface BotCatalog extends Catalog {
  sdk: BotSdk
  permission_modes: BotPermissionMode[]
  fallback: boolean
  error?: string
  fetched_at: number
}

const ALL = [...EFFORTS]

// Claude Code's permission modes. The OpenAI Agents SDK has no permission modes and no auto mode (a model that judges
// each call); taskq builds the OpenAI bot's tools from the mode instead: see src/agents/openai/team.ts.
export const PERMISSIONS_BY_SDK: Record<BotSdk, BotPermissionMode[]> = {
  claude: [...PERMISSION_MODES],
  openai: ['plan', 'acceptEdits', 'bypassPermissions'],
  kiro: ['plan', 'acceptEdits', 'bypassPermissions'],
}
export const STATIC_MODELS: Record<BotSdk, Catalog['models']> = {
  claude: [
    { id: 'claude-opus-5-5', name: 'Opus 5.5', description: 'Most capable', efforts: ALL },
    { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5', description: 'Balanced', efforts: ALL },
    { id: 'claude-haiku-5-5', name: 'Haiku 5.5', description: 'Fastest', efforts: [] },
    { id: 'claude-fable-5-2', name: 'Fable 5.2', description: 'Writing', efforts: ALL },
  ],
  openai: [
    { id: 'gpt-5', name: 'GPT-5', description: 'OpenAI flagship', efforts: ['low', 'medium', 'high'] },
    { id: 'gpt-5-mini', name: 'GPT-5 mini', description: 'Smaller and cheaper', efforts: ['low', 'medium', 'high'] },
  ],
  // Kiro picks a model when none is given; others are typed in the bot's settings as kiro-cli names them.
  kiro: [{ id: 'auto', name: 'Auto', description: 'Kiro chooses', efforts: [] }],
}

// An OpenAI bot's models depend on how it signs in.
export const PROVIDER_MODELS: Record<BotProvider, Catalog['models']> = {
  api: STATIC_MODELS.openai,
  bedrock: [
    { id: 'openai.gpt-oss-120b-1:0', name: 'gpt-oss-120b (Bedrock)', description: 'Open-weight, on Amazon Bedrock', efforts: ['low', 'medium', 'high'] },
    { id: 'openai.gpt-oss-20b-1:0', name: 'gpt-oss-20b (Bedrock)', description: 'Smaller open-weight', efforts: ['low', 'medium', 'high'] },
  ],
  chatgpt: [{ id: '', name: 'Codex default', description: 'The model your ChatGPT plan gives Codex', efforts: ['low', 'medium', 'high', 'xhigh'] }],
}

export function staticModels(agent: { sdk: BotSdk; provider?: BotProvider | null }): Catalog['models'] {
  return agent.sdk === 'openai' ? PROVIDER_MODELS[agent.provider ?? 'api'] : STATIC_MODELS[agent.sdk]
}

// The bot's registered skills, named the way the SDK names a plugin's skill. Shown even when the SDK did not answer.
function skillCommands(db: Db, agent: TeamAgent): Catalog['commands'] {
  const described = new Map(listEntries(db, 'skill').map((e) => [e.name, e.description ?? '']))
  return agent.skills.map((name) => ({ name, description: described.get(name) ?? '', hint: '' }))
}

// A command the SDK reports as `taskq-<bot>-skills:<skill>` is the same skill as `<skill>`; keep the short name.
function merge(agent: TeamAgent, own: Catalog['commands'], sdk: Catalog['commands']): Catalog['commands'] {
  const prefix = `taskq-${agent.name}-skills:`
  const out = new Map(own.map((c) => [c.name, c]))
  for (const c of sdk) {
    const name = c.name.startsWith(prefix) ? c.name.slice(prefix.length) : c.name
    if (!out.has(name) || !out.get(name)!.description) out.set(name, { ...c, name })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no answer in ${ms / 1000}s`)), ms)
    promise.then((value) => { clearTimeout(timer); resolve(value) }, (error: unknown) => { clearTimeout(timer); reject(error) })
  })
}

export function createCatalog(db: Db, config: Config, backendFor: (sdk: BotSdk) => TeamBackend | undefined) {
  const cache = new Map<string, BotCatalog>()

  return async function catalog(name: string, refresh = false): Promise<BotCatalog | undefined> {
    const agent = getAgent(db, name)
    if (!agent) return undefined
    const now = Math.floor(Date.now() / 1000)
    const hit = cache.get(name)
    if (!refresh && hit && hit.sdk === agent.sdk && now - hit.fetched_at < CACHE_SEC) return { ...hit, commands: merge(agent, skillCommands(db, agent), hit.commands) }
    const backend = backendFor(agent.sdk)
    const base = { sdk: agent.sdk, fetched_at: now, permission_modes: PERMISSIONS_BY_SDK[agent.sdk] }
    if (!backend?.catalog) {
      return { ...base, fallback: true, error: `the ${agent.sdk} backend is not running`, models: staticModels(agent), commands: skillCommands(db, agent) }
    }
    try {
      const cwd = agent.workdir ?? agentDir(config, name)
      mkdirSync(cwd, { recursive: true })
      const answer = await withTimeout(backend.catalog(config, { agent, cwd, plugins: pluginPaths(db, config, name) }), ASK_TIMEOUT_MS)
      const result: BotCatalog = { ...base, fallback: answer.models.length === 0, models: answer.models.length ? answer.models : staticModels(agent), commands: answer.commands }
      cache.set(name, result)
      return { ...result, commands: merge(agent, skillCommands(db, agent), result.commands) }
    } catch (error) {
      return { ...base, fallback: true, error: error instanceof Error ? error.message : String(error), models: staticModels(agent), commands: skillCommands(db, agent) }
    }
  }
}

export type CatalogFn = ReturnType<typeof createCatalog>
