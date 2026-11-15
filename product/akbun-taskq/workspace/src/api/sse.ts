import type { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { latestEventId, listEvents } from '../db/events.ts'
import { intParam } from './params.ts'
import { HttpError, type ApiDeps } from './http.ts'

const BATCH = 200
const MAX_STREAMS = 8

// Starts at the current tail unless Last-Event-ID (sent by EventSource on reconnect) or ?after= says otherwise.
// Polls the events table by id, so events written by the CLI process reach the browser too.
export function registerSse(api: Hono, { db, config }: ApiDeps): void {
  let open = 0
  api.get('/events/stream', (c) => {
    if (open >= MAX_STREAMS) throw new HttpError(429, `at most ${MAX_STREAMS} event streams`)
    const resume = c.req.header('last-event-id') || c.req.query('after')
    const start = resume === undefined || resume === ''
      ? latestEventId(db)
      : intParam(resume, 'after', 0, 0, Number.MAX_SAFE_INTEGER)
    open += 1
    let released = false
    const release = () => {
      if (!released) open -= 1
      released = true
    }
    return streamSSE(c, async (stream) => {
      let after = start
      let closed = false
      stream.onAbort(() => {
        closed = true
        release()
      })
      try {
        while (!closed) {
          const rows = listEvents(db, { after, limit: BATCH })
          for (const row of rows) {
            after = row.id
            await stream.writeSSE({ id: String(row.id), event: 'event', data: JSON.stringify(row) })
          }
          // A full batch means more rows are waiting, so read again without sleeping.
          if (rows.length < BATCH) await stream.sleep(config.pollSec * 1000)
        }
      } finally {
        release()
      }
    })
  })
}
