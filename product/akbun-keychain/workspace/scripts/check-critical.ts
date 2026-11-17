// Runs the [critical] tests and fails when fewer pass than test/critical-minimum.json says.
// The tests guard the security model; renaming or deleting one would otherwise pass CI silently.
// Raise the minimum in the same commit that adds critical tests. Lowering it is a reviewed decision.
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKSPACE = join(import.meta.dirname, '..')
const { minimum } = JSON.parse(readFileSync(join(WORKSPACE, 'test', 'critical-minimum.json'), 'utf8')) as { minimum: number }

const run = spawnSync(
  process.execPath,
  ['--test', '--test-reporter=tap', '--test-name-pattern=\\[critical\\]', 'test/**/*.test.ts'],
  { cwd: WORKSPACE, encoding: 'utf8' },
)
process.stdout.write(run.stdout)
process.stderr.write(run.stderr)

// Count test lines whose name starts with [critical]. The TAP summary also counts files that matched no test.
const count = (status: string) => (run.stdout.match(new RegExp(`^\\s*${status} \\d+ - \\[critical\\]`, 'gm')) ?? []).length
const passed = count('ok')
const failed = count('not ok')

if (run.status !== 0 || failed > 0) {
  console.error(`critical tests failed: ${failed} failing`)
  process.exit(1)
}
if (passed < minimum) {
  console.error(`only ${passed} [critical] tests ran, the minimum is ${minimum}: a critical test was renamed or removed`)
  process.exit(1)
}
console.log(`${passed} [critical] tests passed (minimum ${minimum})`)
