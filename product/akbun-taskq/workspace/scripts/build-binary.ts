// Builds one taskq executable for the machine it runs on: `node scripts/build-binary.ts [outfile]`, with bun on PATH.
// The executable embeds the UI, the schema, the taskq skill with this version's manual and the Claude Code binary of the installed SDK, so it needs neither Node
// nor a checkout. The Claude Code binary comes from the platform package npm installed, so build on the target OS.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

const WORKSPACE = join(import.meta.dirname, '..')
const ENTRY = join(WORKSPACE, 'dist', 'binary-entry.ts')

function filesUnder(dir: string): string[] {
  return readdirSync(join(WORKSPACE, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(WORKSPACE, join(entry.parentPath, entry.name)))
    .sort()
}

// Static imports run before the module body, so main is imported only after the embedded paths are registered.
function entrySource(files: string[], claude: string): string {
  const imports = files.map((file, index) => `import f${index} from '../${file}' with { type: 'file' }`)
  const table = files.map((file, index) => `  ['${file}', f${index}],`)
  return [
    "import { registerEmbedded } from '../src/resources.ts'",
    `import claude from '../${claude}' with { type: 'file' }`,
    ...imports,
    '',
    'registerEmbedded(new Map([',
    ...table,
    ']), claude)',
    "await import('../src/cli/main.ts')",
    '',
  ].join('\n')
}

function main(): void {
  const outfile = process.argv[2] ?? join(WORKSPACE, 'dist', 'taskq')
  const claude = `node_modules/@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`
  if (!existsSync(join(WORKSPACE, claude))) throw new Error(`${claude} is missing; run npm ci on this platform first`)
  mkdirSync(join(WORKSPACE, 'dist'), { recursive: true })
  writeFileSync(ENTRY, entrySource([...filesUnder('ui'), ...filesUnder('src/db/schema'), ...filesUnder('skills'), 'manual.md'], claude))
  const build = spawnSync('bun', ['build', '--compile', ENTRY, '--outfile', outfile], { cwd: WORKSPACE, stdio: 'inherit' })
  if (build.status !== 0) throw new Error(`bun build failed with status ${build.status}`)
}

main()
