import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { DISCOVER_CAP, discoverSkills, skillRoots } from '../src/skills/discover.ts'
import { registerSkill } from '../src/skills/registry.ts'
import { resolveConfig } from '../src/config.ts'
import { setup, type TestEnv } from './helpers.ts'

const base = mkdtempSync(join(tmpdir(), 'skills-discover-'))
const real = realpathSync(base)
after(() => rmSync(base, { recursive: true, force: true }))

function skill(root: string, name: string, description = 'd'): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`)
  return dir
}

describe('skill discovery', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  test('roots come from CLAUDE_CONFIG_DIR, or ~/.claude, plus the configured skillsDir', () => {
    const config = resolveConfig(env.home, { skillsDir: 'extra' })
    assert.deepEqual(skillRoots(config, { CLAUDE_CONFIG_DIR: '/cfg' }), ['/cfg/skills', join(env.home, 'extra')])
    assert.deepEqual(skillRoots(resolveConfig(env.home), {}), [join(homedir(), '.claude', 'skills')])
  })

  test('finds valid skills one level deep, skips invalid entries, and flags registered ones', () => {
    const root = join(base, 'found')
    mkdirSync(root, { recursive: true })
    skill(root, 'example-readonly', 'Reads')
    const sandbox = skill(root, 'example-sandbox')
    mkdirSync(join(root, 'no-skill-file'))
    writeFileSync(join(root, 'stray.txt'), 'x')
    mkdirSync(join(root, 'Bad_Name'))
    writeFileSync(join(root, 'Bad_Name', 'SKILL.md'), 'x')
    registerSkill(env.db, env.home, sandbox)
    const found = discoverSkills(env.db, env.config, [root])
    assert.deepEqual(found.map((s) => [s.name, s.description, s.registered]), [
      ['example-readonly', 'Reads', false],
      ['example-sandbox', 'd', true],
    ])
  })

  test('a symlinked skill folder is judged by its realpath, and a link to a non-skill is skipped', () => {
    skill(join(base, 'elsewhere'), 'outside-skill')
    const root = join(base, 'linked')
    mkdirSync(root, { recursive: true })
    symlinkSync(join(base, 'elsewhere', 'outside-skill'), join(root, 'linked-skill'))
    mkdirSync(join(base, 'empty-target'))
    symlinkSync(join(base, 'empty-target'), join(root, 'dead-link'))
    const found = discoverSkills(env.db, env.config, [root])
    assert.deepEqual(found.map((s) => s.name), ['outside-skill'])
    assert.equal(found[0].path, join(real, 'elsewhere', 'outside-skill'))
  })

  test('the same skill under two roots is listed once, and results stop at the cap', () => {
    const root = join(base, 'many')
    mkdirSync(root, { recursive: true })
    for (let i = 0; i < DISCOVER_CAP + 5; i += 1) skill(root, `skill-${String(i).padStart(3, '0')}`)
    assert.equal(discoverSkills(env.db, env.config, [root]).length, DISCOVER_CAP)
    assert.equal(discoverSkills(env.db, env.config, [root, root]).length, DISCOVER_CAP)
  })

  test('a missing root is ignored', () => {
    assert.deepEqual(discoverSkills(env.db, env.config, [join(base, 'absent')]), [])
  })
})
