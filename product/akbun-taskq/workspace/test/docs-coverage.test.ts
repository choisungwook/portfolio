import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import { setup } from './helpers.ts'

// Documentation an agent relies on before it changes taskq. A route, an SDK option or a bot tool that exists in code but
// not in the docs is how the next change breaks something nobody wrote down, so these run on every pull request.
const ROOT = join(import.meta.dirname, '..', '..')
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8')

describe('docs cover the code', () => {
  test('[critical] every API route is in wiki/architecture.md', () => {
    const doc = read('wiki/architecture.md')
    const routes = new Set<string>()
    for (const file of readdirSync(join(ROOT, 'workspace', 'src', 'api')).filter((name) => name.endsWith('.ts'))) {
      const text = read(join('workspace', 'src', 'api', file))
      for (const match of text.matchAll(/api\.(?:get|post|put|patch|delete)\(['`]([^'`]+)['`]/g)) {
        const path = match[1]
        for (const kind of path.includes('${kind}') ? ['skill', 'plugin'] : ['']) routes.add(path.replace('${kind}', kind))
      }
    }
    assert.ok(routes.size > 40, `found only ${routes.size} routes; the pattern may be broken`)
    const missing = [...routes].filter((route) => !doc.includes(route))
    assert.deepEqual(missing, [], 'add these routes to the API table in wiki/architecture.md')
  })

  test('[critical] every Agent SDK option taskq sets is explained in wiki/sdk-usage.md', () => {
    const doc = read('wiki/sdk-usage.md')
    const keys = new Set<string>()
    const blocks: [string, string][] = [
      ['workspace/src/agents/claude/worker.ts', 'function buildOptions'],
      ['workspace/src/agents/claude/team.ts', 'function optionsFor'],
      ['workspace/src/agents/claude/ask.ts', 'const options: Options = {'],
    ]
    for (const [file, start] of blocks) {
      const text = read(file)
      const at = text.indexOf(start)
      assert.ok(at >= 0, `${start} not found in ${file}`)
      const block = text.slice(at, text.indexOf(start.startsWith('function') ? '\n}\n' : '\n  }\n', at))
      for (const match of block.matchAll(/^\s{4}(\w+):/gm)) keys.add(match[1])
    }
    assert.ok(keys.size > 15, `found only ${keys.size} options; the pattern may be broken`)
    const missing = [...keys].filter((key) => !doc.includes(`\`${key}\``))
    assert.deepEqual(missing, [], 'explain these options in wiki/sdk-usage.md')
  })

  test('[critical] every bot tool is named in wiki/architecture.md', () => {
    const env = setup()
    try {
      const doc = read('wiki/architecture.md')
      const names = teamTools({ db: env.db, config: env.config, agent: 'taskq', search: hybridSearch(env.db) }).map((tool) => tool.name)
      assert.deepEqual(names.filter((name) => !doc.includes(name)), [], 'name these tools in the Bots section of wiki/architecture.md')
    } finally {
      env.cleanup()
    }
  })

  test('[critical] the changelog has an entry for this version with an SDK section', () => {
    const changelog = read('CHANGELOG.md')
    const start = changelog.indexOf(`## ${pkg.version}\n`)
    assert.ok(start >= 0, `CHANGELOG.md has no "## ${pkg.version}" entry`)
    const next = changelog.indexOf('\n## ', start + 1)
    const entry = changelog.slice(start, next < 0 ? undefined : next)
    // Any of the four kinds wiki/development.md lists counts; a dependency-only release still says what Changed.
    assert.match(entry, /### (Added|Changed|Fixed|Removed)/)
    assert.match(entry, /### SDK/, 'say which Agent SDK features this version uses and how')
  })
})
