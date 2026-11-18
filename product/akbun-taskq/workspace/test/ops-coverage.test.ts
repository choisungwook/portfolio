import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { OPERATIONS } from '../src/ops/operations.ts'
import { getAgent } from '../src/db/team.ts'
import { seedTestBots, setup } from './helpers.ts'

// Everything the UI does must be reachable from the CLI and the MCP server. Both use one table of operations, so the
// check is that every route has an operation and every operation names a real route.

const API = join(import.meta.dirname, '..', 'src', 'api')

function routes(): Set<string> {
  const out = new Set<string>()
  for (const file of readdirSync(API).filter((name) => name.endsWith('.ts'))) {
    const text = readFileSync(join(API, file), 'utf8')
    for (const match of text.matchAll(/api\.(get|post|put|patch|delete)\(['`]([^'`]+)['`]/g)) {
      const path = match[2]
      for (const kind of path.includes('${kind}') ? ['skill', 'plugin'] : ['']) out.add(`${match[1].toUpperCase()} ${path.replace('${kind}', kind)}`)
    }
  }
  return out
}

describe('CLI and MCP reach every route', () => {
  test('[critical] every API route has an operation, and every operation is a real route', () => {
    const all = routes()
    // The UI's live update stream stays open; a one-shot CLI call or MCP tool has nothing to do with it.
    all.delete('GET /events/stream')
    const ops = new Set(OPERATIONS.map((op) => `${op.method} ${op.path}`))
    assert.deepEqual([...all].filter((r) => !ops.has(r)), [], 'add these routes to src/ops/operations.ts')
    assert.deepEqual([...ops].filter((o) => !all.has(o)), [], 'these operations name no route')
    assert.equal(new Set(OPERATIONS.map((op) => op.name)).size, OPERATIONS.length, 'operation names are unique')
  })

  test('[critical] the CLI changes a bot and creates and runs a workflow; the MCP server offers the same operations', async (t) => {
    const env = setup()
    t.after(env.cleanup)
    await seedTestBots(env.db)
    const cliEnv = { TASKQ_HOME: env.home, TASKQ_NO_NOTIFY: '1' }
    const cli = (...args: string[]) => execFileSync(process.execPath, ['bin/taskq', ...args], { env: { ...process.env, ...cliEnv }, encoding: 'utf8' }).trim()
    cli('api', 'bot_update', 'name=coder', 'model=claude-sonnet-5-5', 'effort=high', 'permission_mode=acceptEdits')
    const coder = getAgent(env.db, 'coder')!
    assert.deepEqual([coder.model, coder.effort, coder.permission_mode], ['claude-sonnet-5-5', 'high', 'acceptEdits'])
    const file = join(env.home, 'wf.json')
    writeFileSync(file, JSON.stringify({ name: 'release', definition: { steps: [{ id: 'build', name: 'Build', kind: 'do', needs: [] }] } }))
    assert.match(cli('workflows', 'create', file), / release$/)
    assert.match(cli('workflows', 'run', 'release', '--bot', 'coder'), /running\s+release\s+bot coder/)
    assert.match(cli('workflows', 'runs'), /bot coder/)
    assert.throws(() => cli('api', 'bot_update', 'name=coder', 'effort=extreme'), /effort/)

    const transport = new StdioClientTransport({ command: process.execPath, args: ['bin/taskq', 'mcp'], env: cliEnv, stderr: 'pipe' })
    const client = new Client({ name: 'taskq-test', version: '1.0.0' })
    try {
      await client.connect(transport)
      const names = new Set((await client.listTools()).tools.map((tool) => tool.name))
      assert.deepEqual(OPERATIONS.filter((op) => !names.has(`taskq_${op.name}`)).map((op) => op.name), [])
      const runs = await client.callTool({ name: 'taskq_workflow_runs', arguments: { bot: 'coder' } })
      const list = JSON.parse((runs.content as { text: string }[])[0].text) as { bot: string; workflow_name: string }[]
      assert.deepEqual(list.map((r) => [r.bot, r.workflow_name]), [['coder', 'release']])
      const sent = await client.callTool({ name: 'taskq_bot_send', arguments: { to: 'planner', body: 'from mcp' } })
      assert.notEqual(sent.isError, true)
      const missing = await client.callTool({ name: 'taskq_bot_get', arguments: { name: 'nobody' } })
      assert.equal(missing.isError, true)
    } finally {
      await client.close()
    }
  })
})
