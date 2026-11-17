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
// Returns the content judged stale, so the caller can check it is still the same file before removing it.
function staleContent(path: string, staleMs: number): string | undefined {
  let ageMs: number
  let content: string
  try {
    ageMs = Date.now() - statSync(path).mtimeMs
    content = readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
  if (ageMs > staleMs) return content
  try {
    const { pid } = JSON.parse(content) as { pid: unknown }
    return typeof pid === 'number' && !isAlive(pid) ? content : undefined
  } catch {
    return undefined
  }
}

function readQuietly(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
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
    const stale = staleContent(path, staleMs)
    // Two waiters can judge the same lock stale. Re-reading just before removal keeps the slower one from deleting
    // the lock the faster one has just created. A small window remains between the read and the unlink.
    if (stale !== undefined && readQuietly(path) === stale) {
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
