import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONFIG_KEYS, configView, registerSkill, removeSkill, resolveAccessSkill, skillRows } from '../src/skills/registry.ts'
import { SkillError } from '../src/skills/inspect.ts'
import { addTask, setup, statusOf, type TestEnv } from './helpers.ts'
import { setStatus } from '../src/db/tasks.ts'

const base = mkdtempSync(join(tmpdir(), 'skills-registry-'))
const real = realpathSync(base)
after(() => rmSync(base, { recursive: true, force: true }))

function skill(name: string, description = 'Example'): string {
  const dir = join(base, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`)
  return dir
}

function expectStatus(fn: () => unknown, status: number, pattern: RegExp): void {
  assert.throws(fn, (error: unknown) => error instanceof SkillError && error.status === status && pattern.test(error.message))
}

describe('access skill registry', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  test('registering stores the realpath, the name and the description', () => {
    const dir = skill('example-readonly', 'Reads the example account')
    const row = registerSkill(env.db, env.home, dir)
    assert.equal(row.name, 'example-readonly')
    assert.equal(row.description, 'Reads the example account')
    assert.equal(row.path, join(real, 'example-readonly'))
    assert.ok(row.added_at > 0)
  })

  test('a second registration under the same name is a conflict and changes nothing', () => {
    const dir = skill('example-sandbox')
    registerSkill(env.db, env.home, dir)
    expectStatus(() => registerSkill(env.db, env.home, dir), 409, /already registered/)
    assert.equal(skillRows(env.db).length, 1)
  })

  test('removing an unknown name is 404', () => {
    expectStatus(() => removeSkill(env.db, 'nope'), 404, /no access skill/)
  })

  test('removing a skill that an open task references is 409 and lists the task ids', () => {
    const dir = skill('example-readonly')
    registerSkill(env.db, env.home, dir)
    const ids = [1, 2].map((i) => addTask(env.db, { status: 'draft', data: { intent: `t${i}`, access_skill: 'example-readonly' } }).id)
    expectStatus(() => removeSkill(env.db, 'example-readonly'), 409, /used by open tasks/)
    for (const id of ids) expectStatus(() => removeSkill(env.db, 'example-readonly'), 409, new RegExp(id))
    assert.equal(skillRows(env.db).length, 1)
  })

  test('a task that is done no longer blocks removal, and removal never touches the files', () => {
    const dir = skill('example-readonly')
    registerSkill(env.db, env.home, dir)
    const task = addTask(env.db, { status: 'done', data: { intent: 'finished', access_skill: 'example-readonly' } })
    setStatus(env.db, task.id, 'done')
    removeSkill(env.db, 'example-readonly')
    assert.equal(skillRows(env.db).length, 0)
    assert.equal(statusOf(env.db, task.id), 'done')
    assert.ok(existsSync(join(dir, 'SKILL.md')))
  })

  test('ok turns false when SKILL.md disappears, and the run-time check names the missing path', () => {
    const dir = skill('example-readonly')
    registerSkill(env.db, env.home, dir)
    assert.equal(skillRows(env.db)[0].ok, true)
    rmSync(join(dir, 'SKILL.md'))
    assert.equal(skillRows(env.db)[0].ok, false)
    assert.deepEqual(resolveAccessSkill(env.db, 'example-readonly'), {
      missing: `access skill example-readonly is missing at ${join(real, 'example-readonly')}`,
    })
    assert.deepEqual(resolveAccessSkill(env.db, undefined), {})
    assert.match(resolveAccessSkill(env.db, 'ghost').missing ?? '', /not registered/)
  })

  test('the config view has exactly the listed keys', () => {
    const view = configView(env.config)
    assert.deepEqual(Object.keys(view).sort(), [...CONFIG_KEYS].sort())
    assert.equal(view.port, env.config.port)
    assert.equal(view.skillsDir, null)
  })
})
