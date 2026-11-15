import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)

test('six processes opening the same new database at once all succeed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskq-open-'))
  try {
    const openUrl = pathToFileURL(resolve('src/db/open.ts')).href
    const script = join(dir, 'open-once.mjs')
    writeFileSync(script, `import { openDb } from ${JSON.stringify(openUrl)}\n`
      + 'const db = openDb(process.argv[2])\n'
      + "console.log(db.prepare('PRAGMA user_version').get().user_version)\ndb.close()\n")
    const home = join(dir, 'home')
    const results = await Promise.allSettled(Array.from({ length: 6 }, () => run(process.execPath, [script, home])))
    const failures = results.flatMap((r) => (r.status === 'rejected' ? [String(r.reason.stderr ?? r.reason)] : []))
    assert.deepEqual(failures, [])
    for (const r of results) assert.equal((r as PromiseFulfilledResult<{ stdout: string }>).value.stdout.trim(), '3')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
