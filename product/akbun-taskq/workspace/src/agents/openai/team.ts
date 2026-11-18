import { Agent, MaxTurnsExceededError, Runner, tool } from '@openai/agents-core'
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
  model: string
  instructions: string
  tools: NeutralTool[]
  input: string
  maxTurns: number
  effort: string | null
  previousResponseId?: string
  signal: AbortSignal
}

export interface OpenAIRunResult {
  lastResponseId?: string
  inputTokens: number
  outputTokens: number
  requests: number
}

export type OpenAIRunFn = (args: OpenAIRunArgs) => Promise<OpenAIRunResult>

export const DEFAULT_OPENAI_MODEL = 'gpt-5'

function sdkRun(apiKey: string): OpenAIRunFn {
  const runner = new Runner({ modelProvider: new OpenAIProvider({ apiKey }), tracingDisabled: true })
  return async (args) => {
    const agent = new Agent({
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
    const result = await runner.run(agent, args.input, { maxTurns: args.maxTurns, signal: args.signal, previousResponseId: args.previousResponseId })
    const usage = result.runContext.usage
    return { lastResponseId: result.lastResponseId, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, requests: usage.requests }
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

export function createOpenAITeamBackend(runFn?: OpenAIRunFn, fetcher: typeof fetch = fetch): TeamBackend {
  const apiKey = () => process.env.OPENAI_API_KEY ?? ''
  return {
    sdk: 'openai',
    supportsLiveInput: false,
    async runTurn(config: Config, request: TurnRequest): Promise<TurnResult> {
      if (!runFn && !apiKey()) return { outcome: 'failed', error: 'OPENAI_API_KEY is not set in the environment taskq runs in' }
      const run = runFn ?? sdkRun(apiKey())
      const abort = new AbortController()
      const onAbort = () => abort.abort()
      request.signal.addEventListener('abort', onAbort, { once: true })
      let tampered: string | undefined
      const tools = [
        ...request.tools.map(teamTool),
        ...localTools(config, request.agent, request.cwd, request.sharedDir).map((t) => local(t, (reason) => {
          tampered = reason
          abort.abort()
        })),
      ]
      const cost = (r: OpenAIRunResult) => (r.inputTokens * config.bots.openaiInputPerMTok + r.outputTokens * config.bots.openaiOutputPerMTok) / 1_000_000
      try {
        const result = await run({
          model: request.agent.model ?? DEFAULT_OPENAI_MODEL,
          instructions: request.system,
          tools,
          input: request.prompt,
          maxTurns: request.maxTurns,
          effort: request.agent.effort,
          previousResponseId: request.resume ?? undefined,
          signal: abort.signal,
        })
        const base = { session_id: result.lastResponseId ?? request.resume ?? undefined, turns: result.requests, cost_usd: cost(result) }
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
