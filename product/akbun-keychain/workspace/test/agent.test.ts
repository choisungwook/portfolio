import { strict as assert } from 'node:assert'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { connect } from 'node:net'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { agentRequest, agentStatus, readAgentInfo } from '../src/agent/client.ts'
import { OPS, type AgentInfo } from '../src/agent/protocol.ts'
import { startAgent, type RunningAgent } from '../src/agent/server.ts'
import { KeychainError, type ErrorCode } from '../src/core/errors.ts'
import { create, initVault, list, openVault } from '../src/core/vault.ts'
import { PASSWORD, TEST_KDF_N, cli, encodings, pw, useTempHome } from './helpers.ts'

const SECRET = 'inject-secret-value-0001'
const REVEALABLE = 'reveal-secret-value-0002'
const DENIED = 'deny-secret-value-000003'

let home: string
let agent: RunningAgent | undefined

async function vaultWithKeys(): Promise<void> {
  home = useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  const key = openVault(PASSWORD)
  await create(key, { name: 'inject/key', value: SECRET, description: 'i', tags: ['t'] })
  await create(key, { name: 'reveal/key', value: REVEALABLE, ai_access: 'reveal' })
  await create(key, { name: 'deny/key', value: DENIED, description: 'secret desc', tags: ['hidden'], ai_access: 'deny' })
}

async function start(idleMs = 60_000): Promise<RunningAgent> {
  agent = await startAgent({ dataKey: openVault(PASSWORD), idleMs, absoluteMs: 120_000, onExit: () => {} })
  return agent
}

function rejectsWith(code: ErrorCode) {
  return (error: unknown) => error instanceof KeychainError && error.code === code
}

// Sends one raw line, as a client that ignores agent.json would, and returns the reply line.
function raw(endpoint: string, request: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = connect(endpoint)
    let data = ''
    socket.setEncoding('utf8')
    socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`))
    socket.on('data', (chunk: string) => {
      data += chunk
      if (data.includes('\n')) {
        socket.end()
        resolve(data)
      }
    })
    socket.on('error', reject)
  })
}

describe('agent protocol', () => {
  beforeEach(vaultWithKeys)
  afterEach(async () => {
    await agent?.close()
    agent = undefined
  })

  test('[critical] a request without the token, or with a wrong one, gets BAD_TOKEN', async () => {
    const { info } = await start()
    for (const token of [undefined, '', 'wrong', `${info.token}x`]) {
      const reply = JSON.parse(await raw(info.endpoint, { id: '1', token, actor: 'cli', op: 'list', params: {} }))
      assert.equal(reply.ok, false)
      assert.equal(reply.error.code, 'BAD_TOKEN')
    }
  })

  test('[critical] get on an inject or deny key is DENIED, and create on an existing name is EXISTS', async () => {
    await start()
    await assert.rejects(agentRequest('get', { name: 'inject/key' }, { actor: 'mcp' }), rejectsWith('DENIED'))
    await assert.rejects(agentRequest('get', { name: 'deny/key' }, { actor: 'mcp' }), rejectsWith('DENIED'))
    assert.deepEqual(await agentRequest('get', { name: 'reveal/key' }, { actor: 'mcp' }), { value: REVEALABLE })
    await assert.rejects(agentRequest('create', { name: 'inject/key', value: 'x' }, { actor: 'mcp' }), rejectsWith('EXISTS'))
  })

  test('[critical] a session-created key is inject whatever the request asked for', async () => {
    await start()
    await agentRequest('create', { name: 'new/key', value: 'v', ai_access: 'reveal' }, { actor: 'mcp' })
    const created = list(openVault(PASSWORD)).find((entry) => entry.name === 'new/key')
    assert.equal(created?.ai_access, 'inject')
    await assert.rejects(agentRequest('get', { name: 'new/key' }, { actor: 'mcp' }), rejectsWith('DENIED'))
  })

  test('[critical] no protocol op changes or deletes an existing entry', async () => {
    const { info } = await start()
    assert.deepEqual([...OPS].sort(), ['create', 'get', 'list', 'lock', 'run', 'status', 'verify'])
    for (const op of ['update', 'delete', 'remove', 'rename', 'set', 'edit', 'passwd']) {
      const reply = JSON.parse(await raw(info.endpoint, { id: '1', token: info.token, actor: 'cli', op, params: { name: 'inject/key', value: 'x' } }))
      assert.equal(reply.error.code, 'INVALID', op)
    }
    const before = readFileSync(join(home, 'vault.json'), 'utf8')
    await assert.rejects(agentRequest('create', { name: 'inject/key', value: 'overwrite' }, { actor: 'cli' }), rejectsWith('EXISTS'))
    assert.equal(readFileSync(join(home, 'vault.json'), 'utf8'), before)
  })

  test('[critical] protocol error bodies contain no value, key or token', async () => {
    const { info } = await start()
    const replies: string[] = []
    const send = async (op: string, params: Record<string, unknown>) => {
      replies.push(await raw(info.endpoint, { id: '1', token: info.token, actor: 'cli', op, params }))
    }
    await send('get', { name: 'inject/key' })
    await send('get', { name: 'deny/key' })
    await send('create', { name: 'inject/key', value: SECRET })
    await send('create', { name: 'Bad Name', value: SECRET })
    await send('run', { command: ['x'], env: { V: 'deny/key' }, base_env: {}, cwd: '.' })
    await send('run', { command: [], env: {}, base_env: {}, cwd: '.' })
    replies.push(await raw(info.endpoint, { id: '1', token: 'wrong', actor: 'cli', op: 'list', params: {} }))
    const needles = [...encodings(SECRET), ...encodings(DENIED), info.token]
    for (const reply of replies) {
      assert.equal(JSON.parse(reply).ok, false)
      for (const needle of needles) assert.ok(!reply.includes(needle), reply)
    }
  })

  test('list hides the description and tags of a deny key', async () => {
    await start()
    const { entries } = await agentRequest<{ entries: Record<string, unknown>[] }>('list', {}, { actor: 'mcp' })
    assert.deepEqual(entries.find((entry) => entry.name === 'deny/key'), { name: 'deny/key', ai_access: 'deny' })
    assert.equal(entries.find((entry) => entry.name === 'inject/key')?.description, 'i')
  })

  test('the agent exits after the idle timeout and removes agent.json and the socket', async () => {
    const running = await start(300)
    assert.ok(existsSync(join(home, 'agent.json')))
    await new Promise((resolve) => setTimeout(resolve, 800))
    assert.equal(existsSync(join(home, 'agent.json')), false)
    if (process.platform !== 'win32') assert.equal(existsSync(running.info.endpoint), false)
    assert.deepEqual(await agentStatus('cli'), { locked: true })
  })

  test('a stale agent.json with a dead pid is treated as locked and removed', async () => {
    const stale: AgentInfo = { pid: 999_999, endpoint: join(home, 'agent.sock'), token: 't', expires_at: new Date(Date.now() + 60_000).toISOString() }
    writeFileSync(join(home, 'agent.json'), JSON.stringify(stale))
    assert.equal(readAgentInfo(), undefined)
    assert.equal(existsSync(join(home, 'agent.json')), false)
    await assert.rejects(agentRequest('list', {}, { actor: 'cli' }), rejectsWith('LOCKED'))
  })

  test('a change written by a password-gated command is visible in the agent\'s next list', async () => {
    await start()
    assert.equal(cli(['edit', 'inject/key', '--description', 'changed by the user', '--password-stdin'], pw()).status, 0)
    const { entries } = await agentRequest<{ entries: Record<string, unknown>[] }>('list', {}, { actor: 'cli' })
    assert.equal(entries.find((entry) => entry.name === 'inject/key')?.description, 'changed by the user')
  })
})

describe('unlock and lock through the CLI', () => {
  test('unlock starts a detached agent that outlives the command; lock stops it', () => {
    useTempHome()
    cli(['init', '--password-stdin'], pw())
    const unlocked = cli(['unlock', '--password-stdin', '--ttl', '2m'], pw())
    assert.equal(unlocked.status, 0, unlocked.stderr)
    const status = JSON.parse(cli(['status', '--json']).stdout)
    assert.equal(status.locked, false)
    assert.equal(cli(['unlock', '--password-stdin'], pw()).stdout.startsWith('Already unlocked'), true)
    assert.equal(cli(['lock']).status, 0)
    assert.equal(JSON.parse(cli(['status', '--json']).stdout).locked, true)
    assert.equal(cli(['lock']).stdout, 'Already locked.\n')
  })

  test('unlock with a wrong password exits 4 and starts nothing', () => {
    useTempHome()
    cli(['init', '--password-stdin'], pw())
    assert.equal(cli(['unlock', '--password-stdin'], 'wrong password value\n').status, 4)
    assert.equal(JSON.parse(cli(['status', '--json']).stdout).locked, true)
  })
})
