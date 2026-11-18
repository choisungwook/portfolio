import type { AgentBackend } from '../types.ts'
import { claudeAsk } from './ask.ts'
import { preflight } from './auth.ts'
import { createSdkWorker } from './worker.ts'
import { createClaudeTeamBackend } from './team.ts'

export const claudeBackend: AgentBackend = {
  name: 'claude',
  createWorker: (config) => createSdkWorker(config),
  preflight: (config) => preflight(config),
  ask: (config, request) => claudeAsk(config, request),
  team: createClaudeTeamBackend(),
}
