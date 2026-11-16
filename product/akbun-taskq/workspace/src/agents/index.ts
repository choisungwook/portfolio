import type { Config } from '../config.ts'
import type { AgentBackend, AgentName } from './types.ts'
import { claudeBackend } from './claude/index.ts'

const BACKENDS: Record<AgentName, AgentBackend> = {
  claude: claudeBackend,
}

export const AGENT_NAMES = Object.keys(BACKENDS) as AgentName[]

export function agentFor(config: Config): AgentBackend {
  const backend = BACKENDS[config.agent]
  if (!backend) throw new Error(`unknown agent: ${config.agent}`)
  return backend
}
