import { execFile, spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import type { Config } from '../../config.ts'
import { selfCommand } from '../../mcp/server.ts'
import { agentDir } from '../../team/prompt.ts'
import type { Catalog, TeamBackend, TurnRequest, TurnResult } from '../../team/types.ts'
import { whoami as kiroWhoami } from './login.ts'

// A bot on Kiro: one turn is one headless `kiro-cli chat --no-interactive` in the bot's own folder. Kiro signs in with
// the user's AWS IAM Identity Center (SSO) session from `kiro-cli login` (or KIRO_API_KEY); taskq never sees the token.
// - Agent: taskq writes the bot as a Kiro agent (.kiro/agents/taskq-<bot>.json in the bot's folder) with its role and
//   rules as the prompt, its team tools as the MCP server `taskq` (`taskq mcp --bot <name>`), the registered MCP servers
//   it picked, and its skills as skill:// resources.
// - Permissions: plan sees read tools and its MCP servers; acceptEdits adds write; bypassPermissions sees everything and
//   trusts all calls. Tools outside the trust list are refused, since a headless run cannot ask. The sandbox setting
//   adds --sandbox. taskq's gate does not see Kiro's own tool calls: Kiro's permissions and sandbox are the boundary.
// - Session: Kiro keys sessions by folder, so the bot's own folder holds only its sessions; a later turn resumes with
//   --resume-id when the output named the session, else --resume (the newest one there). The prompt goes in on stdin.
// - Usage: read from the stream-json records when they carry tokens or credits; the record format is not documented,
//   so the parser takes the fields it recognises and leaves the rest.

// The prompt goes in on stdin, not argv: a long batch of messages would pass the OS limit on argument length.
export type KiroSpawn = (command: string, args: string[], input: string, cwd: string, env: NodeJS.ProcessEnv, signal: AbortSignal) => AsyncIterable<string>

// A session id taskq makes up when Kiro's output names none: `kiro:<ms>`, one per session so Usage groups its turns. A
// later turn with such an id resumes the newest session in the bot's folder.
const LOCAL = 'kiro:'
// What kiro-cli prints when it has no login, the login expired, or the account changed under it. An auth failure turns
// the bot off, so these name a sign-in problem and nothing else.
const KIRO_SIGNED_OUT = /not logged in|kiro-cli login|login (is )?required|sign-?in required|session (has |is )?expired|token (has |is )?expired|ExpiredToken|UnrecognizedClientException|bearer token[^.\n]{0,40}invalid/i
// These can be a lost login or something else (a model the account may not use, an MCP server's own 401, a network fault). A signed-out kiro-cli
// can fail a prompt with only "dispatch failure". `kiro-cli whoami` decides.
const KIRO_MAYBE_SIGNED_OUT = /AccessDenied|InvalidSignatureException|unauthori[sz]ed|invalid token|\b40[13]\b|dispatch failure/i
// The plan's quota is used up: the same turn fails until the quota resets, so it is not retried. A rate limit also
// says "limit" but passes in seconds, so only the words of a period count.
const KIRO_QUOTA = /(monthly|daily|weekly)[^.\n]{0,30}limit|MonthlyLimit|FreeTierLimitExceeded/i
// The request itself is refused; sending it again changes nothing.
const KIRO_REFUSED = /improperly formed request|context window overflow/i
const SIGN_IN = 'Kiro is not signed in: sign in with your AWS SSO session under Settings > Connections'

export type KiroWhoami = (config: Config) => Promise<{ signed_out: boolean }>
// `kiro-cli chat --list-models --format json --no-interactive`, as text.
export type KiroModelLister = (config: Config) => Promise<string>

const listKiroModels: KiroModelLister = (config) => new Promise((resolve, reject) => {
  execFile(config.bots.kiroPath, ['chat', '--list-models', '--format', 'json', '--no-interactive'], { timeout: 30_000, maxBuffer: 1 << 20 },
    (error, stdout) => error ? reject(new Error('kiro-cli did not list its models')) : resolve(stdout))
})

// The model rows wherever they sit in the answer: objects with a model id. kiro-cli can print lines around the JSON,
// so the whole text is tried first and then each line.
export function kiroModels(text: string): Catalog['models'] {
  let parsed: unknown
  for (const candidate of [text, ...text.split(/\r?\n/)]) {
    try {
      parsed = JSON.parse(candidate)
      if (parsed && typeof parsed === 'object') break
    } catch {
      parsed = undefined
    }
  }
  const out = new Map<string, Catalog['models'][number]>()
  const walk = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(walk)
    if (!value || typeof value !== 'object') return
    const row = value as Record<string, unknown>
    const id = row.model_id ?? row.modelId
    if (typeof id === 'string' && id) {
      const window = Number(row.context_window_tokens ?? row.contextWindowTokens)
      const rate = Number(row.rate_multiplier ?? row.rateMultiplier)
      const notes = [Number.isFinite(window) && window > 0 ? `${Math.round(window / 1000)}k context` : '', Number.isFinite(rate) && rate > 0 ? `${rate}x credits` : ''].filter(Boolean)
      out.set(id, { id, name: String(row.model_name ?? row.modelName ?? id), description: notes.join(', '), efforts: [] })
    } else Object.values(row).forEach(walk)
  }
  walk(parsed)
  return [...out.values()]
}

export function agentFile(config: Config, request: TurnRequest): { dir: string; name: string; body: Record<string, unknown> } {
  const agent = request.agent
  const self = selfCommand()
  const servers: Record<string, unknown> = {
    taskq: {
      command: self.command, args: [...self.args, 'mcp', '--bot', agent.name],
      env: { TASKQ_HOME: config.home, ...(request.turnId === undefined ? {} : { TASKQ_TURN_ID: String(request.turnId) }) },
    },
  }
  for (const s of request.mcpServers ?? []) servers[s.name] = { command: s.command, args: s.args }
  const mcp = Object.keys(servers).map((n) => `@${n}`)
  const tools = agent.permission_mode === 'bypassPermissions' ? ['*'] : agent.permission_mode === 'acceptEdits' ? ['read', 'write', ...mcp] : ['read', ...mcp]
  const name = `taskq-${agent.name}`
  return {
    dir: agentDir(config, agent.name),
    name,
    body: {
      name, description: agent.description, prompt: request.system, mcpServers: servers, tools,
      resources: (request.skills ?? []).map((s) => `skill://${join(s.path, 'SKILL.md')}`),
      includeMcpJson: false,
      ...(agent.model && agent.model !== 'auto' ? { model: agent.model } : {}),
    },
  }
}

export function kiroArgs(request: TurnRequest, name: string): string[] {
  const agent = request.agent
  // --v3 stays: since Kiro CLI 3.0 only scripts with --trust-all-tools start on V3 by default; the rest start on V2.
  const args = ['chat', '--v3', '--no-interactive', '--output-format', 'stream-json', '--agent', name]
  if (agent.model && agent.model !== 'auto') args.push('--model', agent.model)
  if (agent.effort) args.push('--effort', agent.effort)
  if (request.resume?.startsWith(LOCAL)) args.push('--resume')
  else if (request.resume) args.push('--resume-id', request.resume)
  if (agent.permission_mode === 'bypassPermissions') args.push('--trust-all-tools')
  else args.push(`--trust-tools=${agent.permission_mode === 'acceptEdits' ? '@builtin,@mcp' : 'read*,grep*,glob*,list*,@mcp'}`)
  if (agent.sandbox) args.push('--sandbox')
  return args
}

export const spawnKiro: KiroSpawn = async function* (command, args, input, cwd, env, signal) {
  const child = spawn(command, args, { cwd, env, signal, stdio: ['pipe', 'pipe', 'pipe'] })
  const stderr: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once('error', (error) => resolve({ code: null, error }))
    child.once('exit', (code) => resolve({ code }))
  })
  child.stdin.on('error', () => {})
  child.stdin.end(input)
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of lines) yield line
    const { code, error } = await exit
    if (error) throw error
    if (code !== 0) throw new Error(`kiro-cli exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-400)}`)
  } finally {
    lines.close()
    if (!child.killed) child.kill()
  }
}

// Picks known fields out of any record, at any depth: session id, tokens, credits, context, model, errors.
interface Seen {
  session?: string
  input: number
  output: number
  credits?: number
  context?: number
  contextPercent?: number
  model?: string
  error?: string
}

function scan(value: unknown, seen: Seen, key = ''): void {
  if (Array.isArray(value)) {
    for (const v of value) scan(v, seen)
    return
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const type = String(record.type ?? '')
    if (/error/i.test(type) && typeof (record.message ?? record.error) === 'string') seen.error = String(record.message ?? record.error)
    for (const [k, v] of Object.entries(record)) scan(v, seen, k)
    return
  }
  const k = key.toLowerCase().replace(/_/g, '')
  if (typeof value === 'string') {
    if ((k === 'sessionid' || k === 'conversationid') && value) seen.session = value
    if (k === 'model' || k === 'modelid') seen.model = value
    return
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return
  if (k === 'inputtokens') seen.input += value
  else if (k === 'outputtokens') seen.output += value
  else if (k === 'credits' || k === 'creditsused' || k === 'creditusage') seen.credits = (seen.credits ?? 0) + value
  else if (k === 'contexttokens' || k === 'contextusedtokens') seen.context = value
  else if (k === 'contextusagepercentage' || k === 'contextpercent') seen.contextPercent = value
}

export function createKiroTeamBackend(run: KiroSpawn = spawnKiro, whoami: KiroWhoami = kiroWhoami, listModels: KiroModelLister = listKiroModels): TeamBackend {
  // Why a turn failed, from kiro-cli's own words (an exit message or an error record in the stream).
  async function failure(config: Config, message: string): Promise<Pick<TurnResult, 'error' | 'auth_failed' | 'rejected'>> {
    if (KIRO_QUOTA.test(message)) return { error: `Kiro's usage limit is reached: ${message.slice(0, 200)}`, rejected: true }
    if (KIRO_REFUSED.test(message)) return { error: message.slice(0, 300), rejected: true }
    if (KIRO_SIGNED_OUT.test(message)) return { error: SIGN_IN, auth_failed: true }
    if (KIRO_MAYBE_SIGNED_OUT.test(message) && (await whoami(config).catch(() => ({ signed_out: false }))).signed_out) return { error: SIGN_IN, auth_failed: true }
    return { error: message.slice(0, 300) }
  }

  return {
    sdk: 'kiro',
    supportsLiveInput: false,
    async runTurn(config: Config, request: TurnRequest): Promise<TurnResult> {
      const file = agentFile(config, request)
      mkdirSync(join(file.dir, '.kiro', 'agents'), { recursive: true })
      writeFileSync(join(file.dir, '.kiro', 'agents', `${file.name}.json`), `${JSON.stringify(file.body, null, 2)}\n`)
      const seen: Seen = { input: 0, output: 0 }
      try {
        for await (const line of run(config.bots.kiroPath, kiroArgs(request, file.name), request.prompt, file.dir, { ...process.env, TASKQ_HOME: config.home }, request.signal)) {
          try {
            scan(JSON.parse(line), seen)
          } catch {
            // A plain-text line (a warning) is not a record.
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        // Kiro bills credits, not dollars: a failed turn costs 0 here.
        const failed = { outcome: 'failed' as const, cost_usd: 0 }
        if (request.signal.aborted) return { ...failed, error: 'stopped' }
        if (/ENOENT/.test(message)) return { ...failed, error: `kiro-cli was not found (${config.bots.kiroPath}); install it and sign in under Settings > Connections` }
        if (request.resume && /session/i.test(message) && /not found|no such|invalid/i.test(message)) {
          return { ...failed, error: 'the Kiro session is gone; the next turn starts a new one', session_missing: true }
        }
        return { ...failed, ...await failure(config, message) }
      }
      const usage = { input_tokens: seen.input, output_tokens: seen.output, ...(seen.credits === undefined ? {} : { credits: seen.credits }) }
      // Kiro reports a share of the context, not tokens: window 100 marks a percentage, which the ring shows as is.
      const context = seen.context !== undefined ? { tokens: seen.context, window: null }
        : seen.contextPercent !== undefined ? { tokens: Math.round(seen.contextPercent), window: 100 } : undefined
      const base = { session_id: seen.session ?? request.resume ?? `${LOCAL}${Date.now()}`, turns: 1, cost_usd: 0, usage, model: seen.model ?? request.agent.model ?? 'auto', context }
      return seen.error ? { ...base, outcome: 'failed', ...await failure(config, seen.error) } : { ...base, outcome: 'done' }
    },
    // The models kiro-cli lists for the signed-in account. An empty list makes the menu fall back to the built-in one.
    async catalog(config: Config): Promise<Catalog> {
      return { models: kiroModels(await listModels(config)), commands: [] }
    },
  }
}
