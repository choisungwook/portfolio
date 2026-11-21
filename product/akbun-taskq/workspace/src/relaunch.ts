import { spawn } from 'node:child_process'
import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { isEmbedded } from './resources.ts'

// Restarting `taskq run` in place, so an installed update starts without the user stopping and starting it. The token
// is handed over in a 0600 file in taskq's data folder, which bots are stopped from touching, and not in the
// environment: a process keeps its first environment readable (ps eww) even after the variable is deleted.
const TOKEN_FILE = 'restart-token'
const TOKEN_TTL_MS = 60_000

// The token a restart handed over, read once: the file is removed whether or not it is used. A stale file is ignored.
export function takeRestartToken(dataDir: string, now = Date.now()): string | undefined {
  const file = join(dataDir, TOKEN_FILE)
  try {
    const fresh = now - statSync(file).mtimeMs < TOKEN_TTL_MS
    const token = readFileSync(file, 'utf8').trim()
    return fresh && /^[0-9a-f]{64}$/.test(token) ? token : undefined
  } catch {
    return undefined
  } finally {
    rmSync(file, { force: true })
  }
}

export function handOverToken(dataDir: string, token: string): void {
  writeFileSync(join(dataDir, TOKEN_FILE), token, { mode: 0o600 })
}

// The arguments that start this process again. The compiled binary's argv[1] is its own path inside the bundle.
export function relaunchArgs(argv: string[], execArgv: string[], embedded: boolean): string[] {
  return embedded ? argv.slice(2) : [...execArgv, ...argv.slice(1)]
}

export function relaunch(dataDir: string, token: string): never {
  handOverToken(dataDir, token)
  const env = process.env as Record<string, string>
  const args = relaunchArgs(process.argv, process.execArgv, isEmbedded())
  // execve keeps the pid and stdout, so the desktop app still owns the process and reads its output.
  const execve = (process as { execve?: (file: string, args: string[], env: Record<string, string>) => never }).execve
  if (typeof execve === 'function') execve(process.execPath, [process.execPath, ...args], env)
  // ponytail: a runtime without execve starts a child on the same stdout; quitting the desktop app then no longer stops it.
  spawn(process.execPath, args, { env, stdio: 'inherit' }).unref()
  process.exit(0)
}
