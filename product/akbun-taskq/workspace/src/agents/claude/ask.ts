import { query as sdkQuery, type Options } from '@anthropic-ai/claude-agent-sdk'
import type { Config } from '../../config.ts'
import { claudeExecutable } from '../../resources.ts'
import type { AskRequest } from '../types.ts'
import { buildEnv } from './auth.ts'
import type { QueryFn } from './worker.ts'

export async function claudeAsk(config: Config, request: AskRequest, runQuery: QueryFn = sdkQuery): Promise<unknown> {
  // settingSources [] keeps the user's settings, hooks and skills out of this session; tools [] leaves it no tool at all.
  const options: Options = {
    cwd: request.cwd,
    env: buildEnv(config),
    pathToClaudeCodeExecutable: claudeExecutable(),
    model: config.model,
    permissionMode: 'dontAsk',
    settingSources: [],
    tools: [],
    maxTurns: 3,
    outputFormat: { type: 'json_schema', schema: request.schema },
  }
  let structured: unknown
  for await (const message of runQuery({ prompt: request.prompt, options })) {
    if (message.type === 'result' && message.subtype === 'success') structured = message.structured_output
  }
  return structured
}
