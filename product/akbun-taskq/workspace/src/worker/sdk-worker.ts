import { execFile } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import {
  query as sdkQuery, type CanUseTool, type Options, type SDKMessage, type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk'
import type { Config } from '../config.ts'
import type { Worker, WorkerContext, WorkerResult } from '../types.ts'
import { buildEnv } from './auth.ts'
import { buildHooks, type RunState } from './hooks.ts'
import type { GateContext } from './gate.ts'
import { outputsOf, profileFor, type Profile } from './profiles.ts'
import { buildPrompt, systemAppend } from './prompt.ts'
import { RESULT_SCHEMA, failed, toWorkerResult } from './result-schema.ts'

export type QueryFn = (params: { prompt: string; options: Options }) => AsyncIterable<SDKMessage>

export interface SdkWorkerDeps {
  query?: QueryFn
  headOf?: (repo: string) => Promise<string>
}

const run = promisify(execFile)
const INFERENCE_AUTH_ERRORS = new Set(['authentication_failed', 'cloud_credential_error'])

export async function headOf(repo: string): Promise<string> {
  const { stdout } = await run('git', ['-C', repo, 'rev-parse', 'HEAD'], { timeout: 20_000 })
  return stdout.trim()
}

// One Agent SDK session per call. Errors become a failed result, never a thrown error.
export function createSdkWorker(config: Config, deps: SdkWorkerDeps = {}): Worker {
  const runQuery: QueryFn = deps.query ?? sdkQuery
  const head = deps.headOf ?? headOf
  return async (ctx) => {
    try {
      return await runTask(config, runQuery, head, ctx)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/authentication_failed|cloud_credential_error|invalid x-api-key|status code 401/i.test(message)) {
        return { outcome: 'needs_auth', summary: 'Model provider login failed', stats: {}, alerts: [], followups: [], auth_scope: 'inference' }
      }
      return failed(message.slice(0, 300))
    }
  }
}

async function runTask(config: Config, runQuery: QueryFn, head: (repo: string) => Promise<string>, ctx: WorkerContext): Promise<WorkerResult> {
  const { task } = ctx
  const profile = profileFor(task, config)
  const outputs = outputsOf(config)
  mkdirSync(outputs, { recursive: true })
  if (task.type === 'code' && !task.data.base_commit) {
    ctx.patchData({ base_commit: await head(profile.cwd) })
  }

  const abort = new AbortController()
  const onAbort = () => abort.abort()
  ctx.signal.addEventListener('abort', onAbort, { once: true })
  const state: RunState = { toolCalls: 0, expired: false }
  const gate: GateContext = {
    cwd: profile.cwd, outputs, repo: task.data.repo, dataDir: join(config.home, 'data'), profile: task.data.target_profile,
    accessSkill: ctx.access_skill_path,
  }
  const options = buildOptions(config, ctx, profile, state, abort, gate)

  let final: SDKResultMessage | undefined
  let inferenceAuth = false
  try {
    for await (const message of runQuery({ prompt: buildPrompt(task, ctx.similar, outputs, ctx.access_skill_path), options })) {
      if (message.type === 'system' && message.subtype === 'init') ctx.onSession(message.session_id)
      else if (message.type === 'assistant' && message.error && INFERENCE_AUTH_ERRORS.has(message.error)) inferenceAuth = true
      else if (message.type === 'result') final = message
    }
  } catch (error) {
    // The abort we trigger when the target login expires surfaces as an error here; anything else is real.
    if (!state.expired) throw error
  } finally {
    ctx.signal.removeEventListener('abort', onAbort)
  }

  if (state.expired) {
    return { outcome: 'needs_auth', summary: 'Target account login expired', stats: {}, alerts: [], followups: [], auth_scope: 'target' }
  }
  if (inferenceAuth) {
    return { outcome: 'needs_auth', summary: 'Model provider login failed', stats: {}, alerts: [], followups: [], auth_scope: 'inference' }
  }
  if (!final) return failed('worker ended without a result')
  return toWorkerResult(final, state.toolCalls)
}

function buildOptions(config: Config, ctx: WorkerContext, profile: Profile, state: RunState, abort: AbortController, gate: GateContext): Options {
  const { task } = ctx
  return {
    cwd: profile.cwd,
    additionalDirectories: profile.additionalDirectories,
    env: buildEnv(config),
    model: config.model,
    permissionMode: profile.permissionMode,
    allowedTools: profile.allowedTools,
    canUseTool: task.type === 'ops_change' ? approvalGate(ctx) : undefined,
    hooks: buildHooks(ctx, state, abort, gate),
    settingSources: profile.settingSources,
    // No MCP server is loaded: the session sees only the servers listed here, which are none.
    strictMcpConfig: true,
    mcpServers: {},
    maxTurns: task.data.max_turns ?? config.maxTurns,
    maxBudgetUsd: task.data.max_budget_usd ?? config.maxBudgetUsd,
    resume: ctx.resumeSessionId ?? undefined,
    abortController: abort,
    sandbox: profile.sandbox,
    systemPrompt: { type: 'preset', preset: 'claude_code', append: systemAppend(task) },
    outputFormat: { type: 'json_schema', schema: RESULT_SCHEMA },
  }
}

// Every call that reaches this gate waits for the user's decision through the runner.
function approvalGate(ctx: WorkerContext): CanUseTool {
  return async (tool, input) => {
    const allowed = await ctx.requestApproval({ tool, input })
    return allowed ? { behavior: 'allow', updatedInput: input } : { behavior: 'deny', message: 'The user denied this action.' }
  }
}
