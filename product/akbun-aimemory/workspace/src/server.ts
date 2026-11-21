import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { caBundleInfo, clearCaBundle, saveCaBundle } from './connection/ca-bundle.ts'
import { deleteMemory, deleteSession, exportDb, listSessions, search, sessionMemories, type Store } from './store.ts'

const UI = join(import.meta.dirname, '..', 'ui')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
const MAX_BODY_BYTES = 1_500_000

// Web UI and JSON API for browsing, deleting memories and managing connection settings. Binds to 127.0.0.1 and
// requires the per-start token, the same guard the desktop shell uses.
export function startServer(s: Store, port: number): Promise<{ url: string; close: () => Promise<void> }> {
  const token = randomBytes(16).toString('hex')
  const server = createServer((req, res) => {
    void handle(s, token, req, res).catch((e) => send(res, 500, { error: e instanceof Error ? e.message : String(e) }))
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      const addr = server.address()
      const url = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}/?token=${token}`
      resolve({
        url,
        close: () => new Promise<void>((done, fail) => server.close((err) => (err ? fail(err) : done()))),
      })
    })
  })
}

export async function serve(s: Store, port: number): Promise<string> {
  return (await startServer(s, port)).url
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

class BodyError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk
      size += buf.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        chunks.length = 0
        return
      }
      chunks.push(buf)
    })
    req.on('error', reject)
    req.on('end', () => {
      if (tooLarge) { reject(new BodyError(413, 'request body is too large')); return }
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) { resolve({}); return }
      let parsed: unknown
      try {
        parsed = JSON.parse(text)
      } catch {
        reject(new BodyError(400, 'request body must be valid JSON'))
        return
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reject(new BodyError(400, 'request body must be a JSON object'))
        return
      }
      resolve(parsed as Record<string, unknown>)
    })
  })
}

async function handle(s: Store, token: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/')) {
    const file = normalize(join(UI, url.pathname === '/' ? 'index.html' : url.pathname))
    if (!file.startsWith(UI)) { send(res, 404, { error: 'not found' }); return }
    try {
      res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'text/plain' }).end(readFileSync(file))
    } catch {
      send(res, 404, { error: 'not found' })
    }
    return
  }
  if ((req.headers['x-aimem-token'] ?? url.searchParams.get('token')) !== token) { send(res, 401, { error: 'bad token' }); return }
  const [, , resource, id] = url.pathname.split('/')
  const method = req.method ?? 'GET'
  if (resource === 'sessions' && !id && method === 'GET') { send(res, 200, listSessions(s)); return }
  if (resource === 'sessions' && id && method === 'DELETE') { send(res, 200, { deleted: deleteSession(s, decodeURIComponent(id)) }); return }
  if (resource === 'sessions' && id && method === 'GET') { send(res, 200, sessionMemories(s, decodeURIComponent(id))); return }
  if (resource === 'memories' && id && method === 'DELETE') { send(res, 200, { deleted: deleteMemory(s, Number(id)) }); return }
  if (resource === 'search' && method === 'GET') { send(res, 200, search(s, url.searchParams.get('q') ?? '', { limit: 30 })); return }
  if (resource === 'ca-bundle' && !id) {
    if (method === 'GET') { send(res, 200, caBundleInfo(s.db, s.config)); return }
    if (method === 'DELETE') { send(res, 200, clearCaBundle(s.db, s.config)); return }
    if (method === 'PUT') {
      try {
        const body = await readJsonBody(req)
        if (typeof body.pem !== 'string') { send(res, 400, { error: 'pem must be the text of a PEM file' }); return }
        const saved = saveCaBundle(s.db, s.config, body.pem)
        if (typeof saved === 'string') { send(res, 400, { error: saved }); return }
        send(res, 200, saved)
      } catch (error) {
        if (error instanceof BodyError) { send(res, error.status, { error: error.message }); return }
        throw error
      }
      return
    }
  }
  if (resource === 'export' && method === 'GET') {
    const file = join(tmpdir(), `aimemory-${Date.now()}.db`)
    exportDb(s, file)
    const body = readFileSync(file); rmSync(file)
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="aimemory-backup.db"' }).end(body)
    return
  }
  send(res, 404, { error: 'not found' })
}
