import { createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
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

export function agentInfoPath(): string {
  return join(homeDir(), 'agent.json')
}

function homeHash(): string {
  return createHash('sha256').update(homeDir()).digest('hex').slice(0, 16)
}

// A Unix socket path is limited to about 104 bytes. A long home moves the socket to a 0700 directory under the OS
// temp directory; agent.json records whichever path was used. Windows uses a named pipe.
export function agentEndpoint(): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\akbun-keychain-${homeHash()}`
  const inHome = join(homeDir(), 'agent.sock')
  if (Buffer.byteLength(inHome) <= 100) return inHome
  const dir = join(tmpdir(), `akbun-keychain-${process.getuid?.() ?? 'user'}-${homeHash()}`)
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  return join(dir, 'agent.sock')
}
