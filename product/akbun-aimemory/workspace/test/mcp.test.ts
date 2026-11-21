import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { loadConfig } from '../src/config.ts'
import { spoolPath } from '../src/hook.ts'
import { MCP_TOOLS, callMcpTool } from '../src/mcp/server.ts'
import { dbPath, openStore } from '../src/store.ts'

test('[critical] MCP search tool returns degraded: true with spool hits without error when the database fails', () => {
  const config = loadConfig(mkdtempSync(join(tmpdir(), 'aimem-mcp-deg-')), false)
  openStore(config).db.close()
  rmSync(dbPath(config))
  rmSync(`${dbPath(config)}-wal`, { force: true })
  rmSync(`${dbPath(config)}-shm`, { force: true })
  writeFileSync(dbPath(config), 'not a sqlite database')
  writeFileSync(
    spoolPath(config),
    `${JSON.stringify({
      agent: 'claude',
      payload: { session_id: 's1', cwd: '/repo/demo', hook_event_name: 'UserPromptSubmit', prompt: 'remember the degraded fallback token' },
      at: 1700000000000,
    })}\n`,
  )

  const res = callMcpTool(config, 'search', { query: 'degraded fallback' })
  assert.notEqual(res.isError, true)
  const first = res.content[0]
  assert.equal(first.type, 'text')
  const parsed = JSON.parse(first.text) as { degraded: boolean; hits: { content: string }[] }
  assert.equal(parsed.degraded, true)
  assert.equal(parsed.hits.length, 1)
  assert.match(parsed.hits[0].content, /degraded fallback/)
  assert.deepEqual(res.structuredContent, parsed)
})

test('aimem mcp stdio server exposes the four tools and matches CLI --json response shapes', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aimem-mcp-stdio-'))
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['src/cli.ts', 'mcp'],
    env: { ...process.env, AIMEMORY_HOME: dir },
  })
  const client = new Client({ name: 'aimem-test-client', version: '0.1.0' })
  await client.connect(transport)
  try {
    const listed = await client.listTools()
    const names = listed.tools.map((t) => t.name).sort()
    assert.deepEqual(names, ['add_note', 'recent', 'search', 'show_session'])

    const added = await client.callTool({
      name: 'add_note',
      arguments: { text: 'MCP stdio parity verification note', project: 'demo', session: 'sess-mcp' },
    })
    assert.notEqual(added.isError, true)
    const addContent = added.content as { type: string; text: string }[]
    const addedJson = JSON.parse(addContent[0].text) as { id: number | null }
    assert.equal(typeof addedJson.id, 'number')

    const searched = await client.callTool({
      name: 'search',
      arguments: { query: 'parity verification', project: 'demo' },
    })
    const searchJson = JSON.parse((searched.content as { type: string; text: string }[])[0].text) as { degraded: boolean; hits: { id: number; content: string }[] }
    assert.equal(searchJson.degraded, false)
    assert.equal(searchJson.hits[0].id, addedJson.id)

    const cliSearch = spawnSync(process.execPath, ['src/cli.ts', 'search', 'parity verification', '--project', 'demo', '--json'], {
      env: { ...process.env, AIMEMORY_HOME: dir }, encoding: 'utf8',
    })
    assert.equal(cliSearch.status, 0)
    const cliSearchJson = JSON.parse(cliSearch.stdout) as { degraded: boolean; hits: { id: number }[] }
    assert.equal(searchJson.degraded, cliSearchJson.degraded)
    assert.deepEqual(searchJson.hits.map((h) => h.id), cliSearchJson.hits.map((h) => h.id))

    const recentRes = await client.callTool({ name: 'recent', arguments: { project: 'demo', limit: 5 } })
    const recentJson = JSON.parse((recentRes.content as { type: string; text: string }[])[0].text) as { id: number }[]
    assert.equal(recentJson[0].id, addedJson.id)

    const sessionRes = await client.callTool({ name: 'show_session', arguments: { session_id: 'sess-mcp' } })
    const sessionJson = JSON.parse((sessionRes.content as { type: string; text: string }[])[0].text) as { id: number }[]
    assert.equal(sessionJson.length, 1)
    assert.equal(sessionJson[0].id, addedJson.id)
  } finally {
    await client.close()
  }
})

test('MCP tool list, aimem --help, and SKILL.md stay aligned on tools and degraded semantics', () => {
  const help = spawnSync(process.execPath, ['src/cli.ts', '--help'], { encoding: 'utf8' }).stdout
  const skill = readFileSync(new URL('../skills/aimemory/SKILL.md', import.meta.url), 'utf8')
  const toolNames = MCP_TOOLS.map((t) => t.name)
  for (const name of toolNames) {
    assert.ok(help.includes(name), `--help mentions ${name}`)
    assert.ok(skill.includes(name), `SKILL.md mentions ${name}`)
  }
  assert.ok(help.includes('aimem mcp'))
  assert.ok(skill.includes('aimem mcp'))
  assert.ok(skill.includes('degraded: true'))
  assert.ok(MCP_TOOLS.find((t) => t.name === 'search')?.description?.includes('degraded: true'))
  assert.equal(toolNames.some((n) => n.includes('delete')), false, 'no delete tool over MCP')
})
