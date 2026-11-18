import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import type { AgentName } from './agents/types.ts'

export type Provider = 'bedrock' | 'api_key' | 'subscription'

export interface SandboxConfig {
  enabled: boolean
  allowedDomains: string[]
  allowWrite: string[]
}

// The resident bots (the code calls them the team). Off by default: every turn is a paid model call that nobody asked
// for directly.
export interface BotsConfig {
  enabled: boolean
  maxConcurrentTurns: number   // agent turns running at once, separate from maxConcurrent for tasks
  turnMaxTurns: number         // model turns inside one agent turn
  turnBudgetUsd: number        // cost limit of one agent turn
  dailyBudgetUsd: number       // all agent turns since local midnight; the team pauses when it is spent
  hourlyTurnsPerAgent: number  // stops two agents from messaging each other in a loop
  maxOpenTasks: number         // tasks created by agents that are not done or failed
  maxAttempts: number          // a message whose turn failed this many times is set aside
  readRoots: string[]          // absolute directories agents may Read besides their own folder and outputs/
  personaSkill?: string        // absolute path of a skill folder that speaks for the user when a choice is the user's
  // OpenAI bots: the API answers in tokens, not dollars, so a turn's cost is estimated from these prices (USD per
  // million tokens) for the daily budget. Set them to your model's price list.
  openaiInputPerMTok: number
  openaiOutputPerMTok: number
}

export interface Config {
  home: string                 // TASKQ_HOME: holds taskq.config.json, data/, outputs/, memory/
  agent: AgentName             // which agent SDK runs the tasks
  provider: Provider           // how the claude agent signs in to the model
  awsRegion: string
  inferenceProfile: string
  caBundle?: string            // absolute path to a PEM bundle; for networks where a TLS inspection device re-signs certificates
  model?: string
  maxConcurrent: number
  staleTtlSec: number
  heartbeatSec: number
  pollSec: number              // fallback wait for changes made by another process; in-process changes wake at once
  port: number
  maxTurns: number
  maxBudgetUsd: number
  autoMode: boolean
  sandbox: SandboxConfig
  prodLockKeys: string[]
  trustedRepos: string[]       // absolute paths; a code task in one of these may load that repository's own Claude settings
  skillsDir?: string
  retrospect: boolean
  bots: BotsConfig
}

export const DEFAULTS: Omit<Config, 'home'> = {
  agent: 'claude',
  provider: 'bedrock',
  awsRegion: 'us-east-1',
  inferenceProfile: 'default',
  maxConcurrent: 3,
  staleTtlSec: 300,
  heartbeatSec: 30,
  pollSec: 60,
  port: 4517,
  maxTurns: 60,
  maxBudgetUsd: 5,
  autoMode: true,
  sandbox: { enabled: true, allowedDomains: [], allowWrite: [] },
  prodLockKeys: [],
  trustedRepos: [],
  retrospect: true,
  bots: {
    enabled: false, maxConcurrentTurns: 2, turnMaxTurns: 30, turnBudgetUsd: 1, dailyBudgetUsd: 10,
    hourlyTurnsPerAgent: 20, maxOpenTasks: 10, maxAttempts: 3, readRoots: [],
    openaiInputPerMTok: 1.25, openaiOutputPerMTok: 10,
  },
}

// Kept here rather than read from the registry: the registry imports every backend, and config must load without them.
const AGENTS: AgentName[] = ['claude']

export function resolveConfig(home: string, overrides: Partial<Config> = {}): Config {
  return {
    ...DEFAULTS, home, ...overrides,
    sandbox: { ...DEFAULTS.sandbox, ...overrides.sandbox },
    bots: { ...DEFAULTS.bots, ...overrides.bots },
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const home = env.TASKQ_HOME ?? process.cwd()
  const file = join(home, 'taskq.config.json')
  const fromFile = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Partial<Config> : {}
  const config = resolveConfig(home, fromFile)
  if (!AGENTS.includes(config.agent)) throw new Error(`unknown agent: ${config.agent}`)
  if (!['bedrock', 'api_key', 'subscription'].includes(config.provider)) {
    throw new Error(`unknown provider: ${config.provider}`)
  }
  if (config.trustedRepos.some((repo) => !isAbsolute(repo))) throw new Error('trustedRepos must be absolute paths')
  if (config.caBundle !== undefined && !isAbsolute(config.caBundle)) throw new Error('caBundle must be an absolute path')
  if (config.caBundle !== undefined && !existsSync(config.caBundle)) throw new Error(`caBundle ${config.caBundle} does not exist`)
  const bots = config.bots
  if (bots.readRoots.some((root) => !isAbsolute(root))) throw new Error('bots.readRoots must be absolute paths')
  for (const key of ['openaiInputPerMTok', 'openaiOutputPerMTok'] as const) {
    if (!(Number.isFinite(bots[key]) && bots[key] >= 0)) throw new Error(`bots.${key} must be a number of 0 or more`)
  }
  if (bots.personaSkill !== undefined && !(isAbsolute(bots.personaSkill) && existsSync(join(bots.personaSkill, 'SKILL.md')))) {
    throw new Error('bots.personaSkill must be an absolute path to a folder with SKILL.md')
  }
  return config
}
