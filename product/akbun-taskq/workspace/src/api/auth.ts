import { timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'

// Every /api request carries the per-start token. EventSource cannot set headers, so the stream also accepts ?token=.
// Static files are not behind this check.
export function requireToken(token: string): MiddlewareHandler {
  const expected = Buffer.from(token)
  return async (c, next) => {
    const sent = c.req.header('x-taskq-token')
      ?? (c.req.path === '/api/events/stream' ? c.req.query('token') : undefined)
    if (!sent || !sameToken(Buffer.from(sent), expected)) return c.json({ error: 'unauthorized' }, 401)
    await next()
  }
}

function sameToken(sent: Buffer, expected: Buffer): boolean {
  return sent.length === expected.length && timingSafeEqual(sent, expected)
}
