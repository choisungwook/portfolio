import { createRequire } from 'node:module'
import type { DatabaseSync } from 'node:sqlite'
import { DIMS } from './vector.ts'

export const DEFAULT_ANN_THRESHOLD = 100_000
const META_ANN_KEY = 'ann_index'
const ANN_BACKEND = 'sqlite-vec'

// Load sqlite-vec dynamically so the CLI and compiled binaries keep working even if the native extension is absent.
export function tryLoadSqliteVec(db: DatabaseSync): boolean {
  try {
    const req = createRequire(import.meta.url)
    const pkg = 'sqlite-vec'
    const mod = req(pkg) as { load?: (database: DatabaseSync) => void }
    if (typeof mod.load !== 'function') return false
    mod.load(db)
    return true
  } catch {
    return false
  }
}

export function ensureAnnTable(db: DatabaseSync): void {
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memories_vec USING vec0(embedding float[${DIMS}] distance_metric=cosine)`)
}

export function isAnnEnabledInMeta(db: DatabaseSync): boolean {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(META_ANN_KEY) as { value: string } | undefined
  return row?.value === ANN_BACKEND
}

export function markAnnStale(db: DatabaseSync): void {
  db.prepare('DELETE FROM meta WHERE key = ?').run(META_ANN_KEY)
}

export function isZeroVecBlob(vec: Uint8Array): boolean {
  const floats = new Float32Array(vec.buffer, vec.byteOffset, vec.byteLength / 4)
  for (let i = 0; i < floats.length; i++) if (floats[i] !== 0) return false
  return true
}

export function buildAnnIndex(db: DatabaseSync): number {
  ensureAnnTable(db)
  const rows = db.prepare('SELECT id, vec FROM memories').all() as { id: number; vec: Uint8Array }[]
  const inTx = db.isTransaction
  if (!inTx) db.exec('BEGIN')
  try {
    db.exec('DELETE FROM memories_vec')
    const insert = db.prepare('INSERT INTO memories_vec (rowid, embedding) VALUES (?, ?)')
    let indexed = 0
    for (const r of rows) {
      if (isZeroVecBlob(r.vec)) continue
      insert.run(BigInt(r.id), r.vec)
      indexed++
    }
    db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run(META_ANN_KEY, ANN_BACKEND)
    if (!inTx) db.exec('COMMIT')
    return indexed
  } catch (error) {
    if (!inTx) db.exec('ROLLBACK')
    throw error
  }
}

export function upsertAnnRow(db: DatabaseSync, id: number, vec: Uint8Array): void {
  db.prepare('DELETE FROM memories_vec WHERE rowid = ?').run(BigInt(id))
  // Skip zero vectors: cosine distance against a zero vector is NULL in sqlite-vec and would rank ahead of real matches.
  if (isZeroVecBlob(vec)) return
  db.prepare('INSERT INTO memories_vec (rowid, embedding) VALUES (?, ?)').run(BigInt(id), vec)
}

export function deleteAnnRow(db: DatabaseSync, id: number): void {
  db.prepare('DELETE FROM memories_vec WHERE rowid = ?').run(BigInt(id))
}

export function searchAnn(db: DatabaseSync, queryVec: Uint8Array, k: number): { id: number; sim: number }[] {
  if (isZeroVecBlob(queryVec)) return []
  const rows = db.prepare('SELECT rowid AS id, distance FROM memories_vec WHERE embedding MATCH ? AND k = ?')
    .all(queryVec, k) as { id: number | bigint; distance: number | null }[]
  // vec0 cosine distance is (1 - cosine_similarity); guard against null/non-finite distances.
  return rows
    .filter((r): r is { id: number | bigint; distance: number } => typeof r.distance === 'number' && Number.isFinite(r.distance))
    .map((r) => ({ id: Number(r.id), sim: 1 - r.distance }))
    .filter((r) => r.sim > 0.05)
}
