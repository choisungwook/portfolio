import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, resolveConfig, type Config } from '../src/config.ts'
import { AGENT_NAMES, agentFor } from '../src/agents/index.ts'

const home = mkdtempSync(join(tmpdir(), 'agents-test-'))
after(() => rmSync(home, { recursive: true, force: true }))

describe('agent registry', () => {
  test('the default config runs the claude backend', () => {
    const config = resolveConfig(home)
    assert.equal(config.agent, 'claude')
    assert.equal(agentFor(config).name, 'claude')
  })

  test('every registered backend implements the whole interface', () => {
    for (const name of AGENT_NAMES) {
      const backend = agentFor({ ...resolveConfig(home), agent: name })
      assert.equal(backend.name, name)
      for (const method of ['createWorker', 'preflight', 'ask'] as const) assert.equal(typeof backend[method], 'function')
    }
  })

  test('an unknown agent is refused by the registry and by the config loader', () => {
    assert.throws(() => agentFor({ ...resolveConfig(home), agent: 'other' } as unknown as Config), /unknown agent: other/)
    writeFileSync(join(home, 'taskq.config.json'), JSON.stringify({ agent: 'other' }))
    assert.throws(() => loadConfig({ TASKQ_HOME: home }), /unknown agent: other/)
  })
})
