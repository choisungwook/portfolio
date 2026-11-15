import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { insertProposal } from '../src/db/proposals.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

describe('proposal apply target', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup({ skillsDir: 'skills' })
  })
  test.afterEach(() => env.cleanup())

  const host = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })
  const apply = (id: number) => createApp({ db: env.db, config: env.config }, TOKEN)
    .request(`/api/proposals/${id}/apply`, { method: 'POST', headers: { ...host(), 'content-type': 'application/json' } })
  const proposal = (targetPath: string, diff = '\nfact\n') => insertProposal(env.db, {
    task_id: null, kind: 'memory', target_path: targetPath, diff,
  })

  test('[critical] a dangling symlink in memory/ is rejected and does not create the file it points to', async () => {
    const outsideDir = join(env.home, 'outside')
    mkdirSync(outsideDir)
    symlinkSync(join(outsideDir, 'missing.md'), join(env.home, 'memory', 'note.md'))
    const res = await apply(proposal('memory/note.md'))
    assert.equal(res.status, 400)
    assert.equal(existsSync(join(outsideDir, 'missing.md')), false)
  })

  test('a symlinked directory on the path is rejected', async () => {
    const outsideDir = join(env.home, 'outside')
    mkdirSync(outsideDir)
    symlinkSync(outsideDir, join(env.home, 'memory', 'linked'))
    assert.equal((await apply(proposal('memory/linked/a.md'))).status, 400)
    assert.equal(existsSync(join(outsideDir, 'a.md')), false)
  })

  test('a skill proposal creates its missing directory inside skillsDir', async () => {
    mkdirSync(join(env.home, 'skills'))
    const res = await apply(proposal('skills/my-skill/proposed-1700000000.md', '\n# my skill\n'))
    assert.equal(res.status, 200)
    assert.equal(readFileSync(join(env.home, 'skills', 'my-skill', 'proposed-1700000000.md'), 'utf8'), '\n# my skill\n')
  })

  test('a skill proposal writes beside an existing SKILL.md and never touches it', async () => {
    mkdirSync(join(env.home, 'skills', 'my-skill'), { recursive: true })
    writeFileSync(join(env.home, 'skills', 'my-skill', 'SKILL.md'), 'original\n')
    const res = await apply(proposal('skills/my-skill/proposed-1700000001.md', 'proposed text\n'))
    assert.equal(res.status, 200)
    assert.equal(readFileSync(join(env.home, 'skills', 'my-skill', 'proposed-1700000001.md'), 'utf8'), 'proposed text\n')
    assert.equal(readFileSync(join(env.home, 'skills', 'my-skill', 'SKILL.md'), 'utf8'), 'original\n')
  })

  test('[critical] a skill proposal targeting SKILL.md is rejected with 400 and writes nothing', async () => {
    mkdirSync(join(env.home, 'skills', 'my-skill'), { recursive: true })
    writeFileSync(join(env.home, 'skills', 'my-skill', 'SKILL.md'), 'original\n')
    assert.equal((await apply(proposal('skills/my-skill/SKILL.md', 'replaced\n'))).status, 400)
    assert.equal(readFileSync(join(env.home, 'skills', 'my-skill', 'SKILL.md'), 'utf8'), 'original\n')
  })

  test('a skill proposal whose name is not proposed-<digits>.md is rejected', async () => {
    assert.equal((await apply(proposal('skills/my-skill/notes.md'))).status, 400)
    assert.equal((await apply(proposal('skills/my-skill/proposed-x.md'))).status, 400)
  })

  test('[critical] a path outside both roots is rejected even when its directory exists', async () => {
    assert.equal((await apply(proposal('memory/../outside.md'))).status, 400)
    assert.equal((await apply(proposal('skills-extra/x.md'))).status, 400)
  })
})
