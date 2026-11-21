import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { handOverToken, relaunchArgs, takeRestartToken } from '../src/relaunch.ts'

test('a restart starts the same command again, and the compiled binary drops its bundled entry path', () => {
  assert.deepEqual(relaunchArgs(['/usr/bin/node', '/w/src/cli/main.ts', 'run'], ['--no-warnings'], false), ['--no-warnings', '/w/src/cli/main.ts', 'run'])
  assert.deepEqual(relaunchArgs(['/Apps/taskq', '/$bunfs/root/taskq', 'run'], [], true), ['run'])
})

test('the handed-over token is a 0600 file read once, never reused when stale, and never from the environment', () => {
  const dir = mkdtempSync(join(tmpdir(), 'taskq-restart-'))
  const token = 'a'.repeat(64)
  handOverToken(dir, token)
  assert.equal(statSync(join(dir, 'restart-token')).mode & 0o777, 0o600)
  assert.equal(takeRestartToken(dir), token)
  assert.equal(existsSync(join(dir, 'restart-token')), false)
  assert.equal(takeRestartToken(dir), undefined, 'read once')
  handOverToken(dir, token)
  assert.equal(takeRestartToken(dir, Date.now() + 120_000), undefined, 'a stale file is ignored')
  assert.equal(existsSync(join(dir, 'restart-token')), false, 'and removed')
})
