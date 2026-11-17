import { spawn } from 'node:child_process'
import { KeychainError } from '../core/errors.ts'
import { createMasker, type Secret } from './mask.ts'
import type { RunParams, RunResult } from './protocol.ts'

export interface RunSecret extends Secret {
  variable: string
}

export interface RunHandle {
  result: Promise<RunResult>
  kill: () => void
}

// Starts the child without a shell, in the caller's directory, with the caller's environment plus the secrets.
// Output is masked before it leaves this process.
export function runChild(
  params: RunParams,
  secrets: RunSecret[],
  emit: (stream: 'stdout' | 'stderr', data: string) => void,
): RunHandle {
  const env: Record<string, string> = { ...params.base_env }
  for (const secret of secrets) env[secret.variable] = secret.value
  const [program, ...args] = params.command
  const child = spawn(program, args, {
    cwd: params.cwd,
    env,
    shell: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  })
  let timedOut = false
  let timer: NodeJS.Timeout | undefined

  const result = new Promise<RunResult>((resolve, reject) => {
    const maskers = { stdout: createMasker(secrets), stderr: createMasker(secrets) }
    for (const stream of ['stdout', 'stderr'] as const) {
      child[stream].on('data', (chunk: Buffer) => {
        const text = maskers[stream].push(chunk)
        if (text) emit(stream, text)
      })
    }
    child.on('error', (error: NodeJS.ErrnoException) => {
      if (timer) clearTimeout(timer)
      reject(new KeychainError('SPAWN_FAILED', `could not start ${program}: ${error.code ?? 'error'}. Check the program name and PATH`))
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      for (const stream of ['stdout', 'stderr'] as const) {
        const text = maskers[stream].end()
        if (text) emit(stream, text)
      }
      resolve({ exit_code: timedOut ? null : code, timed_out: timedOut })
    })
  })

  child.stdin.on('error', () => {})
  if (params.stdin !== undefined) child.stdin.end(params.stdin)
  else child.stdin.end()

  if (params.timeout_ms !== undefined) {
    timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, params.timeout_ms)
  }

  return { result, kill: () => child.kill('SIGKILL') }
}
