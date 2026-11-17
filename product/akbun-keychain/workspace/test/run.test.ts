import { strict as assert } from 'node:assert'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { agentRequest } from '../src/agent/client.ts'
import { createMasker } from '../src/agent/mask.ts'
import type { RunResult, StreamLine } from '../src/agent/protocol.ts'
import { startAgent, type RunningAgent } from '../src/agent/server.ts'
import { readAudit } from '../src/core/audit.ts'
import { KeychainError, type ErrorCode } from '../src/core/errors.ts'
import { create, initVault, openVault } from '../src/core/vault.ts'
import { MAIN, PASSWORD, TEST_KDF_N, cliAsync, encodings, useTempHome } from './helpers.ts'

const SECRET = 'run-secret-value-ABCDEF123'
const NODE = process.execPath

let home: string
let agent: RunningAgent | undefined

function rejectsWith(code: ErrorCode) {
  return (error: unknown) => error instanceof KeychainError && error.code === code
}

async function setup(): Promise<void> {
  home = useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  const key = openVault(PASSWORD)
  await create(key, { name: 'app/token', value: SECRET })
  await create(key, { name: 'short/pin', value: '1234' })
  await create(key, { name: 'deny/key', value: 'deny-value-xyz-123', ai_access: 'deny' })
  agent = await startAgent({ dataKey: key, idleMs: 60_000, absoluteMs: 120_000, onExit: () => {} })
}

async function run(command: string[], env: Record<string, string>, extra: Record<string, unknown> = {}) {
  let stdout = ''
  let stderr = ''
  const result = await agentRequest<RunResult>(
    'run',
    { command, env, base_env: { PATH: process.env.PATH ?? '' }, cwd: home, ...extra },
    {
      actor: 'cli',
      onStream: (line: StreamLine) => {
        if (line.stream === 'stdout') stdout += line.data
        else stderr += line.data
      },
    },
  )
  return { ...result, stdout, stderr }
}

describe('masking', () => {
  test('plain, base64, hex and URL-encoded forms are masked', () => {
    const value = 'p@ss word/+=value'
    const masker = createMasker([{ name: 'k', value }])
    const forms = [...encodings(value), encodeURIComponent(value)]
    const out = masker.push(forms.join(' | ')) + masker.end()
    for (const form of forms) assert.ok(!out.includes(form), form)
    assert.equal(out.split('[masked:k]').length - 1, forms.length)
  })

  test('[critical] a value split across chunks, at every position, is still masked', () => {
    const text = `before ${SECRET} after`
    for (let cut = 1; cut < text.length; cut++) {
      const masker = createMasker([{ name: 'app/token', value: SECRET }])
      const out = masker.push(Buffer.from(text.slice(0, cut))) + masker.push(Buffer.from(text.slice(cut))) + masker.end()
      assert.equal(out, 'before [masked:app/token] after', `cut at ${cut}`)
    }
  })

  test('a multibyte character split across chunks survives', () => {
    const masker = createMasker([{ name: 'k', value: 'secret-value-x' }])
    const bytes = Buffer.from('한글 ok')
    assert.equal(masker.push(bytes.subarray(0, 2)) + masker.push(bytes.subarray(2)) + masker.end(), '한글 ok')
  })

  test('values shorter than 8 characters are masked in plain form only', () => {
    const masker = createMasker([{ name: 'pin', value: '1234' }])
    const out = masker.push(`1234 ${Buffer.from('1234').toString('hex')}`) + masker.end()
    assert.equal(out, `[masked:pin] ${Buffer.from('1234').toString('hex')}`)
  })
})

describe('run through the agent', () => {
  beforeEach(setup)
  afterEach(async () => {
    await agent?.close()
    agent = undefined
  })

  test('[critical] a child that prints its variable returns the masked form, also across two output chunks', async () => {
    const script = [
      'const v = process.env.TOKEN',
      'process.stdout.write("whole=" + v + "\\n")',
      'process.stderr.write("b64=" + Buffer.from(v).toString("base64") + "\\n")',
      'process.stdout.write("split=" + v.slice(0, 5))',
      'setTimeout(() => process.stdout.write(v.slice(5) + "\\n"), 100)',
    ].join(';')
    const result = await run([NODE, '-e', script], { TOKEN: 'app/token' })
    assert.equal(result.exit_code, 0)
    assert.equal(result.stdout, 'whole=[masked:app/token]\nsplit=[masked:app/token]\n')
    assert.equal(result.stderr, 'b64=[masked:app/token]\n')
  })

  test('[critical] run with a deny key gets DENIED and starts no process', async () => {
    const marker = join(home, 'started')
    await assert.rejects(
      run([NODE, '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`], { V: 'deny/key' }),
      rejectsWith('DENIED'),
    )
    await new Promise((resolve) => setTimeout(resolve, 200))
    assert.equal(existsSync(marker), false)
  })

  test('[critical] the audit line for run holds the program and variable names, not the arguments or the value', async () => {
    await run([NODE, '-e', `console.log("argument-marker-${SECRET}")`, 'second-argument'], { TOKEN: 'app/token' })
    const line = readAudit().find((entry) => entry.op === 'run')
    assert.ok(line)
    assert.deepEqual({ program: line.program, env: line.env, keys: line.keys, ok: line.ok }, { program: NODE, env: ['TOKEN'], keys: ['app/token'], ok: true })
    const text = JSON.stringify(readAudit())
    for (const needle of ['argument-marker', 'second-argument', ...encodings(SECRET)]) assert.ok(!text.includes(needle), needle)
  })

  test('the child\'s exit code, cwd, environment and stdin pass through', async () => {
    const result = await run(
      [NODE, '-e', 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(process.cwd()===process.argv[1], process.env.PATH!==undefined, s);process.exit(7)})', home],
      {},
      { stdin: 'from stdin' },
    )
    assert.equal(result.exit_code, 7)
    assert.equal(result.stdout, 'true true from stdin\n')
  })

  test('a program that cannot be started is SPAWN_FAILED, and the timeout kills the child', async () => {
    await assert.rejects(run(['no-such-program-akbun'], {}), rejectsWith('SPAWN_FAILED'))
    const started = Date.now()
    await assert.rejects(run([NODE, '-e', 'setTimeout(()=>{}, 10000)'], {}, { timeout_ms: 300 }), rejectsWith('TIMEOUT'))
    assert.ok(Date.now() - started < 5000)
  })
})

describe('run exit codes through the CLI', () => {
  beforeEach(setup)
  afterEach(async () => {
    await agent?.close()
    agent = undefined
  })

  test('child code, 124, 125, 4 and 7; 3 once locked', async () => {
    assert.equal((await cliAsync(['run', '--env', 'T=app/token', '--', NODE, '-e', 'process.exit(9)'])).status, 9)
    assert.equal((await cliAsync(['run', '--timeout', '300ms', '--', NODE, '-e', 'setTimeout(()=>{},9000)'])).status, 124)
    assert.equal((await cliAsync(['run', '--', 'no-such-program-akbun'])).status, 125)
    assert.equal((await cliAsync(['run', '--env', 'T=deny/key', '--', NODE, '-e', '0'])).status, 4)
    assert.equal((await cliAsync(['run', '--env', 'T=missing/key', '--', NODE, '-e', '0'])).status, 7)
    await agent?.close()
    agent = undefined
    assert.equal((await cliAsync(['run', '--', NODE, '-e', '0'])).status, 3)
  })
})

test('[critical] the agent process prints nothing but its ready line', async () => {
  useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  const key = openVault(PASSWORD)
  await create(key, { name: 'app/token', value: SECRET })
  const child = spawn(NODE, [MAIN, 'agent'], { stdio: ['pipe', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { output += chunk })
  child.stdin.end(`${JSON.stringify({ data_key: key.toString('base64'), idle_ms: 60_000, absolute_ms: 60_000, actor: 'cli' })}\n`)
  while (!output.includes('ready\n')) await new Promise((resolve) => setTimeout(resolve, 50))
  await run([NODE, '-e', 'console.log(process.env.T)'], { T: 'app/token' }).catch(() => {})
  await agentRequest('get', { name: 'app/token' }, { actor: 'cli' }).catch(() => {})
  await agentRequest('get', { name: 'nope' }, { actor: 'cli' }).catch(() => {})
  await agentRequest('lock', {}, { actor: 'cli' })
  await new Promise((resolve) => child.on('exit', resolve))
  assert.equal(output, 'ready\n')
})
