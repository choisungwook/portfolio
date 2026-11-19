import { createHash, createHmac } from 'node:crypto'
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

// What to show when a profile gives no credentials: how to fix it depends on how the profile signs in. Never the SDK's
// own message, which can hold a credential_process command line.
export function profileFailure(profile: string, env: NodeJS.ProcessEnv = process.env): string {
  const kind = listProfiles(env).find((p) => p.name === profile)?.kind
  const fix = kind === 'sso' ? `run aws sso login --profile ${profile}`
    : kind === undefined ? 'no such profile in ~/.aws; pick another in Settings > Connections'
      : kind === 'process' ? 'its credential_process failed; run it by hand to see why'
        : 'check its keys or role in ~/.aws'
  return `the AWS profile ${profile} gave no credentials: ${fix}`
}

export function forgetBedrockTokens(): void {
  tokens.clear()
}

// AWS Signature Version 4 for a GET without a body, the shape of the Bedrock control-plane list calls. Returns the headers
// to send. Written here with node:crypto because the AWS SDK clients are not dependencies of taskq.
export interface AwsCredentials { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

const sha256hex = (text: string) => createHash('sha256').update(text).digest('hex')
const hmac = (key: string | Buffer, text: string) => createHmac('sha256', key).update(text).digest()
const encode = (text: string) => encodeURIComponent(text).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function signGet(url: URL, region: string, service: string, creds: AwsCredentials, now = new Date(), extra: Record<string, string> = {}): Record<string, string> {
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = { host: url.host, 'x-amz-date': amzDate }
  for (const [name, value] of Object.entries(extra)) headers[name.toLowerCase()] = value
  if (creds.sessionToken) headers['x-amz-security-token'] = creds.sessionToken
  const names = Object.keys(headers).sort()
  const query = [...url.searchParams].map(([k, v]) => `${encode(k)}=${encode(v)}`).sort().join('&')
  const canonical = ['GET', url.pathname || '/', query, names.map((n) => `${n}:${headers[n].trim()}\n`).join(''), names.join(';'), sha256hex('')].join('\n')
  const scope = `${day}/${region}/${service}/aws4_request`
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256hex(canonical)].join('\n')
  const key = hmac(hmac(hmac(hmac(`AWS4${creds.secretAccessKey}`, day), region), service), 'aws4_request')
  const signature = createHmac('sha256', key).update(toSign).digest('hex')
  return { ...headers, authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}` }
}

// The Bedrock inference profiles the profile's credentials can see in the region (ListInferenceProfiles, system-defined
// cross-region profiles such as us.openai.* and global.openai.*). Kept for 10 minutes.
export interface InferenceProfile { id: string; name: string }
export type InferenceProfileLister = (profile: string, region: string) => Promise<InferenceProfile[]>
const profileLists = new Map<string, { list: InferenceProfile[]; at: number }>()

export const listInferenceProfiles: InferenceProfileLister = async (profile, region) => {
  const key = `${profile}@${region}`
  const hit = profileLists.get(key)
  if (hit && Date.now() - hit.at < TOKEN_TTL_MS) return hit.list
  const creds = await fromIni({ profile })()
  const list: InferenceProfile[] = []
  let next: string | undefined
  do {
    const url = new URL(`https://bedrock.${region}.amazonaws.com/inference-profiles`)
    url.searchParams.set('maxResults', '1000')
    if (next) url.searchParams.set('nextToken', next)
    const res = await fetch(url, { headers: signGet(url, region, 'bedrock', creds) })
    if (!res.ok) throw new Error(`ListInferenceProfiles: HTTP ${res.status}`)
    const body = await res.json() as { inferenceProfileSummaries?: { inferenceProfileId: string; inferenceProfileName?: string }[]; nextToken?: string }
    for (const p of body.inferenceProfileSummaries ?? []) list.push({ id: p.inferenceProfileId, name: p.inferenceProfileName ?? p.inferenceProfileId })
    next = body.nextToken
  } while (next)
  profileLists.set(key, { list, at: Date.now() })
  return list
}

// A bare model id (openai.gpt-oss-120b-1:0) becomes the inference profile for the endpoint's region when one exists:
// the region's geography first (us., eu., apac., jp., au.), then global. Without a matching profile the id stays.
export function bedrockModelId(model: string, region: string, profiles: InferenceProfile[]): string {
  if (!model.startsWith('openai.')) return model
  const ids = new Set(profiles.map((p) => p.id))
  const geo = /^(us|ca)-/.test(region) ? ['us']
    : region.startsWith('eu-') ? ['eu']
      : region === 'ap-northeast-1' ? ['jp', 'apac']
        : region === 'ap-southeast-2' ? ['au', 'apac']
          : region.startsWith('ap-') ? ['apac'] : []
  return [...geo, 'global'].map((prefix) => `${prefix}.${model}`).find((id) => ids.has(id)) ?? model
}
