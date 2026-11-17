import { closeSync, copyFileSync, existsSync, fsyncSync, openSync, readFileSync, renameSync, writeSync } from 'node:fs'
import { MIN_KDF_N, type Box, type KdfParams } from './crypto.ts'
import { KeychainError } from './errors.ts'

export const FORMAT = 'akbun-keychain/1'
export const AI_ACCESS = ['inject', 'reveal', 'deny'] as const
export type AiAccess = (typeof AI_ACCESS)[number]

export interface Entry {
  description: string
  tags: string[]
  ai_access: AiAccess
  created_at: string
  updated_at: string
  version: number
  value: Box
}

export interface VaultFile {
  format: typeof FORMAT
  vault_id: string
  kdf: KdfParams
  wrapped_key: Box & { alg: 'aes-256-gcm' }
  entries: Record<string, Entry>
  mac: string
}

const NAME = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/
const TAG = /^[a-z0-9][a-z0-9._-]*$/
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/
export const MAX_NAME = 128
export const MAX_DESCRIPTION = 500

export function isValidName(name: string): boolean {
  return name.length <= MAX_NAME && NAME.test(name)
}

export function checkName(name: string): void {
  if (!isValidName(name)) {
    throw new KeychainError('INVALID', `key name is invalid: use lowercase a-z, 0-9, . _ - and / separators, at most ${MAX_NAME} characters`)
  }
}

export function checkDescription(description: string): void {
  if (description.length > MAX_DESCRIPTION) {
    throw new KeychainError('INVALID', `description is too long: at most ${MAX_DESCRIPTION} characters`)
  }
}

export function normalizeTags(tags: string[]): string[] {
  for (const tag of tags) {
    if (!TAG.test(tag)) throw new KeychainError('INVALID', 'tag is invalid: use lowercase a-z, 0-9, . _ -')
  }
  return [...new Set(tags)].sort()
}

export function checkAiAccess(level: string): asserts level is AiAccess {
  if (!(AI_ACCESS as readonly string[]).includes(level)) {
    throw new KeychainError('INVALID', 'ai_access is invalid: use inject, reveal or deny')
  }
}

function corrupt(what: string): KeychainError {
  return new KeychainError('INTEGRITY', `vault.json is malformed: ${what}. Restore vault.json.bak`)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isBox(value: unknown): value is Box {
  return isObject(value) && typeof value.nonce === 'string' && typeof value.ciphertext === 'string'
    && BASE64.test(value.nonce) && BASE64.test(value.ciphertext)
}

function checkKdf(kdf: unknown): asserts kdf is KdfParams {
  if (!isObject(kdf) || kdf.name !== 'scrypt') throw corrupt('kdf is not scrypt')
  const { N, r, p, salt } = kdf
  if (typeof N !== 'number' || !Number.isInteger(N) || N < MIN_KDF_N || (N & (N - 1)) !== 0) {
    throw corrupt(`kdf.N must be a power of two of at least ${MIN_KDF_N}`)
  }
  if (r !== 8 || p !== 1) throw corrupt('kdf r and p must be 8 and 1')
  if (typeof salt !== 'string' || !BASE64.test(salt) || Buffer.from(salt, 'base64').length < 16) throw corrupt('kdf.salt is invalid')
}

function checkEntry(name: string, entry: unknown): asserts entry is Entry {
  if (!isValidName(name)) throw corrupt('an entry name is invalid')
  if (!isObject(entry)) throw corrupt(`entry ${name} is not an object`)
  const { description, tags, ai_access, created_at, updated_at, version, value } = entry
  const fail = (field: string) => corrupt(`entry ${name} has an invalid ${field}`)
  if (typeof description !== 'string' || description.length > MAX_DESCRIPTION) throw fail('description')
  if (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string' && TAG.test(tag))) throw fail('tags')
  if (typeof ai_access !== 'string' || !(AI_ACCESS as readonly string[]).includes(ai_access)) throw fail('ai_access')
  if (typeof created_at !== 'string' || !TIMESTAMP.test(created_at)) throw fail('created_at')
  if (typeof updated_at !== 'string' || !TIMESTAMP.test(updated_at)) throw fail('updated_at')
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw fail('version')
  if (!isBox(value)) throw fail('value')
}

export function parseVault(text: string): VaultFile {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw corrupt('not JSON')
  }
  if (!isObject(data)) throw corrupt('not an object')
  if (data.format !== FORMAT) throw corrupt(`format is not ${FORMAT}`)
  if (typeof data.vault_id !== 'string' || data.vault_id.length === 0) throw corrupt('vault_id is missing')
  checkKdf(data.kdf)
  const wrapped = data.wrapped_key
  if (!isBox(wrapped) || (wrapped as unknown as Record<string, unknown>).alg !== 'aes-256-gcm') throw corrupt('wrapped_key is invalid')
  if (!isObject(data.entries)) throw corrupt('entries is not an object')
  for (const [name, entry] of Object.entries(data.entries)) checkEntry(name, entry)
  if (typeof data.mac !== 'string' || !BASE64.test(data.mac)) throw corrupt('mac is missing')
  return data as unknown as VaultFile
}

// Pretty-printed, entries sorted by name, trailing newline: readable by a person, small diffs.
export function serializeVault(vault: VaultFile): string {
  const entries: Record<string, Entry> = {}
  for (const name of Object.keys(vault.entries).sort()) entries[name] = vault.entries[name]
  return `${JSON.stringify({ ...vault, entries }, null, 2)}\n`
}

export function readVaultFile(path: string): VaultFile {
  if (!existsSync(path)) throw new KeychainError('NOT_INITIALIZED', 'no vault: run akbun-keychain init')
  return parseVault(readFileSync(path, 'utf8'))
}

export interface WriteHooks {
  beforeRename?: () => void
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

// On Windows a rename over a file another process has open can fail with EPERM for a moment.
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if ((code !== 'EPERM' && code !== 'EACCES') || attempt >= 10) throw error
      sleepSync(20)
    }
  }
}

// Caller holds vault.lock. A crash at any point leaves either the old file or the new one.
export function writeVaultFile(path: string, backup: string, vault: VaultFile, hooks: WriteHooks = {}): void {
  if (existsSync(path)) copyFileSync(path, backup)
  const temp = `${path}.tmp-${process.pid}`
  const fd = openSync(temp, 'w', 0o600)
  try {
    writeSync(fd, serializeVault(vault))
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  hooks.beforeRename?.()
  renameWithRetry(temp, path)
}
