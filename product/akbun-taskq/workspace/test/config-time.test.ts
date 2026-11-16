import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig } from '../src/config.ts'
import { isDay } from '../src/time.ts'
import { openDb } from '../src/db/open.ts'
import { insertTask } from '../src/db/tasks.ts'

const withHome = (config?: unknown) => {
  const home = mkdtempSync(join(tmpdir(), 'taskq-config-'))
  if (config !== undefined) writeFileSync(join(home, 'taskq.config.json'), JSON.stringify(config))
  return home
}

test('trustedRepos defaults to an empty list and must hold absolute paths', () => {
  const empty = withHome({})
  try {
    assert.deepEqual(loadConfig({ TASKQ_HOME: empty }).trustedRepos, [])
  } finally {
    rmSync(empty, { recursive: true, force: true })
  }
  const relative = withHome({ trustedRepos: ['repos/app'] })
  try {
    assert.throws(() => loadConfig({ TASKQ_HOME: relative }), /trustedRepos must be absolute paths/)
  } finally {
    rmSync(relative, { recursive: true, force: true })
  }
  const absolute = withHome({ trustedRepos: ['/Users/example/app'] })
  try {
    assert.deepEqual(loadConfig({ TASKQ_HOME: absolute }).trustedRepos, ['/Users/example/app'])
  } finally {
    rmSync(absolute, { recursive: true, force: true })
  }
})

test('[critical] caBundle must be an absolute path', () => {
  const relative = withHome({ caBundle: 'certs/ca.pem' })
  try {
    assert.throws(() => loadConfig({ TASKQ_HOME: relative }), /caBundle must be an absolute path/)
  } finally {
    rmSync(relative, { recursive: true, force: true })
  }
  const absolute = withHome({ caBundle: '/etc/inspection-ca.pem' })
  try {
    assert.equal(loadConfig({ TASKQ_HOME: absolute }).caBundle, '/etc/inspection-ca.pem')
  } finally {
    rmSync(absolute, { recursive: true, force: true })
  }
})

test('isDay accepts only real calendar days', () => {
  assert.equal(isDay('2026-03-10'), true)
  assert.equal(isDay('2024-02-29'), true)
  for (const bad of ['2026-13-40', '2026-02-30', '2025-02-29', '2026-00-10', '2026-3-10', 'today']) {
    assert.equal(isDay(bad), false, bad)
  }
})

test('the database directory is 0700 and the database and its WAL files are 0600', () => {
  const home = withHome()
  try {
    const db = openDb(home)
    insertTask(db, { type: 'research', status: 'ready', data: { intent: 'write a wal frame' } })
    const dataDir = join(home, 'data')
    assert.equal(statSync(dataDir).mode & 0o777, 0o700)
    for (const name of ['taskq.db', 'taskq.db-wal', 'taskq.db-shm']) {
      const path = join(dataDir, name)
      if (existsSync(path)) assert.equal(statSync(path).mode & 0o777, 0o600, name)
    }
    assert.equal(statSync(join(dataDir, 'taskq.db')).mode & 0o777, 0o600)
    db.close()
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
