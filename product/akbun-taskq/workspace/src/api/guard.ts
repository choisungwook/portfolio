import type { MiddlewareHandler } from 'hono'

// Only the local UI origin may talk to the API. Blocks DNS rebinding (foreign Host) and cross-site writes.
// Writes must be JSON: a foreign form post cannot carry application/json without a CORS preflight.
export function guard(port: number): MiddlewareHandler {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`])
  const origins = new Set([...hosts].map((host) => `http://${host}`))
  return async (c, next) => {
    if (!hosts.has(c.req.header('host') ?? '')) return c.json({ error: 'forbidden host' }, 403)
    if (c.req.method !== 'GET') {
      const origin = c.req.header('origin')
      if (origin && !origins.has(origin)) return c.json({ error: 'forbidden origin' }, 403)
      if (!isJson(c.req.header('content-type'))) return c.json({ error: 'content type must be application/json' }, 415)
    }
    await next()
  }
}

// application/json, optionally with charset=utf-8 and nothing else.
export function isJson(value: string | undefined): boolean {
  if (value === undefined) return false
  const [media, ...params] = value.split(';').map((part) => part.trim().toLowerCase())
  return media === 'application/json' && params.every((param) => param === 'charset=utf-8')
}
