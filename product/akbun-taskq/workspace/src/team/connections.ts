import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { getMeta } from '../db/meta.ts'
import { getAgent, listAgents, setAgentEnabled, type TeamAgent } from '../db/team.ts'
import { preflight } from '../agents/claude/auth.ts'
import { whoami } from '../agents/kiro/login.ts'
import { makeBedrockToken, profileFailure, type TokenMaker } from '../aws/profiles.ts'
import { teamChanged } from '../wake.ts'
import { LOGIN_FAILED, isTeamPaused, resumeTeam, signedOutKey, teamPauseReason } from './hub.ts'

// How each bot reaches its model, whether that connection works, and why a bot is not answering. Every bot uses one
// connection: Claude bots share the provider in taskq.config.json; an OpenAI bot uses its own sign-in; Kiro bots share
// the kiro-cli login. The checks are the ones a turn would hit first, so a failed check is the likely reason for silence.

export type ConnectionId = 'claude' | 'openai:api' | 'openai:bedrock' | 'openai:chatgpt' | 'kiro'
export type Status = 'ok' | 'error'

export interface Check {
  status: Status
  reason: string | null
}

export interface LastTurn {
  agent: string
  outcome: string
  error: string | null
  at: number
}

export interface Connection extends Check {
  id: ConnectionId
  label: string
  detail: string
  bots: string[]
  last: LastTurn | null      // the newest finished turn on this connection
  last_ok_at: number | null  // the newest turn on it that ended done
  checked_at: number
}

export interface Checks {
  claude(config: Config): Promise<Check>
  bedrockToken?: TokenMaker
  codex(config: Config): Promise<Check>
  kiro(config: Config): Promise<Check>
  env: NodeJS.ProcessEnv
}

const ok: Check = { status: 'ok', reason: null }
const fail = (reason: string): Check => ({ status: 'error', reason })

// The model provider Codex is configured with (the top-level model_provider of config.toml), or null for its default.
// With a provider other than openai (amazon-bedrock with an AWS profile) Codex needs no ChatGPT login.
export function codexModelProvider(home = process.env.CODEX_HOME || join(homedir(), '.codex')): string | null {
  try {
    const top = readFileSync(join(home, 'config.toml'), 'utf8').split(/^\s*\[/m)[0]
    return /^\s*model_provider\s*=\s*["']([^"']+)["']/m.exec(top)?.[1] ?? null
  } catch {
    return null
  }
}

export const defaultChecks: Checks = {
  async claude(config) {
    const result = await preflight(config)
    return result.ok ? ok : fail(result.reason ?? 'the model login failed')
  },
  codex(config) {
    return new Promise((resolve) => {
      execFile(config.bots.codexPath, ['login', 'status'], { timeout: 10_000 }, (error, stdout, stderr) => {
        const text = `${stdout}${stderr}`.trim().slice(0, 300)
        // Only a fixed sentence reaches the UI: the CLI's own output can name the account.
        if (error && (error as { code?: unknown }).code === 'ENOENT') resolve(fail(`the Codex CLI was not found (${config.bots.codexPath})`))
        else if (/not logged in/i.test(text) && (codexModelProvider() ?? 'openai') !== 'openai') resolve(ok)
        else if (/not logged in/i.test(text)) resolve(fail('Codex is not signed in: run codex login and choose Sign in with ChatGPT'))
        else if (error) resolve(fail(`codex login status failed (exit ${(error as { code?: unknown }).code ?? '?'})`))
        else resolve(ok)
      })
    })
  },
  async kiro(config) {
    const state = await whoami(config)
    return state.signed_in ? ok : fail(state.text || 'kiro-cli is not signed in')
  },
  env: process.env,
}

export function connectionOf(agent: Pick<TeamAgent, 'sdk' | 'provider'>): ConnectionId {
  if (agent.sdk === 'openai') return `openai:${agent.provider ?? 'api'}`
  return agent.sdk === 'kiro' ? 'kiro' : 'claude'
}

function describe(config: Config, id: ConnectionId): { label: string; detail: string } {
  switch (id) {
    case 'claude':
      return {
        label: `Claude · ${{ bedrock: 'Amazon Bedrock', api_key: 'Anthropic API key', subscription: 'Claude subscription' }[config.provider]}`,
        detail: config.provider === 'bedrock' ? `provider bedrock, region ${config.awsRegion}, AWS profile ${config.inferenceProfile}`
          : config.provider === 'api_key' ? 'provider api_key, the key saved in Settings or ANTHROPIC_API_KEY in the environment taskq runs in'
            : 'provider subscription, the signed-in Claude Code',
      }
    case 'openai:api':
      return { label: 'OpenAI · API key', detail: 'OPENAI_API_KEY in the environment taskq runs in' }
    case 'openai:bedrock':
      return {
        label: 'OpenAI · Amazon Bedrock',
        detail: config.bots.bedrockProfile ? `AWS profile ${config.bots.bedrockProfile}, region ${config.bots.bedrockRegion}` : `AWS_BEARER_TOKEN_BEDROCK, region ${config.bots.bedrockRegion}`,
      }
    case 'openai:chatgpt':
      return { label: 'OpenAI · Codex CLI', detail: `Codex CLI (${config.bots.codexPath}) signed in with ChatGPT, or with the model provider in its config.toml` }
    case 'kiro':
      return { label: 'Kiro (AWS)', detail: `kiro-cli (${config.bots.kiroPath}) signed in with AWS IAM Identity Center` }
  }
}

async function check(config: Config, id: ConnectionId, checks: Checks): Promise<Check> {
  switch (id) {
    case 'claude':
      return checks.claude(config)
    case 'openai:api':
      return checks.env.OPENAI_API_KEY ? ok : fail('OPENAI_API_KEY is not set in the environment taskq runs in')
    case 'openai:bedrock':
      if (config.bots.bedrockProfile) {
        // The profile's credentials sign a token; an SSO profile fails here when its session expired. Only a fixed
        // sentence reaches the UI.
        try {
          await (checks.bedrockToken ?? makeBedrockToken)(config.bots.bedrockProfile, config.bots.bedrockRegion)
          return ok
        } catch {
          return fail(profileFailure(config.bots.bedrockProfile))
        }
      }
      return checks.env.AWS_BEARER_TOKEN_BEDROCK ? ok : fail('no Bedrock sign-in: choose an AWS profile below, or set AWS_BEARER_TOKEN_BEDROCK (a Bedrock API key)')
    case 'openai:chatgpt':
      return checks.codex(config)
    case 'kiro':
      return checks.kiro(config)
  }
}

// The newest finished turn of a connection, and the newest that ended done. Turns from before migration 009 have no
// sdk and count as Claude.
function lastTurns(db: Db, id: ConnectionId): { last: LastTurn | null; last_ok_at: number | null } {
  const [sdk, provider] = id.includes(':') ? id.split(':') : [id, null]
  const where = `ended_at IS NOT NULL AND coalesce(sdk, 'claude') = ? AND coalesce(provider, '') = ?`
  const row = db.prepare(`SELECT agent, outcome, error, ended_at FROM team_turns WHERE ${where} ORDER BY id DESC LIMIT 1`).get(sdk, provider ?? '')
  const done = db.prepare(`SELECT max(ended_at) AS at FROM team_turns WHERE ${where} AND outcome = 'done'`).get(sdk, provider ?? '')
  return {
    last: row ? { agent: String(row.agent), outcome: String(row.outcome), error: row.error === null ? null : String(row.error), at: Number(row.ended_at) } : null,
    last_ok_at: done?.at === null || done?.at === undefined ? null : Number(done.at),
  }
}

const IDS: ConnectionId[] = ['claude', 'openai:api', 'openai:bedrock', 'openai:chatgpt', 'kiro']
const CACHE_MS = 60_000
const cache = new Map<ConnectionId, { at: number; check: Check }>()

async function cachedCheck(config: Config, id: ConnectionId, checks: Checks, refresh: boolean): Promise<Check & { checked_at: number }> {
  const hit = cache.get(id)
  if (!refresh && hit && Date.now() - hit.at < CACHE_MS) return { ...hit.check, checked_at: Math.floor(hit.at / 1000) }
  const result = await check(config, id, checks).catch((error: unknown) => fail(error instanceof Error ? error.message : String(error)))
  const at = Date.now()
  cache.set(id, { at, check: result })
  return { ...result, checked_at: Math.floor(at / 1000) }
}

// A check the user reran that passes undoes what the failed login did (signedOut in hub.ts): bots it turned off are
// on again, and bots paused for the Claude login resume. Only a rerun does this, not the cached check the UI polls: a
// bot whose key is set but wrong would otherwise be turned on again every minute. Bedrock with an AWS profile is the
// exception (selfHeals): its check and its failure are the same question, whether the profile gives credentials, so
// the polled check restores too and `aws sso login` alone brings the bot back.
const selfHeals = (config: Config, id: ConnectionId) => id === 'openai:bedrock' && Boolean(config.bots.bedrockProfile)
function restore(db: Db, connection: Connection): void {
  if (connection.status !== 'ok') return
  let changed = false
  for (const name of connection.bots) {
    if (getMeta(db, signedOutKey(name)) !== '1') continue
    setAgentEnabled(db, name, true)
    changed = true
  }
  if (connection.id === 'claude' && teamPauseReason(db)?.startsWith(LOGIN_FAILED)) resumeTeam(db)
  else if (changed) teamChanged.notify()
}

export function teamState(db: Db, config: Config) {
  return { paused: isTeamPaused(db), pause_reason: teamPauseReason(db) ?? null }
}

// Every connection, with the bots on it. A connection no bot uses is listed too, so it can be set up before a bot
// moves to it.
export async function listConnections(db: Db, config: Config, options: { refresh?: boolean; checks?: Checks } = {}) {
  const agents = listAgents(db)
  const checks = options.checks ?? defaultChecks
  const connections: Connection[] = await Promise.all(IDS.map(async (id) => ({
    id, ...describe(config, id), ...(await cachedCheck(config, id, checks, options.refresh ?? false)),
    bots: agents.filter((a) => connectionOf(a) === id).map((a) => a.name), ...lastTurns(db, id),
  })))
  for (const connection of connections) if (options.refresh || selfHeals(config, connection.id)) restore(db, connection)
  return { team: teamState(db, config), connections }
}

// One bot's connection and the likeliest reason it is not answering: bots paused, the bot turned off, then two hints the hub does not gate on: a failing connection check and a failed
// last turn (the hub retries after bots.retryAfterSec). A bot with an open turn is working, so it has no blocker.
// Cancelled and interrupted turns are not failures.
export async function botConnection(db: Db, config: Config, name: string, options: { refresh?: boolean; checks?: Checks } = {}) {
  const agent = getAgent(db, name)
  if (!agent) return undefined
  const id = connectionOf(agent)
  const checks = options.checks ?? defaultChecks
  const connection: Connection = {
    id, ...describe(config, id), ...(await cachedCheck(config, id, checks, options.refresh ?? false)),
    bots: listAgents(db).filter((a) => connectionOf(a) === id).map((a) => a.name), ...lastTurns(db, id),
  }
  if (options.refresh || selfHeals(config, id)) restore(db, connection)
  const enabled = options.refresh ? getAgent(db, name)?.enabled : agent.enabled
  const team = teamState(db, config)
  const row = db.prepare('SELECT outcome, error, ended_at FROM team_turns WHERE agent = ? AND ended_at IS NOT NULL ORDER BY id DESC LIMIT 1').get(name)
  const last = row ? { outcome: String(row.outcome), error: row.error === null ? null : String(row.error), at: Number(row.ended_at) } : null
  const working = Boolean(db.prepare('SELECT 1 FROM team_turns WHERE agent = ? AND ended_at IS NULL').get(name))
  const waiting = Number(db.prepare(`SELECT count(*) AS n FROM team_messages WHERE recipient = ? AND read_at IS NULL AND failed_at IS NULL`).get(name)?.n ?? 0)
  const blocker = team.paused ? `Bots are paused: ${team.pause_reason ?? 'no reason given'}. Resume them next to Bots in the menu.`
      : !enabled ? 'This bot is turned off. Turn it on in its settings.'
        : working ? null
          : connection.status === 'error' ? `Its connection fails: ${connection.reason}`
            : last?.outcome === 'failed' ? `Its last turn failed: ${last.error ?? 'no reason given'}`
              : null
  return { bot: name, connection, team, last_turn: last, waiting, working, blocker }
}

// Tests start from an empty cache; a sign-in drops the cached check of its connection.
export function clearConnectionCache(id?: ConnectionId): void {
  if (id) cache.delete(id)
  else cache.clear()
}
