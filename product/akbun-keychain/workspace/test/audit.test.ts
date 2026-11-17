import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { KeychainError } from '../src/core/errors.ts'
import { appendAudit, readAudit, type AuditEvent } from '../src/core/audit.ts'
import { FIXTURES, useTempHome } from './helpers.ts'

const RUN: AuditEvent = { actor: 'mcp', op: 'run', keys: ['github/token'], ok: true, program: 'gh', env: ['GH_TOKEN'], exit_code: 0 }

test('an appended line has the fixed fields and a timestamp', async () => {
  const home = useTempHome()
  await appendAudit(RUN)
  const [line] = readAudit()
  assert.match(line.at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/)
  assert.deepEqual({ ...line, at: undefined }, { ...RUN, at: undefined })
  if (process.platform !== 'win32') assert.equal(statSync(join(home, 'audit.jsonl')).mode & 0o777, 0o600)
})

test('[critical] the audit writer rejects a field outside its fixed set', async () => {
  useTempHome()
  const withValue = { ...RUN, value: 'secret' } as unknown as AuditEvent
  const withArgs = { ...RUN, args: ['--token', 'secret'] } as unknown as AuditEvent
  for (const event of [withValue, withArgs]) {
    await assert.rejects(appendAudit(event), (error: unknown) => error instanceof KeychainError && error.code === 'INVALID')
  }
  await assert.rejects(appendAudit({ ...RUN, keys: ['not a key name'] }))
  await assert.rejects(appendAudit({ ...RUN, env: ['A=secret'] }))
  assert.deepEqual(readAudit(), [])
})

test('the log rotates at the size limit and keeps at most 5 files', async () => {
  const home = useTempHome()
  for (let index = 0; index < 60; index++) await appendAudit({ ...RUN, exit_code: index }, { maxBytes: 1000 })
  for (const suffix of ['', '.1', '.2', '.3', '.4']) assert.ok(existsSync(join(home, `audit.jsonl${suffix}`)), suffix)
  assert.equal(existsSync(join(home, 'audit.jsonl.5')), false)
  const lines = readAudit()
  assert.ok(lines.length < 60)
  assert.equal(lines.at(-1)?.exit_code, 59)
  const codes = lines.map((line) => line.exit_code as number)
  assert.deepEqual(codes, [...codes].sort((a, b) => a - b), 'newest last')
  assert.deepEqual(readAudit(3).map((line) => line.exit_code), [57, 58, 59])
})

function runAppender(tag: number, count: number): Promise<number | null> {
  const child = spawn(process.execPath, [join(FIXTURES, 'appender.ts'), String(tag), String(count)], {
    env: process.env,
    stdio: ['ignore', 'ignore', 'inherit'],
  })
  return new Promise((resolve) => child.on('exit', resolve))
}

test('two processes appending during rotations lose no line', async () => {
  const home = useTempHome()
  // Large limit relative to the 200 lines so every line stays within the 5 kept files.
  assert.deepEqual(await Promise.all([runAppender(1, 100), runAppender(2, 100)]), [0, 0])
  const lines = readAudit()
  assert.equal(lines.length, 200)
  assert.ok(existsSync(join(home, 'audit.jsonl.1')), 'at least one rotation happened')
  for (const tag of [1, 2]) {
    const seen = lines.filter((line) => line.exit_code !== undefined && Math.floor((line.exit_code as number) / 1000) === tag)
    assert.equal(seen.length, 100)
  }
  for (const file of ['audit.jsonl', 'audit.jsonl.1']) {
    for (const text of readFileSync(join(home, file), 'utf8').split('\n').filter(Boolean)) JSON.parse(text)
  }
})
