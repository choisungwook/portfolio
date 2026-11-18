import type { Config } from '../config.ts'
import type { TeamAgent } from '../db/team.ts'
import type { TeamTool } from './tools.ts'

// One turn of a resident agent: resume its session, hand it the new messages, let it call tools until it stops.
// The hub sees only this interface, so tests run the whole team with a fake backend and no model call.
export interface TurnRequest {
  agent: TeamAgent
  system: string            // appended to the backend's own system prompt
  prompt: string            // the new messages, as built by prompt.ts
  tools: TeamTool[]
  cwd: string               // the bot's workdir, or its own folder under TASKQ_HOME/team/
  plugins: string[]         // plugin folders to load: the bot's skill snapshot and its selected plugins
  resume: string | null     // the session to continue; null starts a new one
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

export interface TeamBackend {
  runTurn(config: Config, request: TurnRequest): Promise<TurnResult>
}
