// Synthetic 100k-memory benchmark: builds a 100,000-row database, activates the sqlite-vec ANN index,
// and measures p50/p95/max search latency across multilingual queries.
// Run: node bench/benchmark.ts [rows]
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAnnIndex } from '../src/ann.ts'
import { loadConfig } from '../src/config.ts'
import { openStore, search } from '../src/store.ts'
import { embed, toBlob } from '../src/vector.ts'

const TOTAL = Number(process.argv[2] || 100_000)

const TOPICS = [
  'Use SQLite WAL mode for concurrent hook writers',
  '데이터베이스 백업은 매일 새벽 cron으로 실행한다',
  '東京のサーバーでコンテナデプロイが失敗した原因調査',
  '向量搜索需要合适的分词器与混合召回',
  'Release workflow must build binaries before tagging master',
  'TLS inspection proxies require importing the root CA bundle',
  'Kubernetes pod eviction during node drain needs PDB checks',
  'Redis cache invalidation race condition on hot keys',
]

const QUERIES = [
  'sqlite wal hook',
  '데이터베이스 백업',
  'デプロイ 失敗',
  '向量搜索 分词器',
  'release binary tag',
  'TLS CA bundle',
  'kubernetes pod eviction',
  'redis cache invalidation',
]

function percentile(sorted: number[], p: number): number {
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)
  return sorted[Math.max(0, index)]
}

function main(): void {
  const home = mkdtempSync(join(tmpdir(), 'aimem-bench-'))
  const config = loadConfig(home, false)
  const store = openStore(config)
  try {
    const startBuild = performance.now()
    const baseTime = Date.now() - 90 * 86_400_000
    // Pre-compute template tokens and vectors once per topic, varying only the numeric suffix.
    store.db.exec('BEGIN')
    const insertSession = store.db.prepare('INSERT OR IGNORE INTO sessions (id, agent, project, started_at) VALUES (?, ?, ?, ?)')
    const insertMem = store.db.prepare(
      'INSERT INTO memories (session_id, agent, project, kind, content, created_at, digest, vec, valid_until) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    const insertFts = store.db.prepare('INSERT INTO memories_fts (rowid, tokens) VALUES (?, ?)')

    for (let s = 0; s < 500; s++) insertSession.run(`sess-${s}`, 'claude', `proj-${s % 10}`, baseTime + s * 1000)

    const templateTokens = TOPICS.map((t) => store.tokenizer.tokenize(t))
    const templateVecs = templateTokens.map((toks) => toBlob(embed(toks)))
    const templateFts = templateTokens.map((toks) => toks.join(' '))

    for (let i = 1; i <= TOTAL; i++) {
      const idx = i % TOPICS.length
      const content = `${TOPICS[idx]} #${i}`
      const digest = createHash('sha256').update(`s${i}`).digest('hex')
      const createdAt = baseTime + (i % 90) * 86_400_000
      const validUntil = i % 20 === 0 ? createdAt + 1000 : null
      const r = insertMem.run(`sess-${i % 500}`, 'claude', `proj-${i % 10}`, 'note', content, createdAt, digest, templateVecs[idx], validUntil)
      insertFts.run(Number(r.lastInsertRowid), `${templateFts[idx]} ${i}`)
    }
    store.db.exec('COMMIT')
    const insertMs = performance.now() - startBuild

    const startAnn = performance.now()
    if (store.vecLoaded && !store.annActive) {
      buildAnnIndex(store.db)
      store.annActive = true
    }
    const annBuildMs = performance.now() - startAnn

    // Warm up query cache once, then measure 32 queries.
    search(store, QUERIES[0], { limit: 10, recordAccess: false })
    const timings: number[] = []
    for (let i = 0; i < 32; i++) {
      const q = QUERIES[i % QUERIES.length]
      const t0 = performance.now()
      const hits = search(store, q, { limit: 10, recordAccess: false })
      const elapsed = performance.now() - t0
      if (hits.length === 0) throw new Error(`expected hits for query "${q}"`)
      timings.push(elapsed)
    }
    timings.sort((a, b) => a - b)
    const p50 = percentile(timings, 50)
    const p95 = percentile(timings, 95)
    const max = timings[timings.length - 1]

    console.log(JSON.stringify({
      rows: TOTAL,
      annActive: store.annActive,
      insertMs: Math.round(insertMs),
      annBuildMs: Math.round(annBuildMs),
      p50Ms: Number(p50.toFixed(1)),
      p95Ms: Number(p95.toFixed(1)),
      maxMs: Number(max.toFixed(1)),
    }, null, 2))
    if (p95 > 200) {
      process.stderr.write(`benchmark failed: p95 ${p95.toFixed(1)}ms exceeded 200ms target\n`)
      process.exitCode = 1
    }
  } finally {
    store.db.close()
    rmSync(home, { recursive: true, force: true })
  }
}

main()
