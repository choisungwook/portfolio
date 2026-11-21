import { DatabaseSync } from 'node:sqlite'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'
import { MIGRATIONS, type Db } from './open.ts'

// Database backup and restore for Settings > Database. A backup is a consistent copy made while taskq runs (VACUUM
// INTO) and kept in data/backups, which bots cannot reach; the UI downloads it through the token-guarded API. A
// restore is uploaded in base64 chunks (the API takes JSON only), checked, and parked as data/import-pending.db; the
// next `taskq run` start swaps it in before it opens the database, keeping the replaced one in data/backups.

export const BACKUP_NAME = /^taskq-[0-9A-Za-z-]+\.db$/
const UPLOAD_ID = /^[0-9a-f]{16,64}$/
const PENDING = 'import-pending.db'
export const CHUNK_LIMIT = 8 * 1024 * 1024
const IMPORT_LIMIT = 2 * 1024 * 1024 * 1024

const dataDir = (config: Config) => join(config.home, 'data')
export const backupsDir = (config: Config) => join(dataDir(config), 'backups')
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '')

export function exportDatabase(db: Db, config: Config): { name: string; size: number } {
  mkdirSync(backupsDir(config), { recursive: true, mode: 0o700 })
  const name = `taskq-${stamp()}.db`
  const path = join(backupsDir(config), name)
  db.exec(`VACUUM INTO '${path.replace(/'/g, "''")}'`)
  return { name, size: statSync(path).size }
}

export function backupPath(config: Config, name: string): string | null {
  if (!BACKUP_NAME.test(name)) return null
  const path = join(backupsDir(config), name)
  return existsSync(path) ? path : null
}

export function listBackups(config: Config): { name: string; size: number; at: number }[] {
  if (!existsSync(backupsDir(config))) return []
  return readdirSync(backupsDir(config)).filter((name) => BACKUP_NAME.test(name))
    .map((name) => { const s = statSync(join(backupsDir(config), name)); return { name, size: s.size, at: Math.floor(s.mtimeMs / 1000) } })
    .sort((a, b) => b.at - a.at)
}

const partOf = (config: Config, upload: string) => join(dataDir(config), `import-${upload}.part`)

// One chunk of an upload, in order: index 0 starts the file, each next index appends.
// offset is where the chunk starts; it must be the size uploaded so far, so a repeated or skipped chunk is refused.
export function appendImportChunk(config: Config, upload: string, index: number, data: Buffer, offset = 0): number {
  if (!UPLOAD_ID.test(upload)) throw new Error('upload must be a hex id')
  if (data.length > CHUNK_LIMIT) throw new Error(`a chunk is at most ${CHUNK_LIMIT / 1024 / 1024} MB`)
  const part = partOf(config, upload)
  if (index === 0) {
    // A new upload clears unfinished ones (each can be up to 2 GB).
    for (const name of readdirSync(dataDir(config))) if (/^import-.+\.part/.test(name)) rmSync(join(dataDir(config), name), { force: true })
  } else if (!existsSync(part)) throw new Error('the upload has no first chunk')
  const size = existsSync(part) ? statSync(part).size : 0
  if (offset !== size) throw new Error(`chunk ${index} starts at ${offset}, but ${size} bytes are uploaded`)
  if (size + data.length > IMPORT_LIMIT) throw new Error('the database file is larger than 2 GB')
  appendFileSync(part, data, { mode: 0o600 })
  return size + data.length
}

// Why this file cannot replace taskq's database, or null when it can: SQLite that passes its quick check, with taskq's
// tables, from this version or an older one (the start migrates it forward).
export function checkDatabase(file: string): string | null {
  let probe: DatabaseSync | undefined
  // Opening a WAL database, even read only, leaves -wal and -shm beside it; the ones this check made are removed.
  const sidecars = ['-wal', '-shm'].map((suffix) => `${file}${suffix}`).filter((path) => !existsSync(path))
  try {
    probe = new DatabaseSync(file, { readOnly: true })
    if (String(probe.prepare('PRAGMA quick_check').get()?.quick_check) !== 'ok') return 'the file is damaged (quick_check failed)'
    const tables = new Set(probe.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => String(row.name)))
    if (!tables.has('tasks') || !tables.has('runs')) return 'this is not a taskq database (no tasks table)'
    const version = Number(probe.prepare('PRAGMA user_version').get()?.user_version ?? 0)
    if (version > MIGRATIONS.length) return `this database is from a newer taskq (schema ${version}); update taskq first`
    return null
  } catch (error) {
    return `not a SQLite database: ${error instanceof Error ? error.message : String(error)}`
  } finally {
    probe?.close()
    for (const path of sidecars) rmSync(path, { force: true })
  }
}

// Checks the finished upload and parks it for the next start.
export function finishImport(config: Config, upload: string): void {
  if (!UPLOAD_ID.test(upload)) throw new Error('upload must be a hex id')
  const part = partOf(config, upload)
  if (!existsSync(part)) throw new Error('no such upload')
  const problem = checkDatabase(part)
  if (problem) {
    rmSync(part, { force: true })
    throw new Error(problem)
  }
  renameSync(part, join(dataDir(config), PENDING))
}

// A file on this computer (the CLI): the same check, then parked for the next start.
export function importFromFile(config: Config, file: string): void {
  const problem = checkDatabase(file)
  if (problem) throw new Error(problem)
  mkdirSync(dataDir(config), { recursive: true, mode: 0o700 })
  // Copy rather than move: the user's file stays where it was.
  copyFileSync(file, join(dataDir(config), PENDING))
}

// Before `taskq run` opens the database: a parked import replaces it, and the replaced files go to data/backups.
// Puts back the database applyPendingImport replaced (the new one failed to open or migrate).
export function undoImport(home: string, kept: string): void {
  const data = join(home, 'data')
  for (const suffix of ['', '-wal', '-shm']) rmSync(join(data, `taskq.db${suffix}`), { force: true })
  for (const suffix of ['', '-wal', '-shm']) if (existsSync(`${kept}${suffix}`)) renameSync(`${kept}${suffix}`, join(data, `taskq.db${suffix}`))
}

export function applyPendingImport(home: string): string | null {
  const data = join(home, 'data')
  const pending = join(data, PENDING)
  if (!existsSync(pending)) return null
  const backups = join(data, 'backups')
  mkdirSync(backups, { recursive: true, mode: 0o700 })
  const kept = join(backups, `taskq-before-import-${stamp()}.db`)
  if (existsSync(join(data, 'taskq.db'))) renameSync(join(data, 'taskq.db'), kept)
  for (const suffix of ['-wal', '-shm']) {
    if (existsSync(join(data, `taskq.db${suffix}`))) renameSync(join(data, `taskq.db${suffix}`), `${kept}${suffix}`)
  }
  renameSync(pending, join(data, 'taskq.db'))
  return kept
}
