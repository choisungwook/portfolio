import type { Config, Provider } from '../config.ts'
import type { Db } from '../db/open.ts'
import { getMeta, setMeta } from '../db/meta.ts'
import { forgetBedrockTokens, PROFILE_NAME, REGION } from '../aws/profiles.ts'

// How Claude and OpenAI-on-Bedrock bots sign in, changed in Settings > Connections. The values start from
// taskq.config.json; a saved value overrides it. Every process applies the saved values when it starts, the server's
// bot hub again on each tick (so a change from the CLI or MCP arrives within pollSec), and a save from the UI at once.
// - Claude: provider (bedrock | api_key | subscription), awsRegion, inferenceProfile (the AWS profile for Bedrock).
// - OpenAI on Bedrock: bots.bedrockProfile (an AWS profile, often SSO, whose short-term credentials sign a Bedrock
//   token; empty uses AWS_BEARER_TOKEN_BEDROCK) and bots.bedrockRegion.

export interface ConnectionSettings {
  claude_provider: Provider
  claude_region: string
  claude_profile: string
  bedrock_profile: string
  bedrock_region: string
}

const KEYS: Record<keyof ConnectionSettings, string> = {
  claude_provider: 'conn_claude_provider', claude_region: 'conn_claude_region', claude_profile: 'conn_claude_profile',
  bedrock_profile: 'conn_bedrock_profile', bedrock_region: 'conn_bedrock_region',
}
const PROVIDERS: Provider[] = ['bedrock', 'api_key', 'subscription']

export function connectionSettings(config: Config): ConnectionSettings {
  return {
    claude_provider: config.provider, claude_region: config.awsRegion, claude_profile: config.inferenceProfile,
    bedrock_profile: config.bots.bedrockProfile ?? '', bedrock_region: config.bots.bedrockRegion,
  }
}

function put(config: Config, s: ConnectionSettings): void {
  config.provider = s.claude_provider
  config.awsRegion = s.claude_region
  config.inferenceProfile = s.claude_profile
  config.bots.bedrockProfile = s.bedrock_profile
  config.bots.bedrockRegion = s.bedrock_region
}

// The config file's values, kept from the first apply so Clear can go back to them.
const fileValues = new WeakMap<Config, ConnectionSettings>()

// At startup: saved values win over the config file.
export function applyConnectionSettings(db: Db, config: Config): void {
  if (!fileValues.has(config)) fileValues.set(config, connectionSettings(config))
  const current = fileValues.get(config)!
  const saved = { ...current }
  for (const [field, key] of Object.entries(KEYS) as [keyof ConnectionSettings, string][]) {
    const value = getMeta(db, key)
    if (value !== null) (saved as Record<string, string>)[field] = value
  }
  if (!PROVIDERS.includes(saved.claude_provider)) saved.claude_provider = current.claude_provider
  put(config, saved)
}

// Checks, saves and applies; returns a message for a bad value. It starts from what is saved, so a partial change (one
// field from the CLI) keeps the others.
export function saveConnectionSettings(db: Db, config: Config, body: Record<string, unknown>): ConnectionSettings | string {
  applyConnectionSettings(db, config)
  const next = { ...connectionSettings(config) }
  const text = (field: keyof ConnectionSettings) => (typeof body[field] === 'string' ? String(body[field]).trim() : undefined)
  const provider = text('claude_provider')
  if (provider !== undefined) {
    if (!PROVIDERS.includes(provider as Provider)) return `claude_provider must be one of ${PROVIDERS.join(', ')}`
    next.claude_provider = provider as Provider
  }
  for (const field of ['claude_region', 'bedrock_region'] as const) {
    const value = text(field)
    if (value === undefined) continue
    if (!REGION.test(value)) return `${field} looks like us-east-1`
    next[field] = value
  }
  for (const field of ['claude_profile', 'bedrock_profile'] as const) {
    const value = text(field)
    if (value === undefined) continue
    if (value && !PROFILE_NAME.test(value)) return `${field} is not a valid AWS profile name`
    if (!value && field === 'claude_profile') return 'claude_profile is required (the AWS profile Claude uses on Bedrock)'
    next[field] = value
  }
  for (const [field, key] of Object.entries(KEYS) as [keyof ConnectionSettings, string][]) setMeta(db, key, String(next[field]))
  put(config, next)
  forgetBedrockTokens()
  return next
}

// Clear on one runtime's section: its saved values go, so the config file's values (and the environment) apply again.
export type Runtime = 'claude' | 'openai' | 'kiro'
const OWN: Record<Runtime, string[]> = {
  claude: [KEYS.claude_provider, KEYS.claude_region, KEYS.claude_profile],
  openai: [KEYS.bedrock_profile, KEYS.bedrock_region],
  kiro: ['kiro_start_url', 'kiro_region'],
}
export function clearConnectionSettings(db: Db, config: Config, runtime: Runtime): void {
  for (const key of OWN[runtime]) db.prepare('DELETE FROM meta WHERE key = ?').run(key)
  applyConnectionSettings(db, config)
  forgetBedrockTokens()
}
