import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { extname, join, normalize } from 'node:path'
import { deleteMemory, deleteSession, exportDb, listSessions, search, sessionMemories, type Store } from './store.ts'

const UI = join(import.meta.dirname, '..', 'ui')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }

// Web UI and JSON API for browsing and deleting memories. Binds to 127.0.0.1 and requires the per-start token, the same
// guard the desktop shell will use.
export function serve(s: Store, port: number): Promise<string> {
  const token = randomBytes(16).toString('hex')
  const server = createServer((req, res) => {
    try { handle(s, token, req, res) } catch (e) { send(res, 500, { error: e instanceof Error ? e.message : String(e) }) }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => {
    const addr = server.address()
    resolve(`http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : port}/?token=${token}`)
  }))
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body))
}

function handle(s: Store, token: string, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://x')
  if (!url.pathname.startsWith('/api/')) {
    const file = normalize(join(UI, url.pathname === '/' ? 'index.html' : url.pathname))
    if (!file.startsWith(UI)) return send(res, 404, { error: 'not found' })
    try { return res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'text/plain' }).end(readFileSync(file)) } catch { return send(res, 404, { error: 'not found' }) }
  }
  if ((req.headers['x-aimem-token'] ?? url.searchParams.get('token')) !== token) return send(res, 401, { error: 'bad token' })
  const [, , resource, id] = url.pathname.split('/')
  const del = req.method === 'DELETE'
  if (resource === 'sessions' && !id) return send(res, 200, listSessions(s))
  if (resource === 'sessions' && del) return send(res, 200, { deleted: deleteSession(s, decodeURIComponent(id)) })
  if (resource === 'sessions') return send(res, 200, sessionMemories(s, decodeURIComponent(id)))
  if (resource === 'memories' && del) return send(res, 200, { deleted: deleteMemory(s, Number(id)) })
  if (resource === 'search') return send(res, 200, search(s, url.searchParams.get('q') ?? '', { limit: 30 }))
  if (resource === 'export') {
    const file = join(tmpdir(), `aimemory-${Date.now()}.db`)
    exportDb(s, file)
    const body = readFileSync(file); rmSync(file)
    return res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="aimemory-backup.db"' }).end(body)
  }
  send(res, 404, { error: 'not found' })
}
