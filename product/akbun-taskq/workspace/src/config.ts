import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export type Provider = 'bedrock' | 'api_key' | 'subscription'

export interface SandboxConfig {
  enabled: boolean
  allowedDomains: string[]
  allowWrite: string[]
}

export interface Config {
  home: string                 // TASKQ_HOME: holds taskq.config.json, data/, outputs/, memory/
  provider: Provider
  awsRegion: string
  inferenceProfile: string
  caBundle?: string            // absolute path to a PEM bundle; for networks where a TLS inspection device re-signs certificates
  model?: string
  maxConcurrent: number
  staleTtlSec: number
  heartbeatSec: number
  pollSec: number
  port: number
  maxTurns: number
  maxBudgetUsd: number
  autoMode: boolean
  sandbox: SandboxConfig
  prodLockKeys: string[]
  trustedRepos: string[]       // absolute paths; a code task in one of these may load that repository's own Claude settings
  skillsDir?: string
  retrospect: boolean
}

export const DEFAULTS: Omit<Config, 'home'> = {
  provider: 'bedrock',
  awsRegion: 'us-east-1',
  inferenceProfile: 'default',
  maxConcurrent: 3,
  staleTtlSec: 300,
  heartbeatSec: 30,
  pollSec: 2,
  port: 4517,
  maxTurns: 60,
  maxBudgetUsd: 5,
  autoMode: true,
  sandbox: { enabled: true, allowedDomains: [], allowWrite: [] },
  prodLockKeys: [],
  trustedRepos: [],
  retrospect: true,
}

export function resolveConfig(home: string, overrides: Partial<Config> = {}): Config {
  return { ...DEFAULTS, home, ...overrides, sandbox: { ...DEFAULTS.sandbox, ...overrides.sandbox } }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const home = env.TASKQ_HOME ?? process.cwd()
  const file = join(home, 'taskq.config.json')
  const fromFile = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Partial<Config> : {}
  const config = resolveConfig(home, fromFile)
  if (!['bedrock', 'api_key', 'subscription'].includes(config.provider)) {
    throw new Error(`unknown provider: ${config.provider}`)
  }
  if (config.trustedRepos.some((repo) => !isAbsolute(repo))) throw new Error('trustedRepos must be absolute paths')
  if (config.caBundle !== undefined && !isAbsolute(config.caBundle)) throw new Error('caBundle must be an absolute path')
  return config
}
