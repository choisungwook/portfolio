import { spawn } from 'node:child_process'
import { KeychainError } from '../core/errors.ts'

// In a checkout the executable is node and the script is argv[1]. In a bun-compiled binary argv[1] points inside the
// embedded file system, and the binary itself is the program.
export function selfCommand(): [string, string[]] {
  const script = process.argv[1] ?? ''
  if (/\$bunfs|~BUN/.test(script) || script === '') return [process.execPath, []]
  return [process.execPath, [...process.execArgv, script]]
}

export interface Handover {
  data_key: string
  idle_ms: number
  absolute_ms: number
  actor: 'cli' | 'gui'
}

// Starts `akbun-keychain agent` detached and hands it the data key on stdin, never in arguments or the environment.
// Resolves once the agent prints its ready line.
export function startDetachedAgent(dataKey: Buffer, idleMs: number, absoluteMs: number, actor: 'cli' | 'gui'): Promise<void> {
  const [program, args] = selfCommand()
  const child = spawn(program, [...args, 'agent'], {
    detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
    env: process.env,
  })
  const handover: Handover = { data_key: dataKey.toString('base64'), idle_ms: idleMs, absolute_ms: absoluteMs, actor }
  child.stdin.end(`${JSON.stringify(handover)}\n`)
  return new Promise<void>((resolve, reject) => {
    let output = ''
    let errors = ''
    const timer = setTimeout(() => fail('the agent did not start within 15 seconds'), 15_000)
    function fail(message: string): void {
      clearTimeout(timer)
      child.kill()
      reject(new KeychainError('UNEXPECTED', `${message}: retry unlock`))
    }
    child.stderr.setEncoding('utf8')
    child.stderr.on('data', (chunk: string) => {
      errors += chunk
    })
    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (chunk: string) => {
      output += chunk
      if (!output.includes('ready\n')) return
      clearTimeout(timer)
      child.stdout.destroy()
      child.stderr.destroy()
      child.unref()
      resolve()
    })
    child.on('error', () => fail('the agent could not be started'))
    child.on('exit', (code) => {
      if (!output.includes('ready\n')) fail(`the agent exited with ${code}${errors ? `: ${errors.trim().split('\n')[0]}` : ''}`)
    })
  })
}
