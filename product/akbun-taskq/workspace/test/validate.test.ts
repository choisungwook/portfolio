import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseTaskInput, parseTaskPatch } from '../src/validate.ts'

const dir = mkdtempSync(join(tmpdir(), 'taskq-validate-'))
const file = join(dir, 'a-file.txt')
writeFileSync(file, 'x')
const none = () => false
const input = (extra: Record<string, unknown>, known: (name: string) => boolean = none) => parseTaskInput({ type: 'research', intent: 'x', ...extra }, known)

test('output_path must be relative and stay inside outputs/', () => {
  for (const bad of ['/etc/passwd', '../x.md', 'a/../../x.md', '']) {
    assert.equal(input({ output_path: bad }).ok, false, bad)
  }
  assert.equal(input({ output_path: 'reports/a.md' }).ok, true)
  assert.equal(input({ output_path: 'a/../b.md' }).ok, true)
  assert.equal(parseTaskPatch({ output_path: '../x.md' }, none).ok, false)
})

test('repo must be an absolute path to an existing directory', () => {
  assert.equal(input({ repo: 'relative/dir' }).ok, false)
  assert.equal(input({ repo: join(dir, 'missing') }).ok, false)
  assert.equal(input({ repo: file }).ok, false)
  assert.equal(input({ repo: dir }).ok, true)
  assert.equal(parseTaskPatch({ repo: 'relative' }, none).ok, false)
})

test('access_skill must name a registered access skill, on create and on patch', () => {
  const registered = (name: string) => name === 'example-readonly'
  assert.equal(input({ access_skill: 'example-readonly' }, registered).ok, true)
  const bad = input({ access_skill: 'example-sandbox' }, registered)
  assert.equal(bad.ok, false)
  assert.match(bad.ok ? '' : bad.error, /register it in Settings or with taskq skills add/)
  assert.equal(input({}, registered).ok, true, 'no access_skill is always allowed')
  assert.equal(parseTaskPatch({ access_skill: 'example-sandbox' }, registered).ok, false)
  assert.equal(parseTaskPatch({ access_skill: 'example-readonly' }, registered).ok, true)
})
