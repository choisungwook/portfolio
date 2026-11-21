import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { buildAnnIndex, deleteAnnRow, ensureAnnTable, isAnnEnabledInMeta, searchAnn, tryLoadSqliteVec, upsertAnnRow } from './ann.ts'
import type { Config } from './config.ts'
import { applyCaBundle } from './connection/ca-bundle.ts'
import { makeTokenizer, type Tokenizer } from './tokenizer.ts'
import { dot, embed, fromBlob, toBlob } from './vector.ts'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, agent TEXT NOT NULL, project TEXT NOT NULL DEFAULT '',
  started_at INTEGER NOT NULL, ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, agent TEXT NOT NULL, project TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
  digest TEXT NOT NULL UNIQUE, vec BLOB NOT NULL,
  access_count INTEGER NOT NULL DEFAULT 0, last_accessed INTEGER, valid_until INTEGER
);
CREATE INDEX IF NOT EXISTS memories_session ON memories(session_id);
CREATE INDEX IF NOT EXISTS memories_project ON memories(project);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(tokens);
`

export type Kind = 'prompt' | 'tool' | 'response' | 'note' | 'summary'
export interface MemoryInput {
  session_id: string
  agent: string
  project?: string
  kind: Kind
  content: string
  created_at?: number
  valid_until?: number | null
}
export interface Memory {
  id: number
  session_id: string
  agent: string
  project: string
  kind: Kind
  content: string
  created_at: number
  access_count: number
  last_accessed: number | null
  valid_until: number | null
}
export interface Hit extends Memory { score: number }

export interface Store {
  db: DatabaseSync
  tokenizer: Tokenizer
  config: Config
  vecLoaded: boolean
  annActive: boolean
}

export const dbPath = (config: Config) => join(config.home, 'data', 'aimemory.db')

function openDatabase(file: string): DatabaseSync {
  try {
    return new DatabaseSync(file, { timeout: 5000, allowExtension: true })
  } catch {
    return new DatabaseSync(file, { timeout: 5000 })
  }
}

function migrateColumns(db: DatabaseSync): void {
  const cols = new Set(
    (db.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map((c) => c.name),
  )
  if (!cols.has('access_count')) db.exec('ALTER TABLE memories ADD COLUMN access_count INTEGER NOT NULL DEFAULT 0')
  if (!cols.has('last_accessed')) db.exec('ALTER TABLE memories ADD COLUMN last_accessed INTEGER')
  if (!cols.has('valid_until')) db.exec('ALTER TABLE memories ADD COLUMN valid_until INTEGER')
  db.exec('CREATE INDEX IF NOT EXISTS memories_valid ON memories(valid_until)')
}

export function openStore(config: Config): Store {
  const tokenizer = makeTokenizer(config.tokenizer, config.home)
  mkdirSync(join(config.home, 'data'), { recursive: true, mode: 0o700 })
  const db = openDatabase(dbPath(config))
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  migrateColumns(db)
  applyCaBundle(db, config)
  const row = db.prepare("SELECT value FROM meta WHERE key = 'tokenizer'").get() as { value: string } | undefined
  if (!row) db.prepare("INSERT INTO meta VALUES ('tokenizer', ?)").run(tokenizer.id)
  else if (row.value !== tokenizer.id) process.stderr.write(`aimem: index was built with ${row.value}; run \`aimem reindex\`\n`)

  const vecLoaded = tryLoadSqliteVec(db)
  let annActive = false
  if (vecLoaded) {
    if (isAnnEnabledInMeta(db)) {
      ensureAnnTable(db)
      annActive = true
    } else {
      const count = Number((db.prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n)
      if (count >= config.annThreshold) {
        buildAnnIndex(db)
        annActive = true
      }
    }
  }
  return { db, tokenizer, config, vecLoaded, annActive }
}

const digest = (m: MemoryInput) => createHash('sha256').update(`${m.session_id}\0${m.kind}\0${m.content}`).digest('hex')

// Returns the new id, or null when the same content was already stored for that session (hooks can fire twice).
export function addMemory(s: Store, m: MemoryInput): number | null {
  const content = m.content.trim()
  if (!content) return null
  const now = m.created_at ?? Date.now()
  const project = m.project ?? ''
  const validUntil = m.valid_until ?? null
  s.db.prepare('INSERT OR IGNORE INTO sessions (id, agent, project, started_at) VALUES (?, ?, ?, ?)').run(m.session_id, m.agent, project, now)
  const tokens = s.tokenizer.tokenize(content)
  const vecBlob = toBlob(embed(tokens))
  // A savepoint (not BEGIN, which importDb already holds) keeps the row, FTS entry, and ANN vector together.
  s.db.exec('SAVEPOINT add_memory')
  try {
    const r = s.db.prepare(`INSERT OR IGNORE INTO memories (session_id, agent, project, kind, content, created_at, digest, vec, valid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(m.session_id, m.agent, project, m.kind, content, now, digest({ ...m, content }), vecBlob, validUntil)
    if (r.changes === 0) { s.db.exec('RELEASE add_memory'); return null }
    const id = Number(r.lastInsertRowid)
    s.db.prepare('INSERT INTO memories_fts (rowid, tokens) VALUES (?, ?)').run(id, tokens.join(' '))
    if (s.annActive) upsertAnnRow(s.db, id, vecBlob)
    s.db.exec('RELEASE add_memory')
    if (s.vecLoaded && !s.annActive && !s.db.isTransaction && id >= s.config.annThreshold) {
      const count = Number((s.db.prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n)
      if (count >= s.config.annThreshold) {
        buildAnnIndex(s.db)
        s.annActive = true
      }
    }
    return id
  } catch (error) { s.db.exec('ROLLBACK TO add_memory; RELEASE add_memory'); throw error }
}

export function invalidateMemory(s: Store, id: number, at = Date.now()): boolean {
  return s.db.prepare('UPDATE memories SET valid_until = ? WHERE id = ?').run(at, id).changes > 0
}

export function endSession(s: Store, id: string): void {
  s.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(Date.now(), id)
}

const COLS = 'id, session_id, agent, project, kind, content, created_at, access_count, last_accessed, valid_until'

// Exponential recency decay slowed by access frequency: frequently retrieved memories decay slower instead of fading out.
export function decayWeight(m: Pick<Memory, 'created_at' | 'access_count' | 'last_accessed'>, now: number, halfLifeDays: number): number {
  const halfLifeMs = Math.max(1, halfLifeDays) * 86_400_000
  const effectiveHalfLife = halfLifeMs * (1 + Math.log2(1 + Math.max(0, m.access_count ?? 0)))
  const refTime = Math.max(m.created_at, m.last_accessed ?? m.created_at)
  const age = Math.max(0, now - refTime)
  return 0.7 + 0.3 * 0.5 ** (age / effectiveHalfLife)
}

export interface SearchOptions {
  limit?: number
  project?: string
  includeInvalid?: boolean
  recordAccess?: boolean
  now?: number
}

// Hybrid retrieval: BM25 over the token index and cosine over hashed vectors (brute-force below annThreshold,
// sqlite-vec vec0 ANN once memories reach annThreshold), fused with RRF (k = 60) and access-aware recency decay.
export function search(s: Store, query: string, opts: SearchOptions = {}): Hit[] {
  const limit = opts.limit ?? 10
  const tokens = s.tokenizer.tokenize(query)
  if (tokens.length === 0) return []
  const now = opts.now ?? Date.now()
  const pool = limit * 5
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (opts.project) { clauses.push('m.project = ?'); params.push(opts.project) }
  if (!opts.includeInvalid) { clauses.push('(m.valid_until IS NULL OR m.valid_until > ?)'); params.push(now) }
  const where = clauses.length ? `AND ${clauses.join(' AND ')}` : ''

  const match = [...new Set(tokens)].map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')
  const lexical = s.db.prepare(`SELECT m.id FROM memories_fts f JOIN memories m ON m.id = f.rowid
    WHERE memories_fts MATCH ? ${where} ORDER BY bm25(memories_fts) LIMIT ?`).all(match, ...params, pool) as { id: number }[]

  const q = embed(tokens)
  let semantic: { id: number; sim: number }[]
  if (s.annActive) {
    const k = Math.min(pool * (clauses.length ? 4 : 1), 400)
    const annCandidates = searchAnn(s.db, toBlob(q), k)
    if (clauses.length && annCandidates.length > 0) {
      const cIds = annCandidates.map((c) => c.id)
      const validRows = s.db.prepare(`SELECT m.id FROM memories m WHERE m.id IN (${cIds.map(() => '?').join(',')}) ${where}`)
        .all(...cIds, ...params) as { id: number }[]
      const allowed = new Set(validRows.map((r) => r.id))
      semantic = annCandidates.filter((c) => allowed.has(c.id)).slice(0, pool)
    } else {
      semantic = annCandidates.slice(0, pool)
    }
  } else {
    const rows = s.db.prepare(`SELECT m.id, m.vec FROM memories m WHERE 1 ${where}`).all(...params) as { id: number; vec: Uint8Array }[]
    semantic = rows.map((r) => ({ id: r.id, sim: dot(q, fromBlob(r.vec)) }))
      .filter((r) => r.sim > 0.05).sort((a, b) => b.sim - a.sim).slice(0, pool)
  }

  const fused = new Map<number, number>()
  for (let i = 0; i < lexical.length; i++) {
    const id = lexical[i].id
    fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + i))
  }
  for (let i = 0; i < semantic.length; i++) {
    const id = semantic[i].id
    fused.set(id, (fused.get(id) ?? 0) + 1 / (60 + i))
  }
  if (fused.size === 0) return []

  const ids = [...fused.keys()]
  const found = s.db.prepare(`SELECT ${COLS} FROM memories WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as unknown as Memory[]
  const hits = found
    .map((m) => ({ ...m, score: (fused.get(m.id) ?? 0) * decayWeight(m, now, s.config.halfLifeDays) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  if (opts.recordAccess !== false && hits.length > 0) {
    const touch = s.db.prepare('UPDATE memories SET access_count = access_count + 1, last_accessed = ? WHERE id = ?')
    for (const h of hits) touch.run(now, h.id)
  }
  return hits
}

export function recent(s: Store, opts: { limit?: number; project?: string; includeInvalid?: boolean; now?: number } = {}): Memory[] {
  const now = opts.now ?? Date.now()
  const clauses: string[] = []
  const params: (string | number)[] = []
  if (opts.project) { clauses.push('project = ?'); params.push(opts.project) }
  if (!opts.includeInvalid) { clauses.push('(valid_until IS NULL OR valid_until > ?)'); params.push(now) }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''
  return s.db.prepare(`SELECT ${COLS} FROM memories ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...params, opts.limit ?? 20) as unknown as Memory[]
}

export function listSessions(s: Store, limit = 100) {
  return s.db.prepare(`SELECT s.*, COUNT(m.id) AS memories FROM sessions s LEFT JOIN memories m ON m.session_id = s.id
    GROUP BY s.id ORDER BY s.started_at DESC LIMIT ?`).all(limit)
}

export function sessionMemories(s: Store, id: string): Memory[] {
  return s.db.prepare(`SELECT ${COLS} FROM memories WHERE session_id = ? ORDER BY created_at`).all(id) as unknown as Memory[]
}

export function deleteMemory(s: Store, id: number): boolean {
  s.db.exec('SAVEPOINT del_memory')
  try {
    s.db.prepare('DELETE FROM memories_fts WHERE rowid = ?').run(id)
    if (s.annActive) deleteAnnRow(s.db, id)
    const deleted = s.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
    s.db.exec('RELEASE del_memory')
    return deleted
  } catch (error) {
    s.db.exec('ROLLBACK TO del_memory; RELEASE del_memory')
    throw error
  }
}

export function deleteSession(s: Store, id: string): number {
  const ids = s.db.prepare('SELECT id FROM memories WHERE session_id = ?').all(id) as { id: number }[]
  for (const r of ids) deleteMemory(s, r.id)
  s.db.prepare('DELETE FROM sessions WHERE id = ?').run(id)
  return ids.length
}

// A consistent copy taken while hooks keep writing.
export function exportDb(s: Store, file: string): void {
  if (existsSync(file)) rmSync(file)
  s.db.prepare('VACUUM INTO ?').run(file)
}

// Merges a backup instead of replacing the live file, so a running hook never sees a missing database. Rows are
// re-tokenized with the current tokenizer; duplicates (same digest) are skipped.
export function importDb(s: Store, file: string): { added: number; skipped: number } {
  const src = new DatabaseSync(file, { readOnly: true })
  try {
    const sessions = src.prepare('SELECT * FROM sessions').all() as { id: string; agent: string; project: string; started_at: number; ended_at: number | null }[]
    const srcCols = new Set((src.prepare('PRAGMA table_info(memories)').all() as { name: string }[]).map((c) => c.name))
    const validCol = srcCols.has('valid_until') ? ', valid_until' : ''
    const rows = src.prepare(`SELECT id, session_id, agent, project, kind, content, created_at${validCol} FROM memories ORDER BY id`)
      .all() as unknown as MemoryInput[]
    let added = 0
    s.db.exec('BEGIN')
    for (const x of sessions) s.db.prepare('INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?)').run(x.id, x.agent, x.project, x.started_at, x.ended_at)
    for (const r of rows) if (addMemory(s, r) !== null) added++
    s.db.exec('COMMIT')
    if (s.vecLoaded && !s.annActive) {
      const count = Number((s.db.prepare('SELECT COUNT(*) AS n FROM memories').get() as { n: number }).n)
      if (count >= s.config.annThreshold) {
        buildAnnIndex(s.db)
        s.annActive = true
      }
    }
    return { added, skipped: rows.length - added }
  } finally { src.close() }
}

export function reindex(s: Store): number {
  const rows = s.db.prepare('SELECT id, content FROM memories').all() as { id: number; content: string }[]
  s.db.exec('BEGIN')
  try {
    s.db.exec('DELETE FROM memories_fts')
    const updateVec = s.db.prepare('UPDATE memories SET vec = ? WHERE id = ?')
    const insertFts = s.db.prepare('INSERT INTO memories_fts (rowid, tokens) VALUES (?, ?)')
    for (const r of rows) {
      const tokens = s.tokenizer.tokenize(r.content)
      updateVec.run(toBlob(embed(tokens)), r.id)
      insertFts.run(r.id, tokens.join(' '))
    }
    s.db.prepare("INSERT OR REPLACE INTO meta VALUES ('tokenizer', ?)").run(s.tokenizer.id)
    if (s.vecLoaded && (s.annActive || rows.length >= s.config.annThreshold)) {
      buildAnnIndex(s.db)
      s.annActive = true
    }
    s.db.exec('COMMIT')
    return rows.length
  } catch (error) {
    s.db.exec('ROLLBACK')
    throw error
  }
}
