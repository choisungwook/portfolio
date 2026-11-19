import type { Context } from 'hono'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'
import { resourcePath } from '../resources.ts'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

// no-cache: the page can be served from a checkout, so an edited file must not be hidden by the browser cache.
// The policy keeps the page from loading or sending anything outside this origin. The one exception is frames: the
// conversation's browser pane shows a local dev server or an https page the user typed, sandboxed in an iframe.
const HEADERS = {
  'cache-control': 'no-cache',
  'content-security-policy': "default-src 'self'; frame-src 'self' http://localhost:* http://127.0.0.1:* https:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

export async function serveUi(c: Context): Promise<Response> {
  const requested = c.req.path === '/' ? '/index.html' : c.req.path
  const relative = normalize(join('ui', requested))
  const file = relative.startsWith('ui' + sep) ? resourcePath(relative) : undefined
  if (!file) return c.text('not found', 404)
  try {
    const body = await readFile(file)
    return new Response(body, { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...HEADERS } })
  } catch {
    return c.text('not found', 404)
  }
}
