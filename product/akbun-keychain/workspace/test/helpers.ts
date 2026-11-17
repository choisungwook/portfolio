import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const PASSWORD = 'correct horse battery staple'
export const TEST_KDF_N = 2 ** 15
export const FIXTURES = join(import.meta.dirname, 'fixtures')

const homes: string[] = []
// Agents started by a test are detached; stop any that are left before removing their homes.
process.on('exit', () => {
  for (const dir of homes) {
    try {
      const { pid } = JSON.parse(readFileSync(join(dir, 'agent.json'), 'utf8')) as { pid: number }
      if (pid !== process.pid) process.kill(pid)
    } catch {
      // No agent.
    }
    rmSync(dir, { recursive: true, force: true })
  }
})

// Each test file runs in its own process, so pointing the home at a temp directory per test is safe.
// Removal waits for process exit because node:test runs an after() registered inside a hook when that hook ends.
export function useTempHome(): string {
  const dir = mkdtempSync(join(tmpdir(), 'akbun-keychain-test-'))
  process.env.AKBUN_KEYCHAIN_HOME = dir
  homes.push(dir)
  return dir
}

export function encodings(secret: string): string[] {
  const bytes = Buffer.from(secret, 'utf8')
  return [secret, bytes.toString('base64'), bytes.toString('base64url'), bytes.toString('hex'), bytes.toString('hex').toUpperCase()]
}

export const MAIN = join(import.meta.dirname, '..', 'src', 'cli', 'main.ts')

export interface CliResult {
  status: number | null
  stdout: string
  stderr: string
}

// Runs the CLI as a separate process against the current AKBUN_KEYCHAIN_HOME, with a fast KDF.
export function cli(args: string[], input?: string, env: Record<string, string> = {}): CliResult {
  const run = spawnSync(process.execPath, [MAIN, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, AKBUN_KEYCHAIN_TEST_KDF_N: String(TEST_KDF_N), ...env },
    timeout: 30_000,
  })
  return { status: run.status, stdout: run.stdout, stderr: run.stderr }
}

export function cliAsync(args: string[], input?: string): Promise<CliResult> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [MAIN, ...args], {
      env: { ...process.env, AKBUN_KEYCHAIN_TEST_KDF_N: String(TEST_KDF_N) },
    })
    let stdout = ''
    let stderr = ''
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
    child.on('close', (status) => resolve({ status, stdout, stderr }))
    child.stdin.end(input ?? '')
  })
}

export function pw(...lines: string[]): string {
  return `${[PASSWORD, ...lines].join('\n')}\n`
}
