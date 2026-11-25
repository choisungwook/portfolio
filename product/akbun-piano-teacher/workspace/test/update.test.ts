// The update downloads a large dmg into the temp folder. If any of the three cleanup points goes missing, every failed
// update leaves one behind. The swap script test runs without hdiutil: failing at attach is the path under test.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import test from 'node:test'
import { cleanupTempDirs, compareVersion, downloadDmg, pickDmg, SWAP_SCRIPT } from '../src/main/update.ts'

const TEMP_PREFIX = 'akbun-piano-teacher-update-'
const root = path.join(import.meta.dirname, '..')
const countTempDirs = () => fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith(TEMP_PREFIX)).length
const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX))

test('versions compare as numbers', () => {
  assert.ok(compareVersion('0.10.0', '0.9.9') > 0)
  assert.equal(compareVersion('1.2.3', '1.2.3'), 0)
})

test('picks the dmg for the running architecture', () => {
  const assets = ['akbun-piano-teacher-0.2.0-arm64.dmg', 'akbun-piano-teacher-0.2.0.dmg', 'latest.yml'].map((name) => ({ name, browser_download_url: name }))
  assert.equal(pickDmg(assets, 'arm64'), 'akbun-piano-teacher-0.2.0-arm64.dmg')
  assert.equal(pickDmg(assets, 'x64'), 'akbun-piano-teacher-0.2.0.dmg')
})

test('cleanupTempDirs removes only update temp folders', async () => {
  const stale = makeTempDir()
  fs.writeFileSync(path.join(stale, 'leftover.dmg'), 'x'.repeat(1024))
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'unrelated-'))
  try {
    await cleanupTempDirs()
    assert.equal(countTempDirs(), 0)
    assert.ok(fs.existsSync(unrelated))
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true })
  }
})

test('downloadDmg removes its folder when the download fails', async () => {
  await cleanupTempDirs()
  await assert.rejects(() => downloadDmg('http://127.0.0.1:1/akbun-piano-teacher.dmg'))
  assert.equal(countTempDirs(), 0)
})

test('the swap script leaves no work folder when it fails', () => {
  const work = makeTempDir()
  const scriptPath = path.join(work, 'swap.sh')
  const dmgPath = path.join(work, 'fake.dmg')
  fs.writeFileSync(scriptPath, SWAP_SCRIPT, { mode: 0o755 })
  fs.writeFileSync(dmgPath, 'not a dmg, so attach fails')
  const deadPid = spawnSync('/usr/bin/true').pid
  const result = spawnSync('/bin/bash', [scriptPath, path.join(work, 'missing.app'), dmgPath, String(deadPid)], { stdio: 'ignore', timeout: 30_000 })
  assert.notEqual(result.status, 0)
  assert.ok(!fs.existsSync(work))
})

test('all three cleanup points are still in the code', () => {
  const update = fs.readFileSync(path.join(root, 'src/main/update.ts'), 'utf8')
  const main = fs.readFileSync(path.join(root, 'src/main/main.ts'), 'utf8')
  assert.match(SWAP_SCRIPT, /trap cleanup EXIT/)
  assert.match(update, /fs\.rm\(dir/)
  assert.match(main, /cleanupTempDirs\(\)/)
  assert.match(main, /fs\.rm\(path\.dirname\(dmgPath\)/)
})
