import { appendFileSync, existsSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { KeychainError } from './errors.ts'
import { withLock } from './lockfile.ts'
import { auditLockPath, auditPath, ensureHome } from './paths.ts'
import { isValidName } from './vault-file.ts'

export const AUDIT_ACTORS = ['cli', 'mcp', 'gui'] as const
export const AUDIT_OPS = ['create', 'update', 'delete', 'rename', 'reveal', 'run', 'unlock', 'lock', 'passwd', 'login'] as const

export interface AuditEvent {
  actor: (typeof AUDIT_ACTORS)[number]
  op: (typeof AUDIT_OPS)[number]
  keys: string[]
  ok: boolean
  code?: string
  program?: string
  env?: string[]
  exit_code?: number | null
}

export type AuditLine = AuditEvent & { at: string }

export interface AuditOptions {
  maxBytes?: number
}

const MAX_BYTES = 5 * 1024 * 1024
const KEPT_ROTATIONS = 4
const FIELDS = new Set(['actor', 'op', 'keys', 'ok', 'code', 'program', 'env', 'exit_code'])
const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/
const CODE = /^[A-Z_]+$/

function reject(field: string): never {
  throw new KeychainError('INVALID', `audit field ${field} is not allowed or has the wrong type`)
}

// No free-text field exists, so a secret cannot reach the log by mistake. Anything outside the fixed set is refused.
function checkEvent(event: AuditEvent): void {
  for (const field of Object.keys(event)) if (!FIELDS.has(field)) reject(field)
  if (!(AUDIT_ACTORS as readonly string[]).includes(event.actor)) reject('actor')
  if (!(AUDIT_OPS as readonly string[]).includes(event.op)) reject('op')
  if (!Array.isArray(event.keys) || !event.keys.every((key) => typeof key === 'string' && isValidName(key))) reject('keys')
  if (typeof event.ok !== 'boolean') reject('ok')
  if (event.code !== undefined && (typeof event.code !== 'string' || !CODE.test(event.code))) reject('code')
  if (event.program !== undefined && (typeof event.program !== 'string' || event.program.length > 256)) reject('program')
  if (event.env !== undefined && (!Array.isArray(event.env) || !event.env.every((name) => typeof name === 'string' && ENV_NAME.test(name)))) {
    reject('env')
  }
  if (event.exit_code !== undefined && event.exit_code !== null && !Number.isInteger(event.exit_code)) reject('exit_code')
}

function size(path: string): number {
  try {
    return statSync(path).size
  } catch {
    return 0
  }
}

function rotated(index: number): string {
  return `${auditPath()}.${index}`
}

function rotate(): void {
  rmSync(rotated(KEPT_ROTATIONS), { force: true })
  for (let index = KEPT_ROTATIONS - 1; index >= 1; index--) {
    if (existsSync(rotated(index))) renameSync(rotated(index), rotated(index + 1))
  }
  renameSync(auditPath(), rotated(1))
}

export async function appendAudit(event: AuditEvent, options: AuditOptions = {}): Promise<void> {
  checkEvent(event)
  const maxBytes = options.maxBytes ?? MAX_BYTES
  ensureHome()
  if (size(auditPath()) >= maxBytes) {
    await withLock(auditLockPath(), () => {
      if (size(auditPath()) >= maxBytes) rotate()
    })
  }
  const line: AuditLine = { at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), ...event }
  appendFileSync(auditPath(), `${JSON.stringify(line)}\n`, { mode: 0o600 })
}

// Reads across rotated files, newest last.
export function readAudit(limit?: number): AuditLine[] {
  const files = [...Array.from({ length: KEPT_ROTATIONS }, (_, index) => rotated(KEPT_ROTATIONS - index)), auditPath()]
  const lines: AuditLine[] = []
  for (const file of files) {
    if (!existsSync(file)) continue
    for (const text of readFileSync(file, 'utf8').split('\n')) {
      if (!text) continue
      try {
        lines.push(JSON.parse(text) as AuditLine)
      } catch {
        // A line cut by a crash is skipped rather than failing the whole read.
      }
    }
  }
  return limit === undefined ? lines : lines.slice(-limit)
}
