import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../src/api/server.ts'
import { insertEvent } from '../src/db/events.ts'
import { addTask, setup, TOKEN, type TestEnv } from './helpers.ts'

const decoder = new TextDecoder()

// Reads the SSE body until `count` event ids have arrived or the timeout passes.
async function readIds(reader: ReadableStreamDefaultReader<Uint8Array>, count: number): Promise<string[]> {
  let text = ''
  const deadline = Date.now() + 2000
  while (Date.now() < deadline) {
    const { value, done } = await Promise.race([reader.read(), new Promise<{ done: true; value: undefined }>((r) => setTimeout(() => r({ done: true, value: undefined }), 300))])
    if (done) break
    text += decoder.decode(value)
    const ids = [...text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1])
    if (ids.length >= count) return ids
  }
  return [...text.matchAll(/^id: (\d+)$/gm)].map((m) => m[1])
}

describe('api events stream', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const host = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })

  test('starts at the current tail, resumes from Last-Event-ID or ?after=, and sends the id field', async () => {
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const task = addTask(env.db, {})
    for (let i = 0; i < 3; i += 1) insertEvent(env.db, { task_id: task.id, run_id: null, kind: 'progress', payload: { i } })

    const controller = new AbortController()
    const tail = await app.request('/api/events/stream', { headers: host(), signal: controller.signal })
    const tailReader = tail.body!.getReader()
    insertEvent(env.db, { task_id: task.id, run_id: null, kind: 'progress', payload: { i: 3 } })
    assert.deepEqual(await readIds(tailReader, 1), ['4'])
    controller.abort()

    const resumed = new AbortController()
    const fromHeader = await app.request('/api/events/stream', { headers: { ...host(), 'last-event-id': '2' }, signal: resumed.signal })
    assert.deepEqual(await readIds(fromHeader.body!.getReader(), 2), ['3', '4'])
    resumed.abort()

    const fromQuery = new AbortController()
    const afterQuery = await app.request('/api/events/stream?after=3', { headers: host(), signal: fromQuery.signal })
    assert.deepEqual(await readIds(afterQuery.body!.getReader(), 1), ['4'])
    fromQuery.abort()

    assert.equal((await app.request('/api/events/stream?after=abc', { headers: host() })).status, 400)
  })
})
