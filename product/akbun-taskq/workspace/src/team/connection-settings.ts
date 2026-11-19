import type { Config, Provider } from '../config.ts'
import type { Db } from '../db/open.ts'
import { getMeta, setMeta } from '../db/meta.ts'
import { forgetBedrockTokens, PROFILE_NAME, REGION } from '../aws/profiles.ts'

// How Claude and OpenAI-on-Bedrock bots sign in, changed in Settings > Connections. The values start from
// taskq.config.json; a saved value overrides it and is applied to the running config, so the next turn uses it.
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

// At startup: saved values win over the config file.
export function applyConnectionSettings(db: Db, config: Config): void {
  const current = connectionSettings(config)
  const saved = { ...current }
  for (const [field, key] of Object.entries(KEYS) as [keyof ConnectionSettings, string][]) {
    const value = getMeta(db, key)
    if (value !== null) (saved as Record<string, string>)[field] = value
  }
  if (!PROVIDERS.includes(saved.claude_provider)) saved.claude_provider = current.claude_provider
  put(config, saved)
}

// Checks, saves and applies; returns a message for a bad value.
export function saveConnectionSettings(db: Db, config: Config, body: Record<string, unknown>): ConnectionSettings | string {
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
