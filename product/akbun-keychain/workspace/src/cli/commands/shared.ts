import { appendAudit, type AuditEvent } from '../../core/audit.ts'
import { KeychainError } from '../../core/errors.ts'
import { MIN_KDF_N } from '../../core/crypto.ts'
import { type Context, flag, needsPassword } from '../command.ts'
import { splitFirstLine } from '../io.ts'

// Line 1 of stdin with --password-stdin, otherwise a hidden prompt. Returns the rest of stdin when it was read.
export function readPassword(context: Context, question = 'Root password: '): { password: string; rest?: string } {
  if (flag(context.args, 'password-stdin')) {
    const [password, rest] = splitFirstLine(context.io.readStdin())
    return { password, rest }
  }
  if (!context.io.stdinIsTty) throw needsPassword()
  return { password: context.io.promptHidden(question) }
}

export async function auditCli(event: Omit<AuditEvent, 'actor'>): Promise<void> {
  try {
    await appendAudit({ actor: 'cli', ...event })
  } catch {
    // Best effort, as in the agent.
  }
}

// Runs a password-gated operation and writes its audit line, success or failure.
export async function audited<T>(op: AuditEvent['op'], keys: string[], fn: () => T | Promise<T>): Promise<T> {
  try {
    const result = await fn()
    await auditCli({ op, keys, ok: true })
    return result
  } catch (error) {
    await auditCli({ op, keys, ok: false, code: error instanceof KeychainError ? error.code : 'UNEXPECTED' })
    throw error
  }
}

// Tests set this to keep scrypt fast. The reader refuses anything below MIN_KDF_N, so it cannot weaken a vault.
export function kdfNFromEnv(): number | undefined {
  const text = process.env.AKBUN_KEYCHAIN_TEST_KDF_N
  if (!text) return undefined
  const value = Number(text)
  return Number.isInteger(value) && value >= MIN_KDF_N ? value : undefined
}

export function line(context: Context, text = ''): void {
  context.io.out(`${text}\n`)
}

export function printJson(context: Context, value: unknown): void {
  context.io.out(`${JSON.stringify(value, null, 2)}\n`)
}
