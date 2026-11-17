// Builds one akbun-keychain executable for the machine it runs on: `node scripts/build-binary.ts [outfile]`, with bun on PATH.
// ui/ is not embedded yet; phase 6 adds it through src/resources.ts the way akbun-taskq does.
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const WORKSPACE = join(import.meta.dirname, '..')
const ENTRY = join(WORKSPACE, 'src', 'cli', 'main.ts')

function main(): void {
  const outfile = process.argv[2] ?? join(WORKSPACE, 'dist', 'akbun-keychain')
  mkdirSync(join(WORKSPACE, 'dist'), { recursive: true })
  const build = spawnSync('bun', ['build', '--compile', ENTRY, '--outfile', outfile], { cwd: WORKSPACE, stdio: 'inherit' })
  if (build.status !== 0) throw new Error(`bun build failed with status ${build.status}`)
}

main()
