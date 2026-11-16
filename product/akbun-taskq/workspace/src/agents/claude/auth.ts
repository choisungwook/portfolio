import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Config } from '../../config.ts'
import type { PreflightResult } from '../types.ts'

const run = promisify(execFile)
// The child environment is built from an allow-list. Nothing else of the parent reaches the session or its tools.
const INHERITED = new Set([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR', 'TERM', 'TZ',
  'HTTPS_PROXY', 'HTTP_PROXY', 'NO_PROXY', 'https_proxy', 'http_proxy', 'no_proxy',
  'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'AWS_CA_BUNDLE', 'AWS_CONFIG_FILE', 'AWS_SHARED_CREDENTIALS_FILE', 'CLAUDE_CONFIG_DIR',
  'ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'ANTHROPIC_BEDROCK_REGION_PREFIX', 'ANTHROPIC_SMALL_FAST_MODEL_AWS_REGION',
])

// Keys are never read into logs or storage. AWS_PROFILE is set only for bedrock, so target commands must name --profile.
export function buildEnv(config: Config, base: NodeJS.ProcessEnv = process.env): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {}
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined && (INHERITED.has(name) || name.startsWith('LC_'))) env[name] = value
  }
  Object.assign(env, caBundleEnv(config))
  if (config.provider === 'bedrock') {
    env.CLAUDE_CODE_USE_BEDROCK = '1'
    env.AWS_REGION = config.awsRegion
    env.AWS_PROFILE = config.inferenceProfile
  } else if (config.provider === 'api_key') {
    env.ANTHROPIC_API_KEY = base.ANTHROPIC_API_KEY
  } else if (base.CLAUDE_CODE_OAUTH_TOKEN !== undefined) {
    env.CLAUDE_CODE_OAUTH_TOKEN = base.CLAUDE_CODE_OAUTH_TOKEN
  }
  return env
}

// A TLS inspection device re-signs every certificate with its own CA. The aws CLI trusts only AWS_CA_BUNDLE and
// Claude Code only NODE_EXTRA_CA_CERTS, so the one config key sets both. Unset, the shell's values pass through.
export function caBundleEnv(config: Config): Record<string, string> {
  return config.caBundle ? { AWS_CA_BUNDLE: config.caBundle, NODE_EXTRA_CA_CERTS: config.caBundle } : {}
}

export async function preflight(config: Config, base: NodeJS.ProcessEnv = process.env): Promise<PreflightResult> {
  if (config.provider === 'subscription') return { ok: true }
  if (config.provider === 'api_key') {
    return base.ANTHROPIC_API_KEY ? { ok: true } : { ok: false, reason: 'ANTHROPIC_API_KEY is not set' }
  }
  try {
    const env = { ...base, ...caBundleEnv(config) }
    await run('aws', ['sts', 'get-caller-identity', '--profile', config.inferenceProfile], { timeout: 20_000, env })
    return { ok: true }
  } catch {
    // stderr can hold account details, so the reason names only the profile.
    return { ok: false, reason: `inference login failed for profile ${config.inferenceProfile}` }
  }
}
