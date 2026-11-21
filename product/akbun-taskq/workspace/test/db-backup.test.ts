import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { applyPendingImport, checkDatabase } from '../src/db/backup.ts'
import { openDb } from '../src/db/open.ts'
import { getTask } from '../src/db/tasks.ts'
import { addTask, setup, TOKEN } from './helpers.ts'

test('a backup is a consistent copy, and a restore is checked, parked and swapped in at the next start', async () => {
  const env = setup()
  try {
    let restarted = 0
    const app = createApp({ db: env.db, config: env.config, restart: () => { restarted += 1 } }, TOKEN)
    const headers = { host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
    const call = (method: string, path: string, body?: object) => app.request(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const kept = addTask(env.db, { data: { intent: 'in the backup' } })
    const made = await (await call('POST', '/database/export')).json() as { name: string; size: number }
    assert.match(made.name, /^taskq-.+\.db$/)
    const file = Buffer.from(await (await call('GET', `/database/backups/${made.name}`)).arrayBuffer())
    assert.equal(file.length, made.size)
    assert.equal((await call('GET', '/database/backups/..%2Ftaskq.db')).status, 404)

    // A task added after the backup is gone once the backup is restored.
    const later = addTask(env.db, { data: { intent: 'after the backup' } })
    const upload = 'ab'.repeat(8)
    const half = Math.floor(file.length / 2)
    assert.equal((await call('POST', '/database/import/chunk', { upload, index: 0, data: file.subarray(0, half).toString('base64') })).status, 200)
    assert.equal((await call('POST', '/database/import/chunk', { upload, index: 1, offset: half, data: file.subarray(half).toString('base64') })).status, 200)
    assert.equal((await call('POST', '/database/import/chunk', { upload, index: 2, offset: half, data: 'AA==' })).status, 400, 'a repeated chunk is refused')
    assert.equal((await call('POST', '/database/import', { upload })).status, 202)
    await new Promise((resolve) => setTimeout(resolve, 300))
    assert.equal(restarted, 1)

    env.db.close()
    const previous = applyPendingImport(env.home)!
    assert.ok(existsSync(previous), 'the replaced database is kept')
    const restored = openDb(env.home)
    assert.ok(getTask(restored, kept.id))
    assert.equal(getTask(restored, later.id), undefined)
    restored.close()
  } finally {
    // env.db was closed for the swap, so the home is removed here instead of by env.cleanup().
    rmSync(env.home, { recursive: true, force: true })
  }
})

test('a file that is not a taskq database is refused', () => {
  const env = setup()
  try {
    const junk = join(env.home, 'junk.db')
    writeFileSync(junk, 'not sqlite')
    assert.match(String(checkDatabase(junk)), /not a SQLite|damaged/)
    assert.equal(readdirSync(join(env.home, 'data')).includes('import-pending.db'), false)
    assert.ok(readFileSync(junk))
  } finally {
    env.cleanup()
  }
})
