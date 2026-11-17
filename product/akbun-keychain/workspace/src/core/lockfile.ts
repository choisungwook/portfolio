import { closeSync, openSync, readFileSync, statSync, unlinkSync, writeSync } from 'node:fs'
import { KeychainError } from './errors.ts'

export interface LockOptions {
  timeoutMs?: number
  retryMs?: number
  staleMs?: number
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

// A lock is stale when its owner is gone or it is older than staleMs. A file that cannot be parsed yet may be one
// another process has just created, so only its age counts.
function isStale(path: string, staleMs: number): boolean {
  let ageMs: number
  try {
    ageMs = Date.now() - statSync(path).mtimeMs
  } catch {
    return false
  }
  if (ageMs > staleMs) return true
  try {
    const { pid } = JSON.parse(readFileSync(path, 'utf8')) as { pid: unknown }
    return typeof pid === 'number' && !isAlive(pid)
  } catch {
    return false
  }
}

function tryCreate(path: string): boolean {
  try {
    const fd = openSync(path, 'wx', 0o600)
    try {
      writeSync(fd, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
    } finally {
      closeSync(fd)
    }
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
}

function removeQuietly(path: string): void {
  try {
    unlinkSync(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
}

export async function withLock<T>(path: string, fn: () => T | Promise<T>, options: LockOptions = {}): Promise<T> {
  const { timeoutMs = 5000, retryMs = 50, staleMs = 30_000 } = options
  const deadline = Date.now() + timeoutMs
  while (!tryCreate(path)) {
    if (isStale(path, staleMs)) {
      removeQuietly(path)
      continue
    }
    if (Date.now() >= deadline) {
      throw new KeychainError('LOCK_TIMEOUT', `${path} is held by another process: retry, or remove it if no akbun-keychain is running`)
    }
    await new Promise((resolve) => setTimeout(resolve, retryMs))
  }
  try {
    return await fn()
  } finally {
    removeQuietly(path)
  }
}
