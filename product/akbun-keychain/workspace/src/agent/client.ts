import { randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { connect } from 'node:net'
import { KeychainError, LOCKED_MESSAGE, isErrorCode } from '../core/errors.ts'
import { agentInfoPath } from '../core/paths.ts'
import type { Actor, AgentInfo, Op, Reply, StreamLine } from './protocol.ts'

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

function removeStale(): void {
  rmSync(agentInfoPath(), { force: true })
}

// agent.json can outlive a killed agent: a dead pid or an expired session counts as locked and the file is removed.
export function readAgentInfo(): AgentInfo | undefined {
  let info: AgentInfo
  try {
    info = JSON.parse(readFileSync(agentInfoPath(), 'utf8')) as AgentInfo
  } catch {
    return undefined
  }
  if (typeof info.pid !== 'number' || !isAlive(info.pid) || Date.parse(info.expires_at) <= Date.now()) {
    removeStale()
    return undefined
  }
  return info
}

export function lockedError(): KeychainError {
  return new KeychainError('LOCKED', LOCKED_MESSAGE)
}

export interface RequestOptions {
  actor: Actor
  onStream?: (line: StreamLine) => void
  signal?: AbortSignal
}

export async function agentRequest<T>(op: Op, params: Record<string, unknown>, options: RequestOptions): Promise<T> {
  const info = readAgentInfo()
  if (!info) throw lockedError()
  const id = randomUUID()
  return new Promise<T>((resolve, reject) => {
    const socket = connect(info.endpoint)
    let buffer = ''
    let settled = false
    const finish = (error: unknown, value?: T) => {
      if (settled) return
      settled = true
      socket.end()
      if (error) reject(error)
      else resolve(value as T)
    }
    options.signal?.addEventListener('abort', () => {
      socket.destroy()
      finish(new KeychainError('UNEXPECTED', 'request cancelled'))
    })
    socket.setEncoding('utf8')
    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id, token: info.token, actor: options.actor, op, params })}\n`)
    })
    socket.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT' || error.code === 'ECONNREFUSED') removeStale()
      finish(lockedError())
    })
    socket.on('close', () => finish(lockedError()))
    socket.on('data', (chunk: string) => {
      buffer += chunk
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = JSON.parse(buffer.slice(0, index)) as Reply | StreamLine
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
        if (line.id !== id) continue
        if ('stream' in line) {
          options.onStream?.(line)
          continue
        }
        if (line.ok) {
          finish(undefined, line.result as T)
        } else {
          if (line.error.code === 'BAD_TOKEN') removeStale()
          const code = isErrorCode(line.error.code) ? line.error.code : 'UNEXPECTED'
          finish(new KeychainError(code, line.error.message))
        }
      }
    })
  })
}

export interface AgentStatus {
  locked: boolean
  expires_at?: string
  idle_expires_at?: string
  entries?: number
}

export async function agentStatus(actor: Actor): Promise<AgentStatus> {
  try {
    const result = await agentRequest<Omit<AgentStatus, 'locked'>>('status', {}, { actor })
    return { locked: false, ...result }
  } catch (error) {
    if (error instanceof KeychainError && (error.code === 'LOCKED' || error.code === 'BAD_TOKEN')) return { locked: true }
    throw error
  }
}
