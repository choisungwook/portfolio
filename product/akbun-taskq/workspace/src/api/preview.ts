import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { realpathSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, resolve } from 'node:path'
import type { Hono } from 'hono'
import { HttpError, readJson, type ApiDeps } from './http.ts'
import { sharedDir, sharedRelative } from '../team/shared.ts'
import { under } from '../worker/paths.ts'

// HTML a bot made, previewed in the UI as it would look opened in a browser. The page's own policy blocks inline style
// and script, and a srcdoc frame inherits it, so the HTML is served from /preview/<ticket>/ with a policy of its own:
// `sandbox allow-scripts` gives it an opaque origin even when opened directly, so its scripts cannot read taskq's
// storage or call the API, and only taskq may frame it. The ticket is a random id the UI gets through the API (with the
// token); it lets the frame load the file and the files beside it (images, CSS) for TICKET_SEC, nothing else.

const TICKET_SEC = 600
const MAX_TICKETS = 200

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.htm': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
}

const tickets = new Map<string, { dir: string; expires: number }>()

function prune(now: number): void {
  for (const [id, ticket] of tickets) if (ticket.expires <= now) tickets.delete(id)
  while (tickets.size >= MAX_TICKETS) tickets.delete(tickets.keys().next().value as string)
}

export function registerPreview(app: Hono, api: Hono, { config }: ApiDeps): void {
  api.post('/shared/preview', async (c) => {
    const body = await readJson(c) as { path?: unknown } | null
    const rel = typeof body?.path === 'string' ? sharedRelative(config, body.path) : null
    if (!rel || !/\.html?$/i.test(rel)) throw new HttpError(404, 'no such HTML file in the shared folder')
    const now = Date.now()
    prune(now)
    const id = randomBytes(16).toString('hex')
    tickets.set(id, { dir: realpathSync(dirname(join(sharedDir(config), rel))), expires: now + TICKET_SEC * 1000 })
    return c.json({ url: `/preview/${id}/${encodeURIComponent(basename(rel))}` })
  })

  const ancestors = `http://127.0.0.1:${config.port} http://localhost:${config.port}`
  app.get('/preview/:id/*', async (c) => {
    const ticket = tickets.get(c.req.param('id'))
    if (!ticket || ticket.expires <= Date.now()) return c.text('this preview expired; open the file again', 404)
    let file: string
    try {
      const rest = decodeURIComponent(c.req.path.split('/').slice(3).join('/'))
      file = realpathSync(resolve(ticket.dir, rest))
      if (!under(file, ticket.dir) || !statSync(file).isFile()) throw new Error('outside')
    } catch {
      return c.text('not found', 404)
    }
    return new Response(await readFile(file), {
      headers: {
        'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
        'content-security-policy': `sandbox allow-scripts; default-src 'self' https: data: blob: 'unsafe-inline' 'unsafe-eval'; frame-ancestors ${ancestors}; base-uri 'self'; form-action 'none'`,
        // The page has an opaque origin; this lets it fetch its own data files (the ticket is what grants access).
        'access-control-allow-origin': 'null',
        'cache-control': 'no-store',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    })
  })
}

export function clearPreviews(): void {
  tickets.clear()
}
