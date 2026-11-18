import type { Config } from '../config.ts'
import type { TeamAgent } from '../db/team.ts'
import type { TeamTool } from './tools.ts'
import type { LiveInput } from './live-input.ts'

// One turn of a resident agent: resume its session, hand it the new messages, let it call tools until it stops.
// The hub sees only this interface, so tests run the whole team with a fake backend and no model call.
export interface TurnRequest {
  agent: TeamAgent
  system: string            // appended to the backend's own system prompt
  prompt: string            // the new messages, as built by prompt.ts
  tools: TeamTool[]
  cwd: string               // the bot's workdir, or its own folder under TASKQ_HOME/team/
  plugins: string[]         // plugin folders to load: the bot's skill snapshot and its selected plugins
  sharedDir: string         // the folder every bot shares, added to the session's directories
  maxTurns: number          // the bot's per-turn limits, already resolved against the global defaults
  budgetUsd: number
  resume: string | null     // the session to continue; null starts a new one
  live?: LiveInput          // messages that arrive while the turn runs; only for a backend with supportsLiveInput
  signal: AbortSignal
}

export interface TurnResult {
  outcome: 'done' | 'failed'
  error?: string
  session_id?: string
  turns?: number
  cost_usd?: number
  auth_failed?: boolean     // the model provider login failed; the hub pauses the team
  session_missing?: boolean // the resumed session no longer exists; the hub starts a new one next time
  tampered?: string         // a tool call reached taskq itself (data directory, config); the hub pauses the team
}

export interface CatalogRequest {
  agent: TeamAgent
  cwd: string
  plugins: string[]
}

// What a bot can be told to use: the models its SDK offers (with the effort levels each supports) and its slash commands.
export interface Catalog {
  models: { id: string; name: string; description: string; efforts: string[] }[]
  commands: { name: string; description: string; hint: string }[]
}

export interface TeamBackend {
  sdk?: 'claude' | 'openai'   // which SDK the backend runs; a bot whose sdk differs is not started by it
  runTurn(config: Config, request: TurnRequest): Promise<TurnResult>
  supportsLiveInput?: boolean   // can take messages into a running turn (Claude streaming input); otherwise they wait
  catalog?(config: Config, request: CatalogRequest): Promise<Catalog>
}
