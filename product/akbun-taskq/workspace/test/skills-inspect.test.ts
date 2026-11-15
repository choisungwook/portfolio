import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFrontmatter } from '../src/skills/frontmatter.ts'
import { inspectSkill, skillFileOk, SkillError } from '../src/skills/inspect.ts'

const base = mkdtempSync(join(tmpdir(), 'skills-inspect-'))
after(() => rmSync(base, { recursive: true, force: true }))
const home = join(base, 'home')
mkdirSync(join(home, 'data'), { recursive: true })
mkdirSync(join(home, 'outputs'), { recursive: true })

// A skill folder with the given SKILL.md text. Returns its path.
function skill(name: string, text: string | null): string {
  const dir = join(base, 'skills', name)
  mkdirSync(dir, { recursive: true })
  if (text !== null) writeFileSync(join(dir, 'SKILL.md'), text)
  return dir
}

function rejects(path: string, status: number, pattern: RegExp): void {
  assert.throws(() => inspectSkill(home, path), (error: unknown) => {
    assert.ok(error instanceof SkillError)
    assert.equal(error.status, status)
    assert.match(error.message, pattern)
    return true
  })
}

describe('frontmatter reader', () => {
  test('reads top-level keys, strips quotes and ignores nested or multi-line values', () => {
    const meta = readFrontmatter('---\nname: "example-readonly"\ndescription: \'Reads: things\'\nmeta:\n  nested: x\n---\nbody\n')
    assert.equal(meta.name, 'example-readonly')
    assert.equal(meta.description, 'Reads: things')
    assert.equal(meta.nested, undefined)
  })

  test('no frontmatter, or no closing line, gives no keys', () => {
    assert.deepEqual({ ...readFrontmatter('name: x\n') }, {})
    assert.deepEqual({ ...readFrontmatter('---\nname: x\n') }, {})
  })
})

describe('skill folder inspection', () => {
  test('name and description come from the frontmatter; the description is one line of at most 200 characters', () => {
    const long = 'word '.repeat(80)
    const dir = skill('front-named', `---\nname: Example-Readonly\ndescription: ${long}\n---\n`)
    const info = inspectSkill(home, dir)
    assert.equal(info.name, 'example-readonly')
    assert.equal(info.description.length, 200)
    assert.ok(!/\s{2}|\n/.test(info.description))
    assert.equal(info.path, join(realpathSync(base), 'skills', 'front-named'))
  })

  test('without a name field the directory basename is the name', () => {
    assert.equal(inspectSkill(home, skill('basename-only', '# no frontmatter\n')).name, 'basename-only')
  })

  test('a name outside the pattern is rejected', () => {
    rejects(skill('bad_name', 'x'), 400, /must match/)
    rejects(skill('-leading', 'x'), 400, /must match/)
  })

  test('[critical] a relative path is rejected', () => {
    rejects('skills/example', 400, /absolute/)
  })

  test('a missing directory, a file path and a folder without SKILL.md are rejected', () => {
    rejects(join(base, 'no-such-dir'), 400, /does not exist/)
    writeFileSync(join(base, 'plain.txt'), 'x')
    rejects(join(base, 'plain.txt'), 400, /must be a directory/)
    rejects(skill('no-file', null), 400, /SKILL\.md not found/)
  })

  test('a SKILL.md that is a symlink, or larger than 200 kB, is rejected', () => {
    const dir = skill('linked', null)
    writeFileSync(join(base, 'real.md'), 'x')
    symlinkSync(join(base, 'real.md'), join(dir, 'SKILL.md'))
    rejects(dir, 400, /regular file/)
    rejects(skill('huge', 'x'.repeat(200_001)), 400, /larger than 200 kB/)
  })

  test('[critical] a folder inside the data directory or outputs is rejected, even through a symlink', () => {
    const inData = join(home, 'data', 'inside')
    mkdirSync(inData)
    writeFileSync(join(inData, 'SKILL.md'), 'x')
    rejects(inData, 400, /data directory or outputs/)
    const link = join(base, 'link-to-outputs')
    symlinkSync(join(home, 'outputs'), link)
    writeFileSync(join(home, 'outputs', 'SKILL.md'), 'x')
    rejects(link, 400, /data directory or outputs/)
  })

  test('skillFileOk is false once SKILL.md is removed', () => {
    const dir = skill('removable', 'x')
    assert.equal(skillFileOk(dir), true)
    rmSync(join(dir, 'SKILL.md'))
    assert.equal(skillFileOk(dir), false)
  })
})
