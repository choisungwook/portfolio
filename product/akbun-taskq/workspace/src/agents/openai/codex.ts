import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import type { Config } from '../../config.ts'
import type { TurnRequest, TurnResult } from '../../team/types.ts'
import { worktreesDir } from '../../workspace/worktree.ts'
import { selfCommand } from '../../mcp/server.ts'

// An OpenAI bot on the user's ChatGPT plan: one turn is one `codex exec --experimental-json` of the Codex CLI the user
// installed and signed in to with "Sign in with ChatGPT". The arguments are the ones @openai/codex-sdk passes; taskq
// spawns the CLI itself so it does not ship the 400 MB Codex binary the SDK package depends on.
// - Session: the Codex thread id (thread.started) is the bot's session id; the next turn runs `resume <id>`.
// - Tools: Codex's own (shell, file edits) inside its sandbox, plus the bot's team tools from `taskq mcp --bot <name>`
//   and the registered MCP servers the bot picked, given as `mcp_servers.*` config overrides.
// - Permissions: plan is a read-only sandbox, acceptEdits writes only the bot's folder, the shared folder and the task
//   worktrees (workspace-write), bypassPermissions is danger-full-access. Approvals are never asked: nobody watches.
// - Usage: tokens from turn.completed; the plan has no per-turn price, so the cost is 0, failed turns included.
//   turn.completed sums every model call of the turn, so it does not tell the context size: the ring stays unknown.
// - Long conversations: Codex compacts the thread itself at model_auto_compact_token_limit, set to the session limit.

export interface CodexEvent {
  type: string
  thread_id?: string
  usage?: { input_tokens: number; cached_input_tokens: number; cache_write_input_tokens?: number; output_tokens: number; reasoning_output_tokens?: number }
  error?: { message: string }
  message?: string
}

export type CodexSpawn = (command: string, args: string[], input: string, env: NodeJS.ProcessEnv, signal: AbortSignal) => AsyncIterable<string>

// What Codex prints when it has no ChatGPT login (or the login expired). Narrow on purpose: an auth failure turns the bot off.
const CODEX_SIGNED_OUT = /not logged in|please (run )?`?codex login|401 unauthori[sz]ed|token (has )?expired|refresh token/i

const SANDBOX = { plan: 'read-only', acceptEdits: 'workspace-write', bypassPermissions: 'danger-full-access' } as const

function toml(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(toml).join(', ')}]`
  if (typeof value === 'string') return JSON.stringify(value)
  return String(value)
}

export function codexArgs(config: Config, request: TurnRequest): string[] {
  const agent = request.agent
  const self = selfCommand()
  const args = ['exec', '--experimental-json']
  const override = (key: string, value: unknown) => args.push('--config', `${key}=${toml(value)}`)
  override('mcp_servers.taskq.command', self.command)
  override('mcp_servers.taskq.args', [...self.args, 'mcp', '--bot', agent.name])
  override('mcp_servers.taskq.env.TASKQ_HOME', config.home)
  // The bot's browser follows the taskq server, not this one-turn MCP process (src/browser/chrome.ts).
  override('mcp_servers.taskq.env.TASKQ_OWNER_PID', String(process.pid))
  if (request.turnId !== undefined) override('mcp_servers.taskq.env.TASKQ_TURN_ID', String(request.turnId))
  for (const server of request.mcpServers ?? []) {
    override(`mcp_servers.${server.name}.command`, server.command)
    override(`mcp_servers.${server.name}.args`, server.args)
  }
  // The bot's role, roster and rules, the same text a Claude bot gets in its system prompt.
  override('developer_instructions', request.system)
  if (agent.model) args.push('--model', agent.model)
  args.push('--sandbox', SANDBOX[agent.permission_mode as keyof typeof SANDBOX] ?? 'workspace-write')
  args.push('--cd', request.cwd)
  for (const dir of [request.sharedDir, worktreesDir(config)]) args.push('--add-dir', dir)
  args.push('--skip-git-repo-check')
  if (agent.effort) override('model_reasoning_effort', agent.effort === 'max' ? 'xhigh' : agent.effort)
  override('approval_policy', 'never')
  // Codex summarizes its own thread; taskq only tells it when (the same limit the hub hands other bots over at).
  if (request.sessionMaxTokens) override('model_auto_compact_token_limit', request.sessionMaxTokens)
  if (request.resume) args.push('resume', request.resume)
  return args
}

export const spawnCodex: CodexSpawn = async function* (command, args, input, env, signal) {
  const child = spawn(command, args, { env, signal, stdio: ['pipe', 'pipe', 'pipe'] })
  const stderr: Buffer[] = []
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk))
  const exit = new Promise<{ code: number | null; error?: Error }>((resolve) => {
    child.once('error', (error) => resolve({ code: null, error }))
    child.once('exit', (code) => resolve({ code }))
  })
  child.stdin.end(input)
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity })
  try {
    for await (const line of lines) yield line
    const { code, error } = await exit
    if (error) throw error
    if (code !== 0) throw new Error(`codex exited with code ${code}: ${Buffer.concat(stderr).toString('utf8').slice(-400)}`)
  } finally {
    lines.close()
    if (!child.killed) child.kill()
  }
}

export async function runCodexTurn(config: Config, request: TurnRequest, run: CodexSpawn = spawnCodex): Promise<TurnResult> {
  const env = { ...process.env, TASKQ_HOME: config.home }
  let threadId = request.resume ?? undefined
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_tokens: 0, cache_write_tokens: 0 }
  let failure: string | undefined
  try {
    for await (const line of run(config.bots.codexPath, codexArgs(config, request), request.prompt, env, request.signal)) {
      let event: CodexEvent
      try {
        event = JSON.parse(line) as CodexEvent
      } catch {
        continue
      }
      if (event.type === 'thread.started' && event.thread_id) threadId = event.thread_id
      else if (event.type === 'turn.completed' && event.usage) {
        usage.input_tokens += event.usage.input_tokens
        usage.output_tokens += event.usage.output_tokens
        usage.cache_read_tokens += event.usage.cached_input_tokens ?? 0
        usage.cache_write_tokens += event.usage.cache_write_input_tokens ?? 0
      } else if (event.type === 'turn.failed') failure = event.error?.message ?? 'the Codex turn failed'
      else if (event.type === 'error') failure = event.message ?? 'Codex reported an error'
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const failed = { outcome: 'failed' as const, cost_usd: 0, usage }
    if (request.signal.aborted) return { ...failed, error: 'stopped', session_id: threadId }
    if (/ENOENT/.test(message)) return { ...failed, error: `the Codex CLI was not found (${config.bots.codexPath}); install it and run codex once to sign in with ChatGPT` }
    if (CODEX_SIGNED_OUT.test(message)) return { ...failed, error: 'Codex is not signed in: run `codex login` and choose Sign in with ChatGPT', auth_failed: true }
    if (request.resume && /resume|thread|session/i.test(message) && /not found|no such/i.test(message)) {
      return { ...failed, error: 'the Codex thread is gone; the next turn starts a new one', session_missing: true }
    }
    return { ...failed, error: message.slice(0, 300), session_id: threadId }
  }
  const base = { session_id: threadId, turns: 1, cost_usd: 0, usage }
  return failure ? { ...base, outcome: 'failed', error: failure.slice(0, 300) } : { ...base, outcome: 'done' }
}
