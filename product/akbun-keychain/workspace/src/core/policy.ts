// The single place that decides what an unlocked session may do without the root password.
// security.md "The access rule" is the specification; CLI, agent and MCP all ask here.
import { KeychainError } from './errors.ts'
import type { EntryInfo } from './vault.ts'

export type SessionEntry =
  | Pick<EntryInfo, 'name' | 'ai_access'>
  | Pick<EntryInfo, 'name' | 'ai_access' | 'description' | 'tags' | 'updated_at' | 'intact'>

// A deny key shows its name and level only.
export function sessionView(entry: EntryInfo): SessionEntry {
  if (entry.ai_access === 'deny') return { name: entry.name, ai_access: entry.ai_access }
  const { name, ai_access, description, tags, updated_at, intact } = entry
  return { name, ai_access, description, tags, updated_at, intact }
}

function checkIntact(entry: EntryInfo): void {
  if (!entry.intact) {
    throw new KeychainError('INTEGRITY', `entry ${entry.name} fails authentication: ask the user to run akbun-keychain verify`)
  }
}

export function assertSessionMayRun(entry: EntryInfo): void {
  if (entry.ai_access === 'deny') {
    throw new KeychainError('DENIED', `${entry.name} is deny: only the user can use it, with the root password`)
  }
  checkIntact(entry)
}

export function assertSessionMayReveal(entry: EntryInfo): void {
  if (entry.ai_access !== 'reveal') {
    throw new KeychainError('DENIED', `${entry.name} is ${entry.ai_access}: use run to pass it to a command`)
  }
  checkIntact(entry)
}

// Whatever the caller asked for, a key created by a session is inject.
export const SESSION_CREATE_ACCESS = 'inject' as const
