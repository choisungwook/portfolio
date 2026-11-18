import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { openDb } from '../src/db/open.ts'
import { listHandoffs, takeHandoffNotices } from '../src/db/handoffs.ts'
import { isBlocked } from '../src/db/tasks.ts'

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
    for (const r of results) assert.equal((r as PromiseFulfilledResult<{ stdout: string }>).value.stdout.trim(), '7')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('an existing v3 database keeps completed prerequisites eligible without replaying notices', (t) => {
  const home = mkdtempSync(join(tmpdir(), 'taskq-migrate-handoffs-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  mkdirSync(join(home, 'data'))
  const old = new DatabaseSync(join(home, 'data', 'taskq.db'))
  for (const file of ['001_init.sql', '002_approvals.sql', '003_access_skills.sql']) {
    old.exec(readFileSync(join('src/db/schema', file), 'utf8'))
  }
  old.exec(`PRAGMA user_version = 3;
    INSERT INTO tasks (id, type, status, data, created_at, updated_at) VALUES
      ('source', 'research', 'done', '{"intent":"source","output_path":"intent.md"}', 1, 1),
      ('target', 'research', 'ready', '{"intent":"target"}', 1, 1);
    INSERT INTO deps VALUES ('target', 'source', 'blocks');`)
  old.close()

  const db = openDb(home)
  try {
    assert.equal(isBlocked(db, 'target'), false)
    const [record] = listHandoffs(db, 'target')
    assert.equal(record.accepted_via, 'auto')
    assert.equal(record.output_path, 'intent.md')
    assert.deepEqual(takeHandoffNotices(db), { notices: [], enabled: true })
  } finally {
    db.close()
  }
})
