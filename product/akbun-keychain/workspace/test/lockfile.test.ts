import { strict as assert } from 'node:assert'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { KeychainError } from '../src/core/errors.ts'
import { withLock } from '../src/core/lockfile.ts'
import { initVault, list, openVault } from '../src/core/vault.ts'
import { FIXTURES, PASSWORD, TEST_KDF_N, useTempHome } from './helpers.ts'

function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' })
  return Number(child.stdout)
}

test('a lock whose pid is not alive is taken over', async () => {
  const lock = join(useTempHome(), 'vault.lock')
  writeFileSync(lock, JSON.stringify({ pid: deadPid(), at: new Date().toISOString() }))
  assert.equal(await withLock(lock, () => 'ran', { timeoutMs: 200 }), 'ran')
  assert.equal(existsSync(lock), false)
})

test('a live lock makes the writer wait, then fail with the lock error', async () => {
  const lock = join(useTempHome(), 'vault.lock')
  writeFileSync(lock, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }))
  const started = Date.now()
  await assert.rejects(
    withLock(lock, () => 'ran', { timeoutMs: 300 }),
    (error: unknown) => error instanceof KeychainError && error.code === 'LOCK_TIMEOUT',
  )
  assert.ok(Date.now() - started >= 300)
  assert.equal(existsSync(lock), true)
})

test('a waiting writer proceeds once the holder releases', async () => {
  const lock = join(useTempHome(), 'vault.lock')
  let release!: () => void
  const holder = withLock(lock, () => new Promise<void>((resolve) => { release = resolve }))
  const waiter = withLock(lock, () => 'second', { timeoutMs: 2000 })
  setTimeout(() => release(), 150)
  await holder
  assert.equal(await waiter, 'second')
})

function runWriter(prefix: string, count: number): Promise<number | null> {
  const child = spawn(process.execPath, [join(FIXTURES, 'writer.ts'), prefix, String(count)], {
    env: { ...process.env, TEST_PASSWORD: PASSWORD },
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return new Promise((resolve) => child.on('exit', resolve))
}

test('two processes writing 50 entries each at the same time end with 100 entries', async () => {
  useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  const codes = await Promise.all([runWriter('a', 50), runWriter('b', 50)])
  assert.deepEqual(codes, [0, 0])
  assert.equal(list(openVault(PASSWORD)).length, 100)
})
