import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { add } from '../src/cli/commands.ts'
import { skills } from '../src/cli/skills.ts'
import { addTask, setup, type TestEnv } from './helpers.ts'

// Captures console.log output of a call.
function capture(fn: () => void): string[] {
  const lines: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  try {
    fn()
  } finally {
    console.log = original
  }
  return lines
}

describe('taskq skills', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  function skillFolder(name: string): string {
    const dir = join(env.home, 'skills-src', name)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Example skill\n---\n`)
    return dir
  }

  test('add registers a skill, list shows it, and remove unregisters it', () => {
    const dir = skillFolder('example-readonly')
    const added = capture(() => skills({ config: env.config, db: env.db }, ['add', dir]))
    assert.match(added[0], /^added example-readonly  /)
    const listed = capture(() => skills({ config: env.config, db: env.db }, ['list']))
    assert.match(listed[0], /^example-readonly  ok  .*Example skill$/)
    capture(() => skills({ config: env.config, db: env.db }, ['remove', 'example-readonly']))
    assert.deepEqual(capture(() => skills({ config: env.config, db: env.db }, ['list'])), [])
  })

  test('add and remove fail with the same messages as the API', () => {
    const ctx = { config: env.config, db: env.db }
    assert.throws(() => skills(ctx, ['add', join(env.home, 'missing')]), /does not exist/)
    assert.throws(() => skills(ctx, ['remove', 'nope']), /no access skill named nope/)
    const dir = skillFolder('example-sandbox')
    skills(ctx, ['add', dir])
    assert.throws(() => skills(ctx, ['add', dir]), /already registered/)
    addTask(env.db, { status: 'draft', data: { intent: 'x', access_skill: 'example-sandbox' } })
    assert.throws(() => skills(ctx, ['remove', 'example-sandbox']), /used by open tasks/)
  })

  test('discover marks the registered skills', () => {
    const ctx = { config: env.config, db: env.db }
    const claudeDir = join(env.home, 'claude-config')
    process.env.CLAUDE_CONFIG_DIR = claudeDir
    try {
      const folder = join(claudeDir, 'skills', 'example-readonly')
      mkdirSync(folder, { recursive: true })
      writeFileSync(join(folder, 'SKILL.md'), '---\nname: example-readonly\n---\n')
      assert.deepEqual(capture(() => skills(ctx, ['discover'])).map((line) => line.split('  ')[0]), ['available'])
      skills(ctx, ['add', folder])
      assert.deepEqual(capture(() => skills(ctx, ['discover'])).map((line) => line.split('  ')[0]), ['registered'])
    } finally {
      delete process.env.CLAUDE_CONFIG_DIR
    }
  })

  test('an unknown subcommand or a missing argument prints usage', () => {
    const ctx = { config: env.config, db: env.db }
    assert.throws(() => skills(ctx, []), /usage: taskq skills/)
    assert.throws(() => skills(ctx, ['add']), /usage: taskq skills/)
    assert.throws(() => skills(ctx, ['discover', 'extra']), /usage: taskq skills/)
  })

  test('task add rejects an unregistered access skill and accepts a registered one', () => {
    const args = ['--type', 'research', '--intent', 'x', '--access-skill', 'example-readonly', '--draft']
    assert.throws(() => add({ config: env.config, db: env.db }, args), /register it in Settings or with taskq skills add/)
    skills({ config: env.config, db: env.db }, ['add', skillFolder('example-readonly')])
    capture(() => add({ config: env.config, db: env.db }, args))
  })
})
