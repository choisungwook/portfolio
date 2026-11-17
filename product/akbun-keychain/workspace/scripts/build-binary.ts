// Builds one akbun-keychain executable for the machine it runs on: `node scripts/build-binary.ts [outfile]`, with bun
// on PATH. The executable embeds ui/, so it needs neither Node nor a checkout.
import { spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const WORKSPACE = join(import.meta.dirname, '..')
const ENTRY = join(WORKSPACE, 'dist', 'binary-entry.ts')

function filesUnder(dir: string): string[] {
  return readdirSync(join(WORKSPACE, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(WORKSPACE, join(entry.parentPath, entry.name)).split('\\').join('/'))
    .sort()
}

// Static imports run before the module body, so main is imported only after the embedded paths are registered.
function entrySource(files: string[]): string {
  const imports = files.map((file, index) => `import f${index} from '../${file}' with { type: 'file' }`)
  const table = files.map((file, index) => `  ['${file}', f${index}],`)
  return [
    "import { registerEmbedded } from '../src/resources.ts'",
    ...imports,
    '',
    'registerEmbedded(new Map([',
    ...table,
    ']))',
    "await import('../src/cli/main.ts')",
    '',
  ].join('\n')
}

function main(): void {
  const outfile = process.argv[2] ?? join(WORKSPACE, 'dist', 'akbun-keychain')
  mkdirSync(join(WORKSPACE, 'dist'), { recursive: true })
  writeFileSync(ENTRY, entrySource(filesUnder('ui')))
  const build = spawnSync('bun', ['build', '--compile', ENTRY, '--outfile', outfile], { cwd: WORKSPACE, stdio: 'inherit' })
  if (build.status !== 0) throw new Error(`bun build failed with status ${build.status}`)
}

main()
