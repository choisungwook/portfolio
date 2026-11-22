import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../src/config.ts'
import { hybridSearch } from '../src/team/search.ts'
import { teamTools } from '../src/team/tools.ts'
import { setup } from './helpers.ts'

// Self-contained stub CLI so taskq tests run without requiring node_modules in any sibling product workspace.
function writeFakeAimem(dir: string): string {
  const script = join(dir, 'fake-aimem.mjs')
  writeFileSync(script, `
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    json: { type: 'boolean', default: false },
    agent: { type: 'string' },
    project: { type: 'string' },
    limit: { type: 'string' },
  },
})
const [cmd, ...rest] = positionals
const dbFile = join(process.env.AIMEMORY_HOME, 'items.json')
const items = existsSync(dbFile) ? JSON.parse(readFileSync(dbFile, 'utf8')) : []
if (cmd === 'add') {
  const item = { id: items.length + 1, agent: values.agent, project: values.project ?? '', content: rest.join(' ') }
  items.push(item)
  writeFileSync(dbFile, JSON.stringify(items))
  process.stdout.write(JSON.stringify({ id: item.id }) + '\\n')
} else if (cmd === 'search') {
  const q = rest.join(' ').toLowerCase()
  const hits = items.filter((m) => (!values.project || m.project === values.project) && m.content.toLowerCase().includes(q))
  process.stdout.write(JSON.stringify({ degraded: false, hits }) + '\\n')
}
`, 'utf8')
  return script
}

describe('aimemory integration in taskq bot memory tools', () => {
  test('omits aimemory tools when bots.aimemory.enabled is false (default)', () => {
    const env = setup()
    try {
      const names = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) }).map((t) => t.name)
      assert.equal(names.includes('aimemory_search'), false)
      assert.equal(names.includes('aimemory_add'), false)
    } finally {
      env.cleanup()
    }
  })

  test('calls aimem add and aimem search cleanly, including inputs starting with dashes', async () => {
    const aimemHome = mkdtempSync(join(tmpdir(), 'taskq-aimem-'))
    const fakeCli = writeFakeAimem(aimemHome)
    const env = setup({
      bots: {
        ...DEFAULTS.bots,
        aimemory: { enabled: true, command: process.execPath, args: [fakeCli], home: aimemHome },
      },
    })
    try {
      const tools = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) })
      const addTool = tools.find((t) => t.name === 'aimemory_add')
      const searchTool = tools.find((t) => t.name === 'aimemory_search')
      assert.ok(addTool && searchTool)

      const added = await addTool.handler({ text: '- deploy on Tuesday with --noEmit', project: 'ops' })
      assert.equal(typeof added.id, 'number')

      const found = await searchTool.handler({ query: '--noEmit', project: 'ops' })
      assert.equal(found.degraded, false)
      const hits = found.hits as { content: string }[]
      assert.equal(hits.length, 1)
      assert.match(hits[0].content, /--noEmit/)
    } finally {
      env.cleanup()
      rmSync(aimemHome, { recursive: true, force: true })
    }
  })

  test('aimemory_search degrades cleanly when aimem command fails', async () => {
    const env = setup({
      bots: {
        ...DEFAULTS.bots,
        aimemory: { enabled: true, command: '/nonexistent/aimem-binary' },
      },
    })
    try {
      const tools = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) })
      const searchTool = tools.find((t) => t.name === 'aimemory_search')
      assert.ok(searchTool)
      const res = await searchTool.handler({ query: 'anything' })
      assert.equal(res.degraded, true)
      assert.deepEqual(res.hits, [])
    } finally {
      env.cleanup()
    }
  })
})
