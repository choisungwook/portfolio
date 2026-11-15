import type { Context } from 'hono'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, sep } from 'node:path'

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

// no-cache: the page is served from a checkout, so an edited file must not be hidden by the browser cache.
// The policy keeps the page from loading or sending anything outside this origin.
const HEADERS = {
  'cache-control': 'no-cache',
  'content-security-policy': "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
}

export async function serveUi(c: Context, uiDir: string): Promise<Response> {
  const requested = c.req.path === '/' ? '/index.html' : c.req.path
  const file = normalize(join(uiDir, requested))
  if (!file.startsWith(uiDir + sep)) return c.text('not found', 404)
  try {
    const body = await readFile(file)
    return new Response(body, { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', ...HEADERS } })
  } catch {
    return c.text('not found', 404)
  }
}
