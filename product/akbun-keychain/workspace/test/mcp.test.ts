import { strict as assert } from 'node:assert'
import { after, before, describe, test } from 'node:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { startAgent, type RunningAgent } from '../src/agent/server.ts'
import { create, initVault, list, openVault } from '../src/core/vault.ts'
import { MAIN, PASSWORD, TEST_KDF_N, useTempHome } from './helpers.ts'

const SECRET = 'mcp-secret-value-998877'

interface ToolText {
  isError?: boolean
  content: { type: string; text: string }[]
}

async function connectClient(): Promise<Client> {
  const client = new Client({ name: 'test', version: '0.0.0' })
  const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined))
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MAIN, 'mcp'], env }))
  return client
}

async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolText> {
  return (await client.callTool({ name, arguments: args })) as ToolText
}

// biome-ignore lint/suspicious/noExplicitAny: tool results are JSON the test reads field by field
function json(result: ToolText): any {
  return JSON.parse(result.content[0].text)
}

describe('MCP server', () => {
  let client: Client
  let agent: RunningAgent | undefined

  before(async () => {
    useTempHome()
    await initVault(PASSWORD, { kdfN: TEST_KDF_N })
    const key = openVault(PASSWORD)
    await create(key, { name: 'app/token', value: SECRET, tags: ['app'] })
    await create(key, { name: 'app/url', value: 'https://example.invalid/x', ai_access: 'reveal' })
    client = await connectClient()
  })

  after(async () => {
    await client.close()
    await agent?.close()
  })

  test('[critical] the tool list has no tool that overwrites, edits or deletes', async () => {
    const { tools } = await client.listTools()
    assert.deepEqual(tools.map((tool) => tool.name).sort(), ['create_secret', 'get_secret', 'keychain_status', 'list_keys', 'run_with_secrets'])
    for (const tool of tools) assert.doesNotMatch(tool.name, /update|edit|delete|remove|rename|overwrite|set/)
    const description = tools.find((tool) => tool.name === 'list_keys')?.description ?? ''
    assert.match(description, /run_with_secrets/)
  })

  test('[critical] while locked, keychain_status reports locked and every other tool returns LOCKED', async () => {
    assert.deepEqual(json(await call(client, 'keychain_status')), { locked: true })
    const others: [string, Record<string, unknown>][] = [
      ['list_keys', {}],
      ['get_secret', { name: 'app/url' }],
      ['create_secret', { name: 'x/y', value: 'v' }],
      ['run_with_secrets', { command: ['true'], env: {} }],
    ]
    for (const [name, args] of others) {
      const result = await call(client, name, args)
      assert.equal(result.isError, true, name)
      assert.match(result.content[0].text, /^LOCKED: .*akbun-keychain unlock/)
    }
  })

  test('every tool works against an unlocked vault', async () => {
    agent = await startAgent({ dataKey: openVault(PASSWORD), idleMs: 60_000, absoluteMs: 120_000, onExit: () => {} })
    assert.equal(json(await call(client, 'keychain_status')).locked, false)

    const listed = json(await call(client, 'list_keys', { tag: 'app' }))
    assert.deepEqual(listed.entries.map((entry: { name: string }) => entry.name), ['app/token'])

    const run = json(await call(client, 'run_with_secrets', {
      command: [process.execPath, '-e', 'console.log(process.env.T); console.error("err")'],
      env: { T: 'app/token' },
    }))
    assert.deepEqual(run, { exit_code: 0, timed_out: false, stdout: '[masked:app/token]\n', stderr: 'err\n' })

    assert.deepEqual(json(await call(client, 'get_secret', { name: 'app/url' })), { value: 'https://example.invalid/x' })
    const denied = await call(client, 'get_secret', { name: 'app/token' })
    assert.equal(denied.isError, true)
    assert.match(denied.content[0].text, /^DENIED: /)
    assert.ok(!denied.content[0].text.includes(SECRET))

    assert.deepEqual(json(await call(client, 'create_secret', { name: 'new/key', value: 'v1', tags: ['n'] })), { name: 'new/key', version: 1 })
    assert.equal((await call(client, 'create_secret', { name: 'new/key', value: 'v2' })).isError, true)
    assert.equal(list(openVault(PASSWORD)).find((entry) => entry.name === 'new/key')?.ai_access, 'inject')

    const timedOut = json(await call(client, 'run_with_secrets', { command: [process.execPath, '-e', 'setTimeout(()=>{},9000)'], env: {}, timeout_sec: 0.3 }))
    assert.deepEqual(timedOut, { exit_code: null, timed_out: true, stdout: '', stderr: '' })
  })

  test('run_with_secrets output over 64 KiB is cut and says so', async () => {
    const result = json(await call(client, 'run_with_secrets', { command: [process.execPath, '-e', 'process.stdout.write("x".repeat(100000))'], env: {} }))
    assert.equal(result.stdout.length, 64 * 1024 + '\n[cut at 64 KiB]'.length)
    assert.ok(result.stdout.endsWith('\n[cut at 64 KiB]'))
  })
})
