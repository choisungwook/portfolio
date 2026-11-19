import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { getTokenProvider } from '@aws/bedrock-token-generator'
import { fromIni } from '@aws-sdk/credential-providers'

// Local AWS profiles (~/.aws/config and ~/.aws/credentials, or AWS_CONFIG_FILE / AWS_SHARED_CREDENTIALS_FILE) and the
// short-term Bedrock token an OpenAI bot uses when it signs in with one. taskq reads profile names and how each signs
// in, never keys; the AWS SDK resolves the credentials (an SSO profile uses the session from `aws sso login`).

export interface AwsProfile {
  name: string
  kind: 'sso' | 'role' | 'keys' | 'process' | 'other'
  region: string | null
}

export const PROFILE_NAME = /^[A-Za-z0-9_.@+=-]{1,64}$/
export const REGION = /^[a-z]{2}(-[a-z]+)+-\d$/

function sections(text: string): Map<string, Record<string, string>> {
  const out = new Map<string, Record<string, string>>()
  let current: Record<string, string> | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#') || line.startsWith(';')) continue
    const head = /^\[(.+)\]$/.exec(line)
    if (head) {
      current = {}
      out.set(head[1].trim(), current)
      continue
    }
    const eq = line.indexOf('=')
    if (current && eq > 0) current[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
  }
  return out
}

export function listProfiles(env: NodeJS.ProcessEnv = process.env): AwsProfile[] {
  const configFile = env.AWS_CONFIG_FILE ?? join(homedir(), '.aws', 'config')
  const credsFile = env.AWS_SHARED_CREDENTIALS_FILE ?? join(homedir(), '.aws', 'credentials')
  const profiles = new Map<string, AwsProfile>()
  if (existsSync(configFile)) {
    for (const [section, keys] of sections(readFileSync(configFile, 'utf8'))) {
      const name = section === 'default' ? 'default' : section.startsWith('profile ') ? section.slice(8).trim() : null
      if (!name || !PROFILE_NAME.test(name)) continue
      const kind = keys.sso_session || keys.sso_start_url ? 'sso' : keys.role_arn ? 'role' : keys.credential_process ? 'process' : 'other'
      profiles.set(name, { name, kind, region: keys.region ?? null })
    }
  }
  if (existsSync(credsFile)) {
    for (const [name, keys] of sections(readFileSync(credsFile, 'utf8'))) {
      if (!PROFILE_NAME.test(name) || !keys.aws_access_key_id) continue
      const known = profiles.get(name)
      profiles.set(name, { name, kind: known && known.kind !== 'other' ? known.kind : 'keys', region: known?.region ?? null })
    }
  }
  return [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name))
}

// A Bedrock bearer token for the OpenAI-compatible endpoint, made from the profile's credentials (SigV4, at most the
// credentials' own lifetime). Kept for 10 minutes so every turn does not sign again.
export type TokenMaker = (profile: string, region: string) => Promise<string>
const TOKEN_TTL_MS = 10 * 60_000
const tokens = new Map<string, { token: string; at: number }>()

export const makeBedrockToken: TokenMaker = async (profile, region) => {
  const key = `${profile}@${region}`
  const hit = tokens.get(key)
  if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return hit.token
  const token = await getTokenProvider({ credentials: fromIni({ profile }), region })()
  tokens.set(key, { token, at: Date.now() })
  return token
}

export function forgetBedrockTokens(): void {
  tokens.clear()
}
