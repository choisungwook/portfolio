import { spawn } from 'node:child_process'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { agentRequest, agentStatus } from '../agent/client.ts'
import { ABSOLUTE_LIMIT_MS, DEFAULT_IDLE_MS } from '../agent/protocol.ts'
import { startDetachedAgent } from '../agent/spawn.ts'
import { appendAudit, readAudit, type AuditEvent } from '../core/audit.ts'
import { KeychainError, type ErrorCode } from '../core/errors.ts'
import { checkAiAccess, type AiAccess } from '../core/vault-file.ts'
import { create, list, openVault, remove, rename, reveal, update } from '../core/vault.ts'
import { readResource } from '../resources.ts'

export const MAX_LOGIN_FAILURES = 5
export const GUI_IDLE_MS = 10 * 60 * 1000
const MAX_BODY = 256 * 1024
const COOKIE = 'akbun_keychain_session'

const STATUS: Partial<Record<ErrorCode, number>> = {
  USAGE: 400,
  INVALID: 400,
  BAD_PASSWORD: 401,
  DENIED: 403,
  NOT_FOUND: 404,
  EXISTS: 409,
  INTEGRITY: 409,
  LOCKED: 409,
  LOCK_TIMEOUT: 503,
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export interface GuiOptions {
  port: number
  idleMs?: number
  onClose?: (exitCode: number) => void
}

export interface RunningGui {
  port: number
  url: string
  close: (exitCode?: number) => void
}

function secretEquals(given: unknown, expected: string): boolean {
  if (typeof given !== 'string') return false
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function cookieOf(request: IncomingMessage): string | undefined {
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name, ...value] = part.trim().split('=')
    if (name === COOKIE) return value.join('=')
  }
  return undefined
}

async function audit(event: Omit<AuditEvent, 'actor'>): Promise<void> {
  try {
    await appendAudit({ actor: 'gui', ...event })
  } catch {
    // Best effort.
  }
}

function strings(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new KeychainError('INVALID', `${field} must be an array of strings`)
  }
  return value
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new KeychainError('INVALID', `${field} must be a string`)
  return value
}

function access(value: unknown): AiAccess | undefined {
  const level = optionalString(value, 'ai_access')
  if (level !== undefined) checkAiAccess(level)
  return level as AiAccess | undefined
}

// The page server. It holds its own data key after login and ends with it: logout, Ctrl+C, the idle timeout or the
// fifth wrong password. Every /api route but login needs the session cookie, the exact Host, and on writes the Origin.
export async function startGui(options: GuiOptions): Promise<RunningGui & { bootstrap: string }> {
  const bootstrap = randomBytes(24).toString('base64url')
  let bootstrapUsed = false
  let session: string | undefined
  let dataKey: Buffer | undefined
  let failures = 0
  let closed = false
  let idleTimer: NodeJS.Timeout | undefined
  let port = 0
  const idleMs = options.idleMs ?? GUI_IDLE_MS

  function close(exitCode = 0): void {
    if (closed) return
    closed = true
    if (idleTimer) clearTimeout(idleTimer)
    dataKey?.fill(0)
    dataKey = undefined
    server.close(() => options.onClose?.(exitCode))
    server.closeAllConnections()
  }

  function touch(): void {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => close(0), idleMs)
  }

  function send(response: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const text = JSON.stringify(body)
    response.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    })
    response.end(text)
  }

  function sendError(response: ServerResponse, error: unknown): void {
    if (error instanceof KeychainError) {
      send(response, STATUS[error.code] ?? 500, { error: error.code, message: error.message })
    } else {
      send(response, 500, { error: 'UNEXPECTED', message: 'internal error in the page server' })
    }
  }

  async function body(request: IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = []
    let size = 0
    for await (const chunk of request) {
      size += (chunk as Buffer).length
      if (size > MAX_BODY) throw new KeychainError('INVALID', 'request body too large')
      chunks.push(chunk as Buffer)
    }
    if (size === 0) return {}
    try {
      const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object')
      return parsed as Record<string, unknown>
    } catch {
      throw new KeychainError('INVALID', 'request body is not a JSON object')
    }
  }

  function serveStatic(path: string, response: ServerResponse): void {
    const relative = path === '/' ? 'ui/index.html' : `ui${path}`
    const extension = relative.slice(relative.lastIndexOf('.'))
    const content = !relative.includes('..') && TYPES[extension] ? readResource(relative) : undefined
    if (!content) {
      send(response, 404, { error: 'NOT_FOUND', message: 'no such page' })
      return
    }
    response.writeHead(200, {
      'Content-Type': TYPES[extension],
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
    })
    response.end(content)
  }

  async function login(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const input = await body(request)
    if (bootstrapUsed || !secretEquals(input.bootstrap, bootstrap)) {
      send(response, 401, { error: 'BAD_BOOTSTRAP', message: 'this link was already used: run akbun-keychain gui again' })
      return
    }
    try {
      dataKey = openVault(typeof input.password === 'string' ? input.password : '')
    } catch (error) {
      if (!(error instanceof KeychainError && error.code === 'BAD_PASSWORD')) throw error
      failures++
      await audit({ op: 'login', keys: [], ok: false, code: 'BAD_PASSWORD' })
      const attempts_left = MAX_LOGIN_FAILURES - failures
      send(response, 401, { error: 'BAD_PASSWORD', message: 'wrong root password', attempts_left })
      if (attempts_left <= 0) setImmediate(() => close(4))
      return
    }
    bootstrapUsed = true
    session = randomBytes(32).toString('base64url')
    await audit({ op: 'login', keys: [], ok: true })
    send(response, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=${session}; HttpOnly; SameSite=Strict; Path=/` })
  }

  async function api(method: string, path: string, url: URL, request: IncomingMessage, response: ServerResponse): Promise<void> {
    const key = dataKey as Buffer
    if (method === 'POST' && path === '/api/logout') {
      send(response, 200, { ok: true })
      setImmediate(() => close(0))
      return
    }
    if (method === 'GET' && path === '/api/keys') {
      send(response, 200, { entries: list(key) })
      return
    }
    if (method === 'POST' && path === '/api/keys') {
      const input = await body(request)
      const name = optionalString(input.name, 'name') ?? ''
      try {
        const created = await create(key, {
          name,
          value: optionalString(input.value, 'value') ?? '',
          description: optionalString(input.description, 'description'),
          tags: strings(input.tags, 'tags'),
          ai_access: access(input.ai_access),
        })
        await audit({ op: 'create', keys: [name], ok: true })
        send(response, 201, created)
      } catch (error) {
        await audit({ op: 'create', keys: [name].filter(Boolean), ok: false, code: (error as KeychainError).code ?? 'UNEXPECTED' }).catch(() => {})
        throw error
      }
      return
    }
    if (method === 'GET' && path === '/api/audit') {
      const limit = Math.min(1000, Math.max(1, Number(url.searchParams.get('limit') ?? 100) || 100))
      send(response, 200, { lines: readAudit(limit) })
      return
    }
    if (method === 'GET' && path === '/api/agent') {
      send(response, 200, await agentStatus('gui'))
      return
    }
    if (method === 'POST' && path === '/api/agent/unlock') {
      const input = await body(request)
      const minutes = input.ttl_minutes === undefined ? DEFAULT_IDLE_MS / 60_000 : Number(input.ttl_minutes)
      if (!Number.isFinite(minutes) || minutes <= 0 || minutes * 60_000 > ABSOLUTE_LIMIT_MS) {
        throw new KeychainError('INVALID', 'ttl_minutes must be between 1 and 480')
      }
      const current = await agentStatus('gui')
      if (current.locked) await startDetachedAgent(Buffer.from(key), minutes * 60_000, ABSOLUTE_LIMIT_MS, 'gui')
      send(response, 200, await agentStatus('gui'))
      return
    }
    if (method === 'POST' && path === '/api/agent/lock') {
      try {
        await agentRequest('lock', {}, { actor: 'gui' })
      } catch (error) {
        if (!(error instanceof KeychainError && (error.code === 'LOCKED' || error.code === 'BAD_TOKEN'))) throw error
      }
      send(response, 200, { locked: true })
      return
    }
    const match = /^\/api\/keys\/([^/]+)(\/reveal)?$/.exec(path)
    if (match) {
      const name = decodeURIComponent(match[1])
      if (match[2] && method === 'POST') {
        try {
          const value = reveal(key, name)
          await audit({ op: 'reveal', keys: [name], ok: true })
          send(response, 200, { value })
        } catch (error) {
          await audit({ op: 'reveal', keys: [name], ok: false, code: (error as KeychainError).code ?? 'UNEXPECTED' }).catch(() => {})
          throw error
        }
        return
      }
      if (!match[2] && method === 'PATCH') {
        const input = await body(request)
        const change = {
          value: optionalString(input.value, 'value') || undefined,
          description: optionalString(input.description, 'description'),
          tags: strings(input.tags, 'tags'),
          ai_access: access(input.ai_access),
        }
        const newName = optionalString(input.rename, 'rename')
        let result: Awaited<ReturnType<typeof update>> | undefined
        if (Object.values(change).some((value) => value !== undefined)) {
          result = await update(key, name, change)
          await audit({ op: 'update', keys: [name], ok: true })
        }
        if (newName !== undefined && newName !== name) {
          result = await rename(key, name, newName)
          await audit({ op: 'rename', keys: [name, newName], ok: true })
        }
        if (!result) throw new KeychainError('INVALID', 'nothing to change')
        send(response, 200, result)
        return
      }
      if (!match[2] && method === 'DELETE') {
        await remove(key, name)
        await audit({ op: 'delete', keys: [name], ok: true })
        send(response, 200, { ok: true })
        return
      }
    }
    send(response, 404, { error: 'NOT_FOUND', message: 'no such route' })
  }

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = `http://127.0.0.1:${port}`
    if (request.headers.host !== `127.0.0.1:${port}`) {
      send(response, 421, { error: 'BAD_HOST', message: 'open the page through 127.0.0.1' })
      return
    }
    const method = request.method ?? 'GET'
    const url = new URL(request.url ?? '/', origin)
    const path = url.pathname
    touch()
    if (!path.startsWith('/api/')) {
      if (method !== 'GET') send(response, 405, { error: 'INVALID', message: 'method not allowed' })
      else serveStatic(path, response)
      return
    }
    if (method !== 'GET' && request.headers.origin !== origin) {
      send(response, 403, { error: 'BAD_ORIGIN', message: 'request from another origin refused' })
      return
    }
    try {
      if (method === 'POST' && path === '/api/login') {
        await login(request, response)
        return
      }
      if (!session || !dataKey || !secretEquals(cookieOf(request), session)) {
        send(response, 401, { error: 'NO_SESSION', message: 'log in first' })
        return
      }
      await api(method, path, url, request, response)
    } catch (error) {
      sendError(response, error)
    }
  }

  const server = createServer((request, response) => void handle(request, response))
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(options.port, '127.0.0.1', () => resolve())
  })
  port = (server.address() as AddressInfo).port
  touch()
  return { port, url: `http://127.0.0.1:${port}/`, bootstrap, close }
}

function openBrowser(url: string): boolean {
  const [program, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]]
  try {
    const child = spawn(program, args as string[], { detached: true, stdio: 'ignore', windowsHide: true })
    child.on('error', () => {})
    child.unref()
    return true
  } catch {
    return false
  }
}

export async function serveGui(options: { port: number; open: boolean; print: (text: string) => void }): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    startGui({ port: options.port, onClose: (code) => resolve(code) })
      .then((gui) => {
        const link = `${gui.url}#bootstrap=${gui.bootstrap}`
        if (options.open && openBrowser(link)) {
          options.print(`Opened the page on ${gui.url} in your browser. Press Ctrl+C to stop.`)
        } else {
          // The one-time link is the way in; it stops working after the first login.
          options.print(`Open this link once: ${link}`)
          options.print('Press Ctrl+C to stop.')
        }
        for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => gui.close(0))
      })
      .catch(reject)
  })
}
