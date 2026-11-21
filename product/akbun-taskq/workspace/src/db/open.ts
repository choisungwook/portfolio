import { DatabaseSync } from 'node:sqlite'
import { chmodSync, closeSync, existsSync, mkdirSync, openSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resourcePath } from '../resources.ts'

export type Db = DatabaseSync

const MIGRATIONS = ['001_init.sql', '002_approvals.sql', '003_access_skills.sql', '004_handoffs.sql', '005_team.sql', '006_workflows.sql', '007_jobs.sql', '008_mcp_servers.sql', '009_providers_usage.sql', '010_bot_autonomy.sql', '011_claude_provider.sql', '012_turn_steps.sql']

function schemaFile(name: string): string {
  const file = resourcePath(`src/db/schema/${name}`)
  if (!file) throw new Error(`schema ${name} is missing from this build`)
  return file
}
const BUSY_MS = 5000

export function openDb(home: string): Db {
  // Files this process creates (the database, -wal, -shm) are private to the user.
  process.umask(0o077)
  mkdirSync(join(home, 'data'), { recursive: true, mode: 0o700 })
  for (const dir of ['outputs', 'memory']) mkdirSync(join(home, dir), { recursive: true })
  const file = join(home, 'data', 'taskq.db')
  closeSync(openSync(file, 'a', 0o600))
  // The busy timeout covers the migration lock below. The WAL switch has its own retry.
  const db = new DatabaseSync(file, { timeout: BUSY_MS })
  enableWal(db)
  db.exec('PRAGMA foreign_keys = OFF')
  migrate(db)
  restrictFiles(join(home, 'data'))
  return db
}

// Existing files keep the mode they were created with, so the modes are set again on every open.
function restrictFiles(dataDir: string): void {
  chmodSync(dataDir, 0o700)
  for (const name of ['taskq.db', 'taskq.db-wal', 'taskq.db-shm']) {
    const path = join(dataDir, name)
    if (existsSync(path)) chmodSync(path, 0o600)
  }
}

// The WAL switch needs a brief exclusive lock and SQLite can return BUSY without waiting for the busy timeout, so it is
// retried here. An already-WAL database skips the switch.
function enableWal(db: Db): void {
  const deadline = Date.now() + BUSY_MS
  if (String(db.prepare('PRAGMA journal_mode').get()?.journal_mode).toLowerCase() === 'wal') return
  for (;;) {
    try {
      db.exec('PRAGMA journal_mode = WAL')
      return
    } catch (error) {
      if (!/locked|busy/i.test(String(error)) || Date.now() > deadline) throw error
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10)
    }
  }
}

// Runs under the write lock and re-reads user_version inside it, so a process that lost the race skips the migrations.
function migrate(db: Db): void {
  db.exec('BEGIN IMMEDIATE')
  try {
    const current = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0)
    MIGRATIONS.forEach((name, index) => {
      const version = index + 1
      if (version <= current) return
      db.exec(readFileSync(schemaFile(name), 'utf8'))
      db.exec(`PRAGMA user_version = ${version}`)
    })
    db.exec('COMMIT')
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

// Inside a transaction already, fn joins it: one caller's transaction covers the helpers it calls.
export function inTransaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}
