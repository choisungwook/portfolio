import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { canonical } from './canonical.ts'
import { DEFAULT_KDF_N, MIN_KDF_N, deriveKek, deriveSubkeys, mac, macMatches, newDataKey, newKdfParams, open, seal, type Subkeys } from './crypto.ts'
import { KeychainError } from './errors.ts'
import { withLock } from './lockfile.ts'
import { backupPath, ensureHome, vaultLockPath, vaultPath } from './paths.ts'
import {
  FORMAT, checkAiAccess, checkDescription, checkName, normalizeTags, readVaultFile, writeVaultFile,
  type AiAccess, type Entry, type VaultFile, type WriteHooks,
} from './vault-file.ts'

export const MIN_PASSWORD_LENGTH = 12
export const MAX_VALUE_BYTES = 64 * 1024

export interface EntryInfo {
  name: string
  description: string
  tags: string[]
  ai_access: AiAccess
  created_at: string
  updated_at: string
  version: number
  intact: boolean
}

export interface NewEntry {
  name: string
  value: string
  description?: string
  tags?: string[]
  ai_access?: AiAccess
}

export interface EntryChange {
  value?: string
  description?: string
  tags?: string[]
  ai_access?: AiAccess
}

export interface VerifyResult {
  mac_ok: boolean
  entries_failed: string[]
}

export interface InitOptions {
  kdfN?: number
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function checkPassword(password: string): void {
  if ([...password].length < MIN_PASSWORD_LENGTH) {
    throw new KeychainError('INVALID', `root password is too short: at least ${MIN_PASSWORD_LENGTH} characters`)
  }
}

function checkValue(value: string): Buffer {
  const bytes = Buffer.from(value, 'utf8')
  if (bytes.length > MAX_VALUE_BYTES) throw new KeychainError('INVALID', `value too large: at most ${MAX_VALUE_BYTES} bytes`)
  return bytes
}

function wrapAad(vault: Pick<VaultFile, 'vault_id' | 'kdf'>): string {
  return canonical({ format: FORMAT, vault_id: vault.vault_id, kdf: vault.kdf })
}

function entryAad(vaultId: string, name: string, entry: Omit<Entry, 'value'>): string {
  const { description, tags, ai_access, created_at, updated_at, version } = entry
  return canonical({ format: FORMAT, vault_id: vaultId, name, description, tags, ai_access, created_at, updated_at, version })
}

function macInput(vault: VaultFile): string {
  const entries: Record<string, { version: number; ciphertext: string }> = {}
  for (const [name, entry] of Object.entries(vault.entries)) {
    entries[name] = { version: entry.version, ciphertext: entry.value.ciphertext }
  }
  return canonical({ format: FORMAT, vault_id: vault.vault_id, entries })
}

function unwrap(vault: VaultFile, password: string): Buffer {
  const dataKey = open(deriveKek(password, vault.kdf), vault.wrapped_key, wrapAad(vault))
  if (!dataKey) throw new KeychainError('BAD_PASSWORD', 'wrong root password: try again')
  return dataKey
}

function wrap(vault: Pick<VaultFile, 'vault_id' | 'kdf'>, password: string, dataKey: Buffer): VaultFile['wrapped_key'] {
  return { alg: 'aes-256-gcm', ...seal(deriveKek(password, vault.kdf), dataKey, wrapAad(vault)) }
}

function integrityError(): KeychainError {
  return new KeychainError('INTEGRITY', 'vault.json fails its MAC: run akbun-keychain verify, or restore vault.json.bak')
}

// entries comes from JSON.parse, so a plain lookup would find inherited names such as `constructor`.
function has(vault: VaultFile, name: string): boolean {
  return Object.hasOwn(vault.entries, name)
}

function checkKdfN(N: number): number {
  if (!Number.isInteger(N) || N < MIN_KDF_N || (N & (N - 1)) !== 0) {
    throw new KeychainError('INVALID', `kdf N must be a power of two of at least ${MIN_KDF_N}`)
  }
  return N
}

// Every operation reads the file again. A copy read earlier may be stale, and a stale copy is how updates get lost.
function load(dataKey: Buffer): { vault: VaultFile; keys: Subkeys } {
  const vault = readVaultFile(vaultPath())
  const keys = deriveSubkeys(dataKey, vault.vault_id)
  if (!macMatches(keys.macKey, macInput(vault), vault.mac)) throw integrityError()
  return { vault, keys }
}

function decryptEntry(vault: VaultFile, keys: Subkeys, name: string): string {
  if (!has(vault, name)) throw new KeychainError('NOT_FOUND', `no key named ${name}: run akbun-keychain list`)
  const entry = vault.entries[name]
  const plain = open(keys.entryKey, entry.value, entryAad(vault.vault_id, name, entry))
  if (!plain) throw new KeychainError('INTEGRITY', `entry ${name} fails authentication: its metadata was edited; restore vault.json.bak`)
  return plain.toString('utf8')
}

function encryptEntry(vault: VaultFile, keys: Subkeys, name: string, meta: Omit<Entry, 'value'>, value: string): Entry {
  return { ...meta, value: seal(keys.entryKey, checkValue(value), entryAad(vault.vault_id, name, meta)) }
}

async function mutate<T>(dataKey: Buffer, change: (vault: VaultFile, keys: Subkeys) => T, hooks?: WriteHooks): Promise<T> {
  return withLock(vaultLockPath(), () => {
    const { vault, keys } = load(dataKey)
    const result = change(vault, keys)
    vault.mac = mac(keys.macKey, macInput(vault))
    writeVaultFile(vaultPath(), backupPath(), vault, hooks)
    return result
  })
}

function info(name: string, entry: Entry, intact: boolean): EntryInfo {
  const { description, tags, ai_access, created_at, updated_at, version } = entry
  return { name, description, tags, ai_access, created_at, updated_at, version, intact }
}

export function vaultExists(): boolean {
  return existsSync(vaultPath())
}

export async function initVault(password: string, options: InitOptions = {}): Promise<void> {
  checkPassword(password)
  checkKdfN(options.kdfN ?? DEFAULT_KDF_N)
  ensureHome()
  await withLock(vaultLockPath(), () => {
    if (vaultExists()) throw new KeychainError('ALREADY_INITIALIZED', 'a vault already exists: use it, or move vault.json away first')
    const dataKey = newDataKey()
    const header = { vault_id: randomUUID(), kdf: newKdfParams(checkKdfN(options.kdfN ?? DEFAULT_KDF_N)) }
    const vault: VaultFile = { format: FORMAT, ...header, wrapped_key: wrap(header, password, dataKey), entries: {}, mac: '' }
    vault.mac = mac(deriveSubkeys(dataKey, vault.vault_id).macKey, macInput(vault))
    writeVaultFile(vaultPath(), backupPath(), vault)
    dataKey.fill(0)
  })
}

// Checks the password only. The MAC is checked by each operation, so a damaged vault can still be unlocked to run verify.
export function openVault(password: string): Buffer {
  return unwrap(readVaultFile(vaultPath()), password)
}

// Metadata with the result of authenticating each entry. Callers that act on ai_access must check intact.
export function list(dataKey: Buffer): EntryInfo[] {
  const { vault, keys } = load(dataKey)
  return Object.keys(vault.entries).sort().map((name) => {
    const entry = vault.entries[name]
    const intact = open(keys.entryKey, entry.value, entryAad(vault.vault_id, name, entry)) !== undefined
    return info(name, entry, intact)
  })
}

export function reveal(dataKey: Buffer, name: string): string {
  const { vault, keys } = load(dataKey)
  return decryptEntry(vault, keys, name)
}

export async function create(dataKey: Buffer, input: NewEntry, hooks?: WriteHooks): Promise<EntryInfo> {
  checkName(input.name)
  const description = input.description ?? ''
  checkDescription(description)
  const tags = normalizeTags(input.tags ?? [])
  const aiAccess = input.ai_access ?? 'inject'
  checkAiAccess(aiAccess)
  checkValue(input.value)
  return mutate(dataKey, (vault, keys) => {
    if (has(vault, input.name)) throw new KeychainError('EXISTS', `a key named ${input.name} already exists: choose another name`)
    const at = now()
    const meta = { description, tags, ai_access: aiAccess, created_at: at, updated_at: at, version: 1 }
    vault.entries[input.name] = encryptEntry(vault, keys, input.name, meta, input.value)
    return info(input.name, vault.entries[input.name], true)
  }, hooks)
}

// Any metadata change re-encrypts the value, because the metadata is its additional authenticated data.
export async function update(dataKey: Buffer, name: string, change: EntryChange): Promise<EntryInfo> {
  if (change.description !== undefined) checkDescription(change.description)
  const tags = change.tags === undefined ? undefined : normalizeTags(change.tags)
  if (change.ai_access !== undefined) checkAiAccess(change.ai_access)
  if (change.value !== undefined) checkValue(change.value)
  return mutate(dataKey, (vault, keys) => {
    const current = decryptEntry(vault, keys, name)
    const value = change.value ?? current
    const old = vault.entries[name]
    const meta = {
      description: change.description ?? old.description,
      tags: tags ?? old.tags,
      ai_access: change.ai_access ?? old.ai_access,
      created_at: old.created_at,
      updated_at: now(),
      version: old.version + 1,
    }
    vault.entries[name] = encryptEntry(vault, keys, name, meta, value)
    return info(name, vault.entries[name], true)
  })
}

export async function rename(dataKey: Buffer, name: string, newName: string): Promise<EntryInfo> {
  checkName(newName)
  return mutate(dataKey, (vault, keys) => {
    const value = decryptEntry(vault, keys, name)
    if (has(vault, newName)) throw new KeychainError('EXISTS', `a key named ${newName} already exists: choose another name`)
    const old = vault.entries[name]
    const meta = { ...old, updated_at: now(), version: old.version + 1 }
    delete vault.entries[name]
    vault.entries[newName] = encryptEntry(vault, keys, newName, meta, value)
    return info(newName, vault.entries[newName], true)
  })
}

export async function remove(dataKey: Buffer, name: string): Promise<void> {
  await mutate(dataKey, (vault) => {
    if (!has(vault, name)) throw new KeychainError('NOT_FOUND', `no key named ${name}: run akbun-keychain list`)
    delete vault.entries[name]
  })
}

// Reports instead of throwing, so the user can see what differs after an integrity error.
export function verify(dataKey: Buffer): VerifyResult {
  const vault = readVaultFile(vaultPath())
  const keys = deriveSubkeys(dataKey, vault.vault_id)
  const entries_failed = Object.keys(vault.entries).sort().filter((name) => {
    const entry = vault.entries[name]
    return open(keys.entryKey, entry.value, entryAad(vault.vault_id, name, entry)) === undefined
  })
  return { mac_ok: macMatches(keys.macKey, macInput(vault), vault.mac), entries_failed }
}

// Re-wraps the data key under a new salt. Entries and the MAC do not change.
export async function changePassword(oldPassword: string, newPassword: string, options: InitOptions = {}): Promise<void> {
  checkPassword(newPassword)
  if (options.kdfN !== undefined) checkKdfN(options.kdfN)
  await withLock(vaultLockPath(), () => {
    const vault = readVaultFile(vaultPath())
    const dataKey = unwrap(vault, oldPassword)
    const header = { vault_id: vault.vault_id, kdf: newKdfParams(checkKdfN(options.kdfN ?? vault.kdf.N)) }
    writeVaultFile(vaultPath(), backupPath(), { ...vault, kdf: header.kdf, wrapped_key: wrap(header, newPassword, dataKey) })
    dataKey.fill(0)
  })
}
