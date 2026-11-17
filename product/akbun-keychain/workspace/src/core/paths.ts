import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function homeDir(): string {
  return process.env.AKBUN_KEYCHAIN_HOME || join(homedir(), '.akbun-keychain')
}

export function vaultPath(): string {
  return join(homeDir(), 'vault.json')
}

export function backupPath(): string {
  return join(homeDir(), 'vault.json.bak')
}

export function vaultLockPath(): string {
  return join(homeDir(), 'vault.lock')
}

export function auditPath(): string {
  return join(homeDir(), 'audit.jsonl')
}

export function auditLockPath(): string {
  return join(homeDir(), 'audit.lock')
}

export function ensureHome(): string {
  const dir = homeDir()
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}
