import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULTS } from '../src/config.ts'
import { hybridSearch } from '../src/team/search.ts'
import { teamTools } from '../src/team/tools.ts'
import { setup } from './helpers.ts'

const AIMEM_CLI = join(import.meta.dirname, '..', '..', '..', 'akbun-aimemory', 'workspace', 'src', 'cli.ts')

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

  test('calls aimem add and aimem search when bots.aimemory.enabled is true', async () => {
    const aimemHome = mkdtempSync(join(tmpdir(), 'taskq-aimem-'))
    const env = setup({
      bots: {
        ...DEFAULTS.bots,
        aimemory: { enabled: true, command: process.execPath, args: [AIMEM_CLI], home: aimemHome },
      },
    })
    try {
      const tools = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) })
      const addTool = tools.find((t) => t.name === 'aimemory_add')
      const searchTool = tools.find((t) => t.name === 'aimemory_search')
      assert.ok(addTool && searchTool)

      const added = await addTool.handler({ text: 'Taskq bot shared decision: deploy on Tuesday', project: 'ops' })
      assert.equal(typeof added.id, 'number')

      const found = await searchTool.handler({ query: 'deploy Tuesday', project: 'ops' })
      assert.equal(found.degraded, false)
      const hits = found.hits as { content: string }[]
      assert.equal(hits.length, 1)
      assert.match(hits[0].content, /deploy on Tuesday/)
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
