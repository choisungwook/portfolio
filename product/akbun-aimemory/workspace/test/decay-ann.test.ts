import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { DatabaseSync } from 'node:sqlite'
import { loadConfig } from '../src/config.ts'
import { addMemory, dbPath, decayWeight, deleteMemory, invalidateMemory, openStore, recent, reindex, search, sessionMemories } from '../src/store.ts'

const home = (extra: Partial<ReturnType<typeof loadConfig>> = {}) => ({
  ...loadConfig(mkdtempSync(join(tmpdir(), 'aimem-decay-')), false),
  ...extra,
})

test('access frequency slows decay and updates access_count and last_accessed on search', () => {
  const now = Date.now()
  const oldTime = now - 60 * 86_400_000
  const unaccessed = decayWeight({ created_at: oldTime, access_count: 0, last_accessed: null }, now, 30)
  const frequent = decayWeight({ created_at: oldTime, access_count: 7, last_accessed: oldTime }, now, 30)
  const recentlyTouched = decayWeight({ created_at: oldTime, access_count: 3, last_accessed: now - 86_400_000 }, now, 30)
  assert.ok(frequent > unaccessed, 'higher access_count slows decay even with same timestamp')
  assert.ok(recentlyTouched > frequent, 'recent last_accessed further boosts weight')

  const s = openStore(home())
  try {
    const idA = addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'alpha deployment checklist', created_at: oldTime })
    const idB = addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'beta deployment checklist', created_at: oldTime })
    assert.ok(idA !== null && idB !== null)

    // Repeatedly hit alpha so its access_count and last_accessed grow while beta stays untouched.
    for (let i = 0; i < 3; i++) search(s, 'alpha', { project: 'p', limit: 1, now: now - 3600_000 })
    const rows = sessionMemories(s, 's1')
    const rowA = rows.find((r) => r.id === idA)
    const rowB = rows.find((r) => r.id === idB)
    assert.ok(rowA && rowB)
    assert.equal(rowA.access_count, 3)
    assert.ok(rowA.last_accessed !== null)
    assert.equal(rowB.access_count, 0)

    const hits = search(s, 'deployment checklist', { project: 'p', now, recordAccess: false })
    assert.equal(hits[0].id, idA, 'frequently accessed memory outranks unaccessed same-age memory')
  } finally {
    s.db.close()
  }
})

test('invalidated memories are excluded from default search and recent, but returned with --all', () => {
  const cfg = home()
  const s = openStore(cfg)
  try {
    const oldId = addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'deploy target is us-east-1' })
    const newId = addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'deploy target is ap-northeast-2' })
    assert.ok(oldId !== null && newId !== null)
    assert.equal(invalidateMemory(s, oldId, Date.now() - 1000), true)

    const defaultHits = search(s, 'deploy target', { project: 'p' })
    assert.deepEqual(defaultHits.map((h) => h.id), [newId])
    const allHits = search(s, 'deploy target', { project: 'p', includeInvalid: true })
    assert.equal(allHits.length, 2)
    assert.equal(recent(s, { project: 'p' }).map((m) => m.id).includes(oldId), false)
    assert.equal(recent(s, { project: 'p', includeInvalid: true }).map((m) => m.id).includes(oldId), true)
  } finally {
    s.db.close()
  }

  const cliDefault = spawnSync(process.execPath, ['src/cli.ts', 'search', 'deploy target', '--json'], {
    env: { ...process.env, AIMEMORY_HOME: cfg.home }, encoding: 'utf8',
  })
  assert.equal(cliDefault.status, 0)
  const parsedDefault = JSON.parse(cliDefault.stdout) as { hits: { content: string }[] }
  assert.equal(parsedDefault.hits.length, 1)
  assert.match(parsedDefault.hits[0].content, /ap-northeast-2/)

  const cliAll = spawnSync(process.execPath, ['src/cli.ts', 'search', 'deploy target', '--all', '--json'], {
    env: { ...process.env, AIMEMORY_HOME: cfg.home }, encoding: 'utf8',
  })
  assert.equal(cliAll.status, 0)
  const parsedAll = JSON.parse(cliAll.stdout) as { hits: { content: string }[] }
  assert.equal(parsedAll.hits.length, 2)
})

test('sqlite-vec ANN index activates at annThreshold and stays synced across add, delete, and reindex', () => {
  const s = openStore(home({ annThreshold: 4 }))
  try {
    if (!s.vecLoaded) return
    assert.equal(s.annActive, false)
    const id1 = addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'Use SQLite WAL mode for concurrency' })
    addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: '데이터베이스 백업 정책' })
    addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: '東京サーバーの監視設定' })
    assert.equal(s.annActive, false)
    addMemory(s, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: '向量搜索索引构建' })
    assert.equal(s.annActive, true, 'ANN activates once memory count reaches annThreshold')

    assert.match(search(s, 'sqlite wal')[0].content, /SQLite/)
    assert.match(search(s, '백업')[0].content, /백업/)
    assert.ok(id1 !== null)
    assert.equal(deleteMemory(s, id1), true)
    assert.equal(search(s, 'sqlite wal').length, 0)
    assert.equal(reindex(s), 3)
    assert.match(search(s, '監視')[0].content, /東京/)
  } finally {
    s.db.close()
  }
})

test('openStore migrates an older database missing access_count, last_accessed, and valid_until columns', () => {
  const cfg = home()
  const path = dbPath(cfg)
  // Create a legacy v0.1.0 database schema without the new columns.
  const storeInit = openStore(cfg)
  storeInit.db.close()
  const raw = new DatabaseSync(path)
  raw.exec('DROP TABLE memories; CREATE TABLE memories (id INTEGER PRIMARY KEY, session_id TEXT NOT NULL, agent TEXT NOT NULL, project TEXT NOT NULL DEFAULT "", kind TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL, digest TEXT NOT NULL UNIQUE, vec BLOB NOT NULL)')
  raw.close()

  const migrated = openStore(cfg)
  try {
    const id = addMemory(migrated, { session_id: 's1', agent: 'claude', project: 'p', kind: 'note', content: 'migrated row' })
    assert.ok(id !== null)
    assert.equal(invalidateMemory(migrated, id), true)
    assert.equal(search(migrated, 'migrated').length, 0)
    assert.equal(search(migrated, 'migrated', { includeInvalid: true }).length, 1)
  } finally {
    migrated.db.close()
  }
})
