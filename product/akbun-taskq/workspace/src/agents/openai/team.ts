import { Agent, MCPServerStdio, MaxTurnsExceededError, Runner, tool, user, type AgentInputItem } from '@openai/agents-core'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { agentDir } from '../../team/prompt.ts'
import type { BotProvider } from '../../db/team.ts'
import { runCodexTurn, spawnCodex, type CodexSpawn } from './codex.ts'
import { join } from 'node:path'
import { OpenAIProvider } from '@openai/agents-openai'
import { z } from 'zod'
import type { Config } from '../../config.ts'
import { ToolError, type TeamTool } from '../../team/tools.ts'
import { STATIC_MODELS } from '../../team/catalog.ts'
import type { Catalog, CatalogRequest, TeamBackend, TurnRequest, TurnResult } from '../../team/types.ts'
import { GateStop, localTools, type LocalTool } from './local-tools.ts'

// A resident bot on the OpenAI Agents SDK (@openai/agents-core with the OpenAI provider). The same TeamBackend as the
// Claude bots, so the hub, mailbox, tools and guards are shared. What differs:
// - Session: the Responses API keeps the conversation server side; the bot's session id is the last response id, and
//   the next turn passes it as previousResponseId.
// - Permissions: there is no auto mode or permission mode in this SDK. taskq gives the bot file and shell tools by its
//   permission mode (local-tools.ts) and runs each call through the same gate.
// - Messages that arrive mid-turn wait for the next turn (no streaming input), so supportsLiveInput is false.
// - Cost: estimated from token usage and the prices in bots.openaiInputPerMTok / openaiOutputPerMTok.

export interface NeutralTool {
  name: string
  description: string
  parameters: Record<string, unknown>
  run(args: Record<string, unknown>): Promise<string>
}

export interface OpenAIRunArgs {
  mcpServers: { name: string; command: string; args: string[] }[]
  cwd: string
  model: string
  instructions: string
  tools: NeutralTool[]
  input: string
  maxTurns: number
  effort: string | null
  previousResponseId?: string
  history?: unknown[]          // a provider without server-side conversations (Bedrock): the turns so far
  provider: BotProvider
  region: string
  signal: AbortSignal
}

export interface OpenAIRunResult {
  lastResponseId?: string
  inputTokens: number
  outputTokens: number
  requests: number
  lastInputTokens?: number     // the last model call's input: the context at the end of the turn
  history?: unknown[]
}

// Context windows for the context ring; the API does not report them.
const WINDOWS: [RegExp, number][] = [[/^openai\.gpt-oss/, 128_000], [/^gpt-5/, 400_000], [/^gpt-4\.1/, 1_000_000], [/^o\d/, 200_000]]
const windowOf = (model: string) => WINDOWS.find(([re]) => re.test(model))?.[1] ?? null

export type OpenAIRunFn = (args: OpenAIRunArgs) => Promise<OpenAIRunResult>

export const DEFAULT_OPENAI_MODEL = 'gpt-5'
export const BEDROCK_DEFAULT_MODEL = 'openai.gpt-oss-120b-1:0'
const HISTORY_ITEMS = 200

// Bedrock keeps no conversation, so the turns live in the bot's folder. A reset session (resume null) starts empty.
// In the bot's own folder under TASKQ_HOME, never in a workdir that is the user's repository.
function historyFile(config: Config, request: TurnRequest): string {
  const dir = agentDir(config, request.agent.name)
  mkdirSync(dir, { recursive: true })
  return join(dir, '.openai-history.json')
}
function loadHistory(config: Config, request: TurnRequest): unknown[] {
  if (!request.resume) return []
  try {
    return JSON.parse(readFileSync(historyFile(config, request), 'utf8')) as unknown[]
  } catch {
    return []
  }
}
function saveHistory(config: Config, request: TurnRequest, history: unknown[]): void {
  // Keep the newest items, starting at a user message so the model never sees a tool result without its call.
  let kept = history.slice(-HISTORY_ITEMS)
  const start = kept.findIndex((item) => (item as { role?: string }).role === 'user')
  if (start > 0) kept = kept.slice(start)
  writeFileSync(historyFile(config, request), JSON.stringify(kept))
}

// API key: the Responses API keeps the conversation (previousResponseId). Bedrock: its OpenAI-compatible endpoint with a
// Bedrock API key speaks Chat Completions only, so taskq keeps the conversation and sends it with each turn.
function sdkRun(apiKey: string, bedrockKey: string): OpenAIRunFn {
  const runners = new Map<string, Runner>()
  const runnerFor = (args: OpenAIRunArgs) => {
    const key = args.provider === 'bedrock' ? `bedrock:${args.region}` : 'api'
    if (!runners.has(key)) {
      const provider = args.provider === 'bedrock'
        ? new OpenAIProvider({ apiKey: bedrockKey, baseURL: `https://bedrock-runtime.${args.region}.amazonaws.com/openai/v1`, useResponses: false })
        : new OpenAIProvider({ apiKey })
      runners.set(key, new Runner({ modelProvider: provider, tracingDisabled: true }))
    }
    return runners.get(key)!
  }
  return async (args) => {
    const runner = runnerFor(args)
    // Registered MCP servers the bot picked: started for the turn, closed after it.
    const servers = args.mcpServers.map((s) => new MCPServerStdio({ name: s.name, command: s.command, args: s.args, cwd: args.cwd }))
    try {
      // A server that does not start is left out of the turn, as Claude Code does; the others still load.
      const started = await Promise.allSettled(servers.map((s) => s.connect()))
      started.forEach((r, i) => { if (r.status === 'rejected') console.error(`taskq: MCP server ${args.mcpServers[i].name} did not start: ${String(r.reason)}`) })
      return await runAgent(runner, args, servers.filter((_, i) => started[i].status === 'fulfilled'))
    } finally {
      await Promise.allSettled(servers.map((s) => s.close()))
    }
  }
}

async function runAgent(runner: Runner, args: OpenAIRunArgs, servers: MCPServerStdio[]): Promise<OpenAIRunResult> {
  const agent = new Agent({
    mcpServers: servers,
    name: 'taskq-bot',
    instructions: args.instructions,
    model: args.model,
    ...(args.effort ? { modelSettings: { reasoning: { effort: args.effort as 'low' | 'medium' | 'high' } } } : {}),
    tools: args.tools.map((t) => tool({
      name: t.name, description: t.description, strict: false,
      parameters: t.parameters as never,
      execute: (input: unknown) => t.run((input ?? {}) as Record<string, unknown>),
    })),
  })
  const input = args.history ? [...(args.history as AgentInputItem[]), user(args.input)] : args.input
  const result = await runner.run(agent, input, { maxTurns: args.maxTurns, signal: args.signal, previousResponseId: args.previousResponseId })
  const usage = result.runContext.usage
  const last = result.rawResponses.at(-1)?.usage
  return {
    lastResponseId: result.lastResponseId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, requests: usage.requests,
    lastInputTokens: last?.inputTokens, history: args.history ? result.history : undefined,
  }
}

// The bot's skills, the way Claude Code offers them: names and descriptions up front, the SKILL.md text on demand.
function skillTool(skills: NonNullable<TurnRequest['skills']>): NeutralTool | undefined {
  if (skills.length === 0) return undefined
  return {
    name: 'read_skill',
    description: `Read one of your skills before using it: its SKILL.md and the files next to it. Skills: ${skills.map((s) => `${s.name} (${s.description.slice(0, 120)})`).join('; ')}`,
    parameters: { type: 'object', properties: { name: { type: 'string', enum: skills.map((s) => s.name) } }, required: ['name'], additionalProperties: false },
    async run(input) {
      const skill = skills.find((s) => s.name === input.name)
      if (!skill) return 'error: no such skill'
      const files = readdirSync(skill.path).filter((f) => f !== 'SKILL.md')
      return `${readFileSync(join(skill.path, 'SKILL.md'), 'utf8')}\n\nFiles in ${skill.path}: ${files.join(', ') || 'none'} (read them with read_file).`
    },
  }
}

// taskq's team tools as neutral tools: zod shape to JSON schema, handler errors returned to the model as text.
function teamTool(t: TeamTool): NeutralTool {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(z.object(t.input).strict()) as Record<string, unknown>
  return {
    name: t.name, description: t.description, parameters,
    async run(args) {
      try {
        return JSON.stringify(t.handler(args))
      } catch (error) {
        if (error instanceof ToolError) return `error: ${error.message}`
        throw error
      }
    },
  }
}

function local(t: LocalTool, onStop: (reason: string) => void): NeutralTool {
  return {
    ...t,
    async run(args) {
      try {
        return await t.run(args)
      } catch (error) {
        if (error instanceof GateStop) {
          onStop(error.message)
          throw error
        }
        return `error: ${error instanceof Error ? error.message : String(error)}`
      }
    },
  }
}

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown })?.status
  return typeof status === 'number' ? status : undefined
}

export function createOpenAITeamBackend(runFn?: OpenAIRunFn, fetcher: typeof fetch = fetch, codex: CodexSpawn = spawnCodex): TeamBackend {
  const apiKey = () => process.env.OPENAI_API_KEY ?? ''
  const bedrockKey = () => process.env.AWS_BEARER_TOKEN_BEDROCK ?? ''
  return {
    sdk: 'openai',
    supportsLiveInput: false,
    async runTurn(config: Config, request: TurnRequest): Promise<TurnResult> {
      const provider = request.agent.provider ?? 'api'
      if (provider === 'chatgpt') return runCodexTurn(config, request, codex)
      if (!runFn && provider === 'api' && !apiKey()) return { outcome: 'failed', error: 'OPENAI_API_KEY is not set in the environment taskq runs in' }
      if (!runFn && provider === 'bedrock' && !bedrockKey()) return { outcome: 'failed', error: 'AWS_BEARER_TOKEN_BEDROCK (a Bedrock API key) is not set in the environment taskq runs in' }
      const run = runFn ?? sdkRun(apiKey(), bedrockKey())
      const history = provider === 'bedrock' ? loadHistory(config, request) : undefined
      const abort = new AbortController()
      const onAbort = () => abort.abort()
      request.signal.addEventListener('abort', onAbort, { once: true })
      let tampered: string | undefined
      const skill = skillTool(request.skills ?? [])
      const tools = [
        ...request.tools.map(teamTool),
        ...(skill ? [skill] : []),
        ...localTools(config, request.agent, request.cwd, request.sharedDir).map((t) => local(t, (reason) => {
          tampered = reason
          abort.abort()
        })),
      ]
      const cost = (r: OpenAIRunResult) => (r.inputTokens * config.bots.openaiInputPerMTok + r.outputTokens * config.bots.openaiOutputPerMTok) / 1_000_000
      try {
        const result = await run({
          mcpServers: request.mcpServers ?? [],
          cwd: request.cwd,
          model: request.agent.model ?? (provider === 'bedrock' ? BEDROCK_DEFAULT_MODEL : DEFAULT_OPENAI_MODEL),
          instructions: request.system,
          tools,
          input: request.prompt,
          maxTurns: request.maxTurns,
          effort: request.agent.effort,
          previousResponseId: provider === 'api' ? request.resume ?? undefined : undefined,
          history, provider, region: config.bots.bedrockRegion,
          signal: abort.signal,
        })
        const model = request.agent.model ?? (provider === 'bedrock' ? BEDROCK_DEFAULT_MODEL : DEFAULT_OPENAI_MODEL)
        if (result.history) saveHistory(config, request, result.history)
        const base = {
          session_id: provider === 'bedrock' ? `local:${request.agent.name}` : result.lastResponseId ?? request.resume ?? undefined,
          turns: result.requests, cost_usd: cost(result), model,
          usage: { input_tokens: result.inputTokens, output_tokens: result.outputTokens },
          context: result.lastInputTokens === undefined ? undefined : { tokens: result.lastInputTokens, window: windowOf(model) },
        }
        if (tampered) return { ...base, outcome: 'failed', error: tampered, tampered }
        return { ...base, outcome: 'done' }
      } catch (error) {
        if (tampered) return { outcome: 'failed', error: tampered, tampered }
        if (error instanceof MaxTurnsExceededError) return { outcome: 'failed', error: `stopped after ${request.maxTurns} model turns` }
        const message = error instanceof Error ? error.message : String(error)
        if (statusOf(error) === 401) return { outcome: 'failed', error: 'OpenAI rejected the API key', auth_failed: true }
        if (/previous_response_not_found|Previous response .* not found/i.test(message)) return { outcome: 'failed', error: 'the previous conversation is gone; the next turn starts a new one', session_missing: true }
        if (request.signal.aborted) return { outcome: 'failed', error: 'stopped' }
        return { outcome: 'failed', error: message.slice(0, 300) }
      } finally {
        request.signal.removeEventListener('abort', onAbort)
      }
    },
    // The model list from the API when a key is set; the commands are the bot's skills only (no plugin system here).
    async catalog(_config: Config, _request: CatalogRequest): Promise<Catalog> {
      if (!apiKey()) return { models: [], commands: [] }
      const res = await fetcher('https://api.openai.com/v1/models', { headers: { authorization: `Bearer ${apiKey()}` } })
      if (!res.ok) throw new Error(`OpenAI models list: HTTP ${res.status}`)
      const body = await res.json() as { data?: { id: string }[] }
      const known = new Map(STATIC_MODELS.openai.map((m) => [m.id, m]))
      const ids = (body.data ?? []).map((m) => m.id).filter((id) => /^(gpt-|o\d)/.test(id)).sort()
      return { models: ids.map((id) => known.get(id) ?? { id, name: id, description: '', efforts: /^(gpt-5|o\d)/.test(id) ? ['low', 'medium', 'high'] : [] }), commands: [] }
    },
  }
}
