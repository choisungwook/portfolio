import type { TeamHub } from '../team/hub.ts'
import type { Context } from 'hono'
import type { Db } from '../db/open.ts'
import type { Config } from '../config.ts'
import type { RunControl } from '../runner/control.ts'

export interface ApiDeps {
  db: Db
  config: Config
  control?: RunControl   // the runner in the same process; without one, run-now waits for the next claim
  bots?: Pick<TeamHub, 'cancel' | 'busy'> & Partial<Pick<TeamHub, 'catalog'>>// the bot hub in the same process, when bots are on
  opener?: (path: string) => void                              // tests replace the desktop file manager
  fetcher?: typeof fetch                                       // tests replace GitHub for the update check
  binary?: boolean                                             // tests say whether taskq runs as the single-file binary
  updateTarget?: string                                        // tests install the update over a scratch file
  restart?: () => void                                         // `taskq run` restarts itself; absent in CLI and MCP calls
}

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function readJson(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw new HttpError(400, 'body must be JSON')
  }
}

// A body that may be empty. Anything present must be a JSON object.
export async function optionalJson(c: Context): Promise<Record<string, unknown>> {
  const text = await c.req.text()
  if (text.trim() === '') return {}
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new HttpError(400, 'body must be JSON')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HttpError(400, 'body must be a JSON object')
  return value as Record<string, unknown>
}

export function requireOk<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new HttpError(400, result.error)
  return result.value
}

export function idParam(value: string): number {
  const id = Number(value)
  if (!Number.isInteger(id) || id < 1) throw new HttpError(400, 'id must be a positive integer')
  return id
}
