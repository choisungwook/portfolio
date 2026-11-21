import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import pkg from '../package.json' with { type: 'json' }
import { builtinSkillInfo, installBuiltinSkill, manualText } from '../src/team/builtin-skill.ts'
import { registerEntry } from '../src/db/bot-registry.ts'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import { getWorkflow } from '../src/db/workflows.ts'
import { seedTestBots, setup } from './helpers.ts'
import { botGate } from '../src/team/bot-gate.ts'
import { getAgent } from '../src/db/team.ts'

test('the built-in taskq skill carries the running version, the home and this version\'s manual', () => {
  const env = setup()
  try {
    const info = installBuiltinSkill(env.config)
    assert.equal(info.version, pkg.version)
    assert.ok(info.skill_md.includes(`akbun-taskq ${pkg.version}`))
    assert.ok(info.skill_md.includes(env.home))
    assert.doesNotMatch(info.skill_md, /\{\{/, 'every placeholder is filled')
    assert.equal(readFileSync(info.manual, 'utf8'), manualText())
    assert.equal(builtinSkillInfo(env.config).path, join(env.home, 'builtin-skills', 'taskq'))
  } finally {
    env.cleanup()
  }
})

test('the registry refuses a skill named taskq', () => {
  const env = setup()
  try {
    installBuiltinSkill(env.config)
    assert.throws(() => registerEntry(env.db, env.home, 'skill', join(env.home, 'builtin-skills', 'taskq')), /built-in/)
  } finally {
    env.cleanup()
  }
})

test('a bot makes and changes a workflow with its tools, and is told the version it runs in', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    const tools = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) })
    const call = (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args)
    assert.equal((await call('taskq_info', {}) as { version: string }).version, pkg.version)
    const steps = [{ id: 'build', name: 'Build', kind: 'do', instructions: 'Build it', needs: [] }, { id: 'check', name: 'Check', kind: 'check', instructions: 'Tests pass', needs: ['build'] }]
    const made = await call('create_workflow', { name: 'release', definition: { steps } }) as { id: string; steps: string[] }
    assert.deepEqual(made.steps, ['build', 'check'])
    await assert.rejects(async () => call('create_workflow', { name: 'release', definition: { steps } }), /exists/)
    await assert.rejects(async () => call('create_workflow', { name: 'bad', definition: { steps: [{ id: 'Bad Id', name: 'x', kind: 'do', instructions: 'x', needs: [] }] } }), /lowercase/)
    await call('update_workflow', { workflow: 'release', definition: { steps: steps.slice(0, 1) } })
    assert.deepEqual(getWorkflow(env.db, made.id)?.definition.steps.map((s) => s.id), ['build'])
  } finally {
    env.cleanup()
  }
})

test('a bot reads the built-in skill and its manual but cannot write them', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    const info = installBuiltinSkill(env.config)
    const coder = getAgent(env.db, 'coder')!
    assert.notEqual(botGate(env.config, coder, env.home, 'Read', { file_path: info.manual }).action, 'stop')
    assert.equal(botGate(env.config, coder, env.home, 'Write', { file_path: join(info.path, 'SKILL.md'), content: 'x' }).action, 'stop')
  } finally {
    env.cleanup()
  }
})
