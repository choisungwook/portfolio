import type { Config } from '../config.ts'
import type { Worker } from '../types.ts'
import type { TeamBackend } from '../team/types.ts'

export type AgentName = 'claude'

export interface PreflightResult { ok: boolean; reason?: string }

// A short call with no tools that returns JSON matching `schema`, or undefined when the model returned nothing valid.
export interface AskRequest { prompt: string; schema: Record<string, unknown>; cwd: string }

// One agent SDK behind taskq. The runner, API and database see only this interface.
// A backend must enforce the shared policy in src/worker/gate.ts (decide and tamperOf) on every tool call,
// return the structured result described by RESULT_SCHEMA, and report a failed model login as needs_auth with
// inference scope.
export interface AgentBackend {
  name: AgentName
  createWorker(config: Config): Worker
  preflight(config: Config): Promise<PreflightResult>
  ask(config: Config, request: AskRequest): Promise<unknown>
  team?: TeamBackend         // resident agents; a backend without one cannot run the team
}
