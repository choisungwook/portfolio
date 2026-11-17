import { strict as assert } from 'node:assert'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { test } from 'node:test'
import pkg from '../package.json' with { type: 'json' }

const MAIN = join(import.meta.dirname, '..', 'src', 'cli', 'main.ts')

test('version prints the package.json version', () => {
  const run = spawnSync(process.execPath, [MAIN, 'version'], { encoding: 'utf8' })
  assert.equal(run.status, 0)
  assert.equal(run.stdout, `akbun-keychain ${pkg.version}\n`)
})
