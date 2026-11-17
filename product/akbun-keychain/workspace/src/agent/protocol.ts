import type { ErrorCode } from '../core/errors.ts'

export const ACTORS = ['cli', 'mcp', 'gui'] as const
export type Actor = (typeof ACTORS)[number]

export const OPS = ['status', 'list', 'get', 'create', 'run', 'verify', 'lock'] as const
export type Op = (typeof OPS)[number]

export interface Request {
  id: string
  token: string
  actor: Actor
  op: Op
  params: Record<string, unknown>
}

export interface StreamLine {
  id: string
  stream: 'stdout' | 'stderr'
  data: string
}

export type Reply =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: { code: ErrorCode; message: string } }

export interface AgentInfo {
  pid: number
  endpoint: string
  token: string
  expires_at: string
}

export interface RunParams {
  command: string[]
  env: Record<string, string>
  base_env: Record<string, string>
  cwd: string
  stdin?: string
  timeout_ms?: number
}

export interface RunResult {
  exit_code: number | null
  timed_out: boolean
}

export const MAX_LINE_BYTES = 1024 * 1024
export const ABSOLUTE_LIMIT_MS = 8 * 60 * 60 * 1000
export const DEFAULT_IDLE_MS = 15 * 60 * 1000
