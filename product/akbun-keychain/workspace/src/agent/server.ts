import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type Socket } from 'node:net'
import { appendAudit, type AuditEvent } from '../core/audit.ts'
import { KeychainError, isErrorCode } from '../core/errors.ts'
import { agentEndpoint, agentInfoPath, ensureHome } from '../core/paths.ts'
import { SESSION_CREATE_ACCESS, assertSessionMayReveal, assertSessionMayRun, sessionView } from '../core/policy.ts'
import { checkName } from '../core/vault-file.ts'
import { create, list, reveal, verify, type EntryInfo } from '../core/vault.ts'
import { ACTORS, OPS, MAX_LINE_BYTES, type AgentInfo, type Reply, type Request, type RunParams } from './protocol.ts'
import { runChild, type RunHandle, type RunSecret } from './run.ts'

export interface AgentOptions {
  dataKey: Buffer
  idleMs: number
  absoluteMs: number
  actor?: 'cli' | 'gui'
  onExit?: () => void
}

export interface RunningAgent {
  info: AgentInfo
  close: () => Promise<void>
}

const ENV_NAME = /^[A-Za-z_][A-Za-z0-9_]*$/

function iso(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function invalid(what: string): KeychainError {
  return new KeychainError('INVALID', `${what}: see akbun-keychain help`)
}

function str(params: Record<string, unknown>, key: string, optional = false): string | undefined {
  const value = params[key]
  if (value === undefined && optional) return undefined
  if (typeof value !== 'string') throw invalid(`parameter ${key} must be a string`)
  return value
}

function parseRun(params: Record<string, unknown>): RunParams {
  const { command, env, base_env, cwd, stdin, timeout_ms } = params
  if (!Array.isArray(command) || command.length === 0 || !command.every((part) => typeof part === 'string')) {
    throw invalid('command must be a non-empty array of strings')
  }
  const isStringMap = (value: unknown) =>
    value !== null && typeof value === 'object' && Object.values(value).every((item) => typeof item === 'string')
  if (!isStringMap(env) || !isStringMap(base_env)) throw invalid('env and base_env must map names to strings')
  for (const name of Object.keys(env as object)) if (!ENV_NAME.test(name)) throw invalid('an environment variable name is invalid')
  if (typeof cwd !== 'string') throw invalid('cwd must be a string')
  if (stdin !== undefined && typeof stdin !== 'string') throw invalid('stdin must be a string')
  if (timeout_ms !== undefined && (typeof timeout_ms !== 'number' || !Number.isFinite(timeout_ms) || timeout_ms <= 0)) {
    throw invalid('timeout_ms must be a positive number')
  }
  return {
    command: command as string[],
    env: env as Record<string, string>,
    base_env: base_env as Record<string, string>,
    cwd,
    stdin: stdin as string | undefined,
    timeout_ms: timeout_ms as number | undefined,
  }
}

function tokenMatches(expected: Buffer, given: unknown): boolean {
  if (typeof given !== 'string') return false
  const actual = Buffer.from(given, 'utf8')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

async function audit(event: AuditEvent): Promise<void> {
  try {
    await appendAudit(event)
  } catch {
    // The audit log is best effort: a full disk must not turn a successful operation into a failure.
  }
}

// The agent holds the data key and answers newline-delimited JSON on a local socket. Every request carries the
// session token. It re-reads vault.json on every request, so changes from the CLI or the page are visible at once.
export async function startAgent(options: AgentOptions): Promise<RunningAgent> {
  ensureHome()
  const { dataKey } = options
  const tokenText = randomBytes(32).toString('base64url')
  const token = Buffer.from(tokenText, 'utf8')
  const endpoint = agentEndpoint()
  const startedAt = Date.now()
  const absoluteAt = startedAt + options.absoluteMs
  let idleAt = startedAt + options.idleMs
  const sockets = new Set<Socket>()
  const children = new Set<RunHandle>()
  let closing: Promise<void> | undefined
  let idleTimer: NodeJS.Timeout
  const info: AgentInfo = { pid: process.pid, endpoint, token: tokenText, expires_at: iso(absoluteAt) }

  function close(): Promise<void> {
    closing ??= new Promise<void>((resolve) => {
      clearTimeout(idleTimer)
      clearTimeout(absoluteTimer)
      dataKey.fill(0)
      for (const child of children) child.kill()
      for (const socket of sockets) socket.destroy()
      try {
        const current = JSON.parse(readFileSync(agentInfoPath(), 'utf8')) as AgentInfo
        if (current.token === tokenText) rmSync(agentInfoPath(), { force: true })
      } catch {
        // Already gone.
      }
      server.close(() => {
        if (process.platform !== 'win32') rmSync(endpoint, { force: true })
        resolve()
        options.onExit?.()
      })
    })
    return closing
  }

  function touch(): void {
    idleAt = Math.min(Date.now() + options.idleMs, absoluteAt)
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => {
      // A running command is activity: its own timeout ends it, not the idle timeout.
      if (children.size > 0) touch()
      else void close()
    }, Math.max(0, idleAt - Date.now()))
  }

  const absoluteTimer = setTimeout(() => void close(), options.absoluteMs)

  function entries(): EntryInfo[] {
    return list(dataKey)
  }

  function find(name: string): EntryInfo {
    const entry = entries().find((item) => item.name === name)
    if (!entry) throw new KeychainError('NOT_FOUND', `no key named ${name}: call list first`)
    return entry
  }

  async function handle(request: Request, send: (line: unknown) => void, socket: Socket): Promise<unknown> {
    const { op, actor, params } = request
    switch (op) {
      case 'status':
        return { expires_at: iso(absoluteAt), idle_expires_at: iso(idleAt), entries: entries().length }
      case 'list': {
        const tag = str(params, 'tag', true)
        return { entries: entries().filter((entry) => !tag || entry.tags.includes(tag)).map(sessionView) }
      }
      case 'get': {
        const name = str(params, 'name') as string
        try {
          assertSessionMayReveal(find(name))
          const value = reveal(dataKey, name)
          await audit({ actor, op: 'reveal', keys: [name], ok: true })
          return { value }
        } catch (error) {
          await audit({ actor, op: 'reveal', keys: [name], ok: false, code: (error as KeychainError).code })
          throw error
        }
      }
      case 'create': {
        const name = str(params, 'name') as string
        checkName(name)
        const tags = params.tags
        if (tags !== undefined && (!Array.isArray(tags) || !tags.every((tag) => typeof tag === 'string'))) {
          throw invalid('tags must be an array of strings')
        }
        try {
          const created = await create(dataKey, {
            name,
            value: str(params, 'value') as string,
            description: str(params, 'description', true),
            tags: tags as string[] | undefined,
            ai_access: SESSION_CREATE_ACCESS,
          })
          await audit({ actor, op: 'create', keys: [name], ok: true })
          return { name: created.name, version: created.version }
        } catch (error) {
          await audit({ actor, op: 'create', keys: [name], ok: false, code: (error as KeychainError).code })
          throw error
        }
      }
      case 'verify':
        return verify(dataKey)
      case 'lock':
        await audit({ actor, op: 'lock', keys: [], ok: true })
        setImmediate(() => void close())
        return {}
      case 'run':
        return run(request, parseRun(params), send, socket)
    }
  }

  async function run(request: Request, params: RunParams, send: (line: unknown) => void, socket: Socket): Promise<unknown> {
    const keys = [...new Set(Object.values(params.env))]
    const program = params.command[0].slice(0, 256)
    const variables = Object.keys(params.env)
    const event = { actor: request.actor, op: 'run' as const, keys, program, env: variables }
    let secrets: RunSecret[]
    try {
      const all = entries()
      secrets = Object.entries(params.env).map(([variable, name]) => {
        const entry = all.find((item) => item.name === name)
        if (!entry) throw new KeychainError('NOT_FOUND', `no key named ${name}: call list first`)
        assertSessionMayRun(entry)
        return { variable, name, value: reveal(dataKey, name) }
      })
    } catch (error) {
      await audit({ ...event, ok: false, code: (error as KeychainError).code })
      throw error
    }
    const handle = runChild(params, secrets, (stream, data) => send({ id: request.id, stream, data }))
    children.add(handle)
    const onClose = () => handle.kill()
    socket.once('close', onClose)
    try {
      const result = await handle.result
      await audit({ ...event, ok: !result.timed_out, code: result.timed_out ? 'TIMEOUT' : undefined, exit_code: result.exit_code })
      if (result.timed_out) throw new KeychainError('TIMEOUT', `${program} was killed at the timeout: raise timeout or check the command`)
      return result
    } catch (error) {
      if ((error as KeychainError).code === 'SPAWN_FAILED') await audit({ ...event, ok: false, code: 'SPAWN_FAILED' })
      throw error
    } finally {
      children.delete(handle)
      socket.off('close', onClose)
      touch()
    }
  }

  function reply(send: (line: unknown) => void, id: string, error: unknown): void {
    if (error instanceof KeychainError && isErrorCode(error.code)) {
      send({ id, ok: false, error: { code: error.code, message: error.message } } satisfies Reply)
    } else {
      send({ id, ok: false, error: { code: 'UNEXPECTED', message: 'internal error in the agent: retry, or lock and unlock again' } } satisfies Reply)
    }
  }

  async function onLine(line: string, send: (line: unknown) => void, socket: Socket): Promise<void> {
    let request: Request
    try {
      request = JSON.parse(line) as Request
    } catch {
      send({ id: '', ok: false, error: { code: 'INVALID', message: 'request is not JSON' } })
      return
    }
    const id = typeof request?.id === 'string' ? request.id : ''
    if (!tokenMatches(token, request?.token)) {
      send({ id, ok: false, error: { code: 'BAD_TOKEN', message: 'session token does not match: the agent was restarted, run status again' } })
      return
    }
    touch()
    try {
      if (!(OPS as readonly string[]).includes(request.op)) throw invalid('unknown op')
      if (!(ACTORS as readonly string[]).includes(request.actor)) throw invalid('unknown actor')
      if (request.params === null || typeof request.params !== 'object') request.params = {}
      const result = await handle(request, send, socket)
      send({ id, ok: true, result } satisfies Reply)
    } catch (error) {
      reply(send, id, error)
    }
  }

  const server: Server = createServer((socket) => {
    sockets.add(socket)
    socket.on('close', () => sockets.delete(socket))
    socket.on('error', () => {})
    const send = (line: unknown) => {
      if (!socket.destroyed) socket.write(`${JSON.stringify(line)}\n`)
    }
    let buffer = ''
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      buffer += chunk
      if (buffer.length > MAX_LINE_BYTES) {
        socket.destroy()
        return
      }
      let index = buffer.indexOf('\n')
      while (index !== -1) {
        const line = buffer.slice(0, index)
        buffer = buffer.slice(index + 1)
        if (line.trim()) void onLine(line, send, socket)
        index = buffer.indexOf('\n')
      }
    })
  })

  if (process.platform !== 'win32') rmSync(endpoint, { force: true })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(endpoint, () => resolve())
  })
  touch()
  writeFileSync(agentInfoPath(), `${JSON.stringify(info)}\n`, { mode: 0o600 })
  await audit({ actor: options.actor ?? 'cli', op: 'unlock', keys: [], ok: true })
  return { info, close }
}
