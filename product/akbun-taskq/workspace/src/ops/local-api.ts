import { randomBytes } from 'node:crypto'
import type { Config } from '../config.ts'
import type { Db } from '../db/open.ts'
import { createApp } from '../api/server.ts'
import { pathParams, type Operation } from './operations.ts'

// Calls an API route in this process, the way the UI calls it over HTTP. Used by the CLI and the MCP server, which run
// next to the taskq server, not inside it: they share the database, and the server's runner and bot hub pick up their
// changes on the next poll (a bot cancel is a marker the hub reads; a task cancel likewise).

export interface OpResult {
  status: number
  body: unknown
}

export function localApi(db: Db, config: Config) {
  const token = randomBytes(16).toString('hex')
  const app = createApp({ db, config }, token)
  return async function call(operation: Operation, args: Record<string, unknown>): Promise<OpResult> {
    const rest = { ...args }
    let path = operation.path
    for (const name of pathParams(operation.path)) {
      const value = rest[name]
      if (value === undefined || value === null || value === '') return { status: 400, body: { error: `${name} is required` } }
      path = path.replace(`:${name}`, encodeURIComponent(String(value)))
      delete rest[name]
    }
    let body: string | undefined
    if (operation.method === 'GET') {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(rest)) if (value !== undefined && value !== null) query.set(key, String(value))
      if ([...query].length) path += `?${query}`
    } else {
      body = JSON.stringify(rest)
    }
    const res = await app.request(`/api${path}`, {
      method: operation.method,
      headers: { 'x-taskq-token': token, host: `127.0.0.1:${config.port}`, 'content-type': 'application/json' },
      body,
    })
    const text = await res.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : null
    } catch {
      // A file read answers with the file itself.
    }
    return { status: res.status, body: parsed }
  }
}
