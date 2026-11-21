import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from './config.ts'
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
  digest TEXT NOT NULL UNIQUE, vec BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS memories_session ON memories(session_id);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(tokens);
`

export type Kind = 'prompt' | 'tool' | 'response' | 'note' | 'summary'
export interface MemoryInput { session_id: string; agent: string; project?: string; kind: Kind; content: string; created_at?: number }
export interface Memory { id: number; session_id: string; agent: string; project: string; kind: Kind; content: string; created_at: number }
export interface Hit extends Memory { score: number }

export interface Store { db: DatabaseSync; tokenizer: Tokenizer; config: Config }

export const dbPath = (config: Config) => join(config.home, 'data', 'aimemory.db')

export function openStore(config: Config): Store {
  mkdirSync(join(config.home, 'data'), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(dbPath(config), { timeout: 5000 })
  db.exec('PRAGMA journal_mode = WAL')
  db.exec(SCHEMA)
  const tokenizer = makeTokenizer(config.tokenizer, config.home)
  const row = db.prepare("SELECT value FROM meta WHERE key = 'tokenizer'").get() as { value: string } | undefined
  if (!row) db.prepare("INSERT INTO meta VALUES ('tokenizer', ?)").run(tokenizer.id)
  else if (row.value !== tokenizer.id) process.stderr.write(`aimem: index was built with ${row.value}; run \`aimem reindex\`\n`)
  return { db, tokenizer, config }
}

const digest = (m: MemoryInput) => createHash('sha256').update(`${m.session_id}\0${m.kind}\0${m.content}`).digest('hex')

// Returns the new id, or null when the same content was already stored for that session (hooks can fire twice).
export function addMemory(s: Store, m: MemoryInput): number | null {
  const content = m.content.trim()
  if (!content) return null
  const now = m.created_at ?? Date.now()
  const project = m.project ?? ''
  s.db.prepare('INSERT OR IGNORE INTO sessions (id, agent, project, started_at) VALUES (?, ?, ?, ?)').run(m.session_id, m.agent, project, now)
  const tokens = s.tokenizer.tokenize(content)
  // A savepoint (not BEGIN, which importDb already holds) keeps the row and its FTS entry together.
  s.db.exec('SAVEPOINT add_memory')
  try {
  const r = s.db.prepare(`INSERT OR IGNORE INTO memories (session_id, agent, project, kind, content, created_at, digest, vec)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(m.session_id, m.agent, project, m.kind, content, now, digest({ ...m, content }), toBlob(embed(tokens)))
  if (r.changes === 0) { s.db.exec('RELEASE add_memory'); return null }
  const id = Number(r.lastInsertRowid)
  s.db.prepare('INSERT INTO memories_fts (rowid, tokens) VALUES (?, ?)').run(id, tokens.join(' '))
  s.db.exec('RELEASE add_memory')
  return id
  } catch (error) { s.db.exec('ROLLBACK TO add_memory; RELEASE add_memory'); throw error }
}

export function endSession(s: Store, id: string): void {
  s.db.prepare('UPDATE sessions SET ended_at = ? WHERE id = ?').run(Date.now(), id)
}

const COLS = 'id, session_id, agent, project, kind, content, created_at'

// Hybrid retrieval: BM25 over the token index and cosine over hashed vectors, fused with reciprocal rank fusion
// (k = 60), then weighted by an exponential recency decay so old memories fade instead of being deleted.
export function search(s: Store, query: string, opts: { limit?: number; project?: string } = {}): Hit[] {
  const limit = opts.limit ?? 10
  const tokens = s.tokenizer.tokenize(query)
  if (tokens.length === 0) return []
  const pool = limit * 5
  const where = opts.project ? 'AND m.project = ?' : ''
  const params = opts.project ? [opts.project] : []

  const match = [...new Set(tokens)].map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')
  const lexical = s.db.prepare(`SELECT m.id FROM memories_fts f JOIN memories m ON m.id = f.rowid
    WHERE memories_fts MATCH ? ${where} ORDER BY bm25(memories_fts) LIMIT ?`).all(match, ...params, pool) as { id: number }[]

  // ponytail: brute-force cosine over every row; fine to ~100k memories, move to sqlite-vec when it is not.
  const q = embed(tokens)
  const rows = s.db.prepare(`SELECT m.id, m.vec FROM memories m WHERE 1 ${where}`).all(...params) as { id: number; vec: Uint8Array }[]
  const semantic = rows.map((r) => ({ id: r.id, sim: dot(q, fromBlob(r.vec)) }))
    .filter((r) => r.sim > 0.05).sort((a, b) => b.sim - a.sim).slice(0, pool)

  const fused = new Map<number, number>()
  lexical.forEach((r, i) => fused.set(r.id, (fused.get(r.id) ?? 0) + 1 / (60 + i)))
  semantic.forEach((r, i) => fused.set(r.id, (fused.get(r.id) ?? 0) + 1 / (60 + i)))
  if (fused.size === 0) return []

  const ids = [...fused.keys()]
  const found = s.db.prepare(`SELECT ${COLS} FROM memories WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids) as unknown as Memory[]
  const halfLife = s.config.halfLifeDays * 86_400_000
  const now = Date.now()
  return found.map((m) => ({ ...m, score: fused.get(m.id)! * (0.7 + 0.3 * 0.5 ** ((now - m.created_at) / halfLife)) }))
    .sort((a, b) => b.score - a.score).slice(0, limit)
}

export function recent(s: Store, opts: { limit?: number; project?: string } = {}): Memory[] {
  const where = opts.project ? 'WHERE project = ?' : ''
  return s.db.prepare(`SELECT ${COLS} FROM memories ${where} ORDER BY created_at DESC LIMIT ?`)
    .all(...(opts.project ? [opts.project] : []), opts.limit ?? 20) as unknown as Memory[]
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
  s.db.prepare('DELETE FROM memories_fts WHERE rowid = ?').run(id)
  const deleted = s.db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes > 0
  s.db.exec('RELEASE del_memory')
  return deleted
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
    const rows = src.prepare(`SELECT ${COLS} FROM memories ORDER BY id`).all() as unknown as Memory[]
    let added = 0
    s.db.exec('BEGIN')
    for (const x of sessions) s.db.prepare('INSERT OR IGNORE INTO sessions VALUES (?, ?, ?, ?, ?)').run(x.id, x.agent, x.project, x.started_at, x.ended_at)
    for (const r of rows) if (addMemory(s, r) !== null) added++
    s.db.exec('COMMIT')
    return { added, skipped: rows.length - added }
  } finally { src.close() }
}

export function reindex(s: Store): number {
  const rows = s.db.prepare('SELECT id, content FROM memories').all() as { id: number; content: string }[]
  s.db.exec('BEGIN')
  s.db.exec('DELETE FROM memories_fts')
  for (const r of rows) {
    const tokens = s.tokenizer.tokenize(r.content)
    s.db.prepare('UPDATE memories SET vec = ? WHERE id = ?').run(toBlob(embed(tokens)), r.id)
    s.db.prepare('INSERT INTO memories_fts (rowid, tokens) VALUES (?, ?)').run(r.id, tokens.join(' '))
  }
  s.db.prepare("INSERT OR REPLACE INTO meta VALUES ('tokenizer', ?)").run(s.tokenizer.id)
  s.db.exec('COMMIT')
  return rows.length
}
