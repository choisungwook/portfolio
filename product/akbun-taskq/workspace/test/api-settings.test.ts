import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { CONFIG_KEYS } from '../src/skills/registry.ts'
import { setup, TOKEN, type TestEnv } from './helpers.ts'

const JSON_TYPE = { 'content-type': 'application/json' }

describe('settings and access skill api', () => {
  let env: TestEnv
  let claudeDir: string
  let previous: string | undefined
  test.beforeEach(() => {
    env = setup()
    claudeDir = mkdtempSync(join(tmpdir(), 'api-settings-claude-'))
    previous = process.env.CLAUDE_CONFIG_DIR
    process.env.CLAUDE_CONFIG_DIR = claudeDir
  })
  test.afterEach(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = previous
    rmSync(claudeDir, { recursive: true, force: true })
    env.cleanup()
  })

  const app = () => createApp({ db: env.db, config: env.config }, TOKEN)
  const host = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN })
  const write = (body: unknown) => ({ method: 'POST', headers: { ...host(), ...JSON_TYPE }, body: JSON.stringify(body) })

  function skill(dir: string, name: string, description = 'Example'): string {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n`)
    return dir
  }

  test('GET /settings returns the listed config keys, the home and the registered skills, and no token', async () => {
    const res = await app().request('/api/settings', { headers: host() })
    assert.equal(res.status, 200)
    const body = await res.json() as { config: Record<string, unknown>; home: string; access_skills: unknown[] }
    assert.deepEqual(Object.keys(body.config).sort(), [...CONFIG_KEYS].sort())
    assert.equal(body.home, env.home)
    assert.equal((body as { db_path?: string }).db_path, join(env.home, 'data', 'taskq.db'))
    assert.deepEqual(body.access_skills, [])
    assert.ok(!JSON.stringify(body).includes(TOKEN))
  })

  test('POST /access-skills registers, GET reports ok, a duplicate is 409 and bad paths are 400', async () => {
    const dir = skill(join(claudeDir, 'skills', 'example-readonly'), 'example-readonly', 'Reads the example account')
    const created = await app().request('/api/access-skills', write({ path: dir }))
    assert.equal(created.status, 201)
    const row = await created.json() as { name: string; path: string; description: string; added_at: number }
    assert.equal(row.name, 'example-readonly')
    assert.equal(row.description, 'Reads the example account')
    assert.equal(typeof row.added_at, 'number')

    const settings = await (await app().request('/api/settings', { headers: host() })).json() as { access_skills: { ok: boolean }[] }
    assert.equal(settings.access_skills[0].ok, true)

    const duplicate = await app().request('/api/access-skills', write({ path: dir }))
    assert.equal(duplicate.status, 409)

    const bad = async (body: unknown) => (await app().request('/api/access-skills', write(body))).status
    assert.equal(await bad({ path: 'skills/relative' }), 400)
    assert.equal(await bad({}), 400)
    assert.equal(await bad({ path: join(claudeDir, 'no-such-folder') }), 400)
    mkdirSync(join(claudeDir, 'empty-folder'))
    assert.equal(await bad({ path: join(claudeDir, 'empty-folder') }), 400)
    assert.equal(await bad({ path: skill(join(env.home, 'data', 'inside'), 'inside') }), 400)
  })

  test('GET /skills/discover lists found skills and marks the registered ones', async () => {
    const root = join(claudeDir, 'skills')
    skill(join(root, 'example-readonly'), 'example-readonly')
    skill(join(root, 'example-sandbox'), 'example-sandbox')
    await app().request('/api/access-skills', write({ path: join(root, 'example-sandbox') }))
    const found = await (await app().request('/api/skills/discover', { headers: host() })).json() as { name: string; registered: boolean }[]
    assert.deepEqual(found.map((s) => [s.name, s.registered]), [['example-readonly', false], ['example-sandbox', true]])
  })

  test('DELETE needs the token and a JSON content type, is 404 for an unknown name, 409 while a task uses it, and 204 otherwise', async () => {
    const dir = skill(join(claudeDir, 'skills', 'example-readonly'), 'example-readonly')
    await app().request('/api/access-skills', write({ path: dir }))
    const del = (headers: Record<string, string>) => app().request('/api/access-skills/example-readonly', { method: 'DELETE', headers, body: '{}' })
    assert.equal((await del({ host: host().host, ...JSON_TYPE })).status, 401)
    assert.equal((await del({ ...host(), 'content-type': 'text/plain' })).status, 415)
    assert.equal((await app().request('/api/access-skills/ghost', { method: 'DELETE', headers: { ...host(), ...JSON_TYPE }, body: '{}' })).status, 404)

    const task = await (await app().request('/api/tasks', write({ type: 'research', intent: 'x', access_skill: 'example-readonly' }))).json() as { id: string }
    const blocked = await app().request('/api/access-skills/example-readonly', { method: 'DELETE', headers: { ...host(), ...JSON_TYPE }, body: '{}' })
    assert.equal(blocked.status, 409)
    assert.match(((await blocked.json()) as { error: string }).error, new RegExp(task.id))

    await app().request(`/api/tasks/${task.id}`, { method: 'PATCH', headers: { ...host(), ...JSON_TYPE }, body: JSON.stringify({ access_skill: null }) })
    const ok = await app().request('/api/access-skills/example-readonly', { method: 'DELETE', headers: { ...host(), ...JSON_TYPE }, body: '{}' })
    assert.equal(ok.status, 204)
    assert.equal(existsSync(join(dir, 'SKILL.md')), true, 'the skill files are never touched')
  })

  test('a task names only a registered access skill, on create and on patch', async () => {
    const dir = skill(join(claudeDir, 'skills', 'example-readonly'), 'example-readonly')
    const unknown = await app().request('/api/tasks', write({ type: 'research', intent: 'x', access_skill: 'example-readonly' }))
    assert.equal(unknown.status, 400)
    assert.match(((await unknown.json()) as { error: string }).error, /taskq skills add/)
    await app().request('/api/access-skills', write({ path: dir }))
    const created = await app().request('/api/tasks', write({ type: 'research', intent: 'x', access_skill: 'example-readonly' }))
    assert.equal(created.status, 201)
    const id = ((await created.json()) as { id: string }).id
    const patch = await app().request(`/api/tasks/${id}`, { method: 'PATCH', headers: { ...host(), ...JSON_TYPE }, body: JSON.stringify({ access_skill: 'example-sandbox' }) })
    assert.equal(patch.status, 400)
  })

  test('a skill whose SKILL.md is removed shows ok false', async () => {
    const dir = skill(join(claudeDir, 'skills', 'example-readonly'), 'example-readonly')
    await app().request('/api/access-skills', write({ path: dir }))
    rmSync(join(dir, 'SKILL.md'))
    const settings = await (await app().request('/api/settings', { headers: host() })).json() as { access_skills: { ok: boolean }[] }
    assert.equal(settings.access_skills[0].ok, false)
  })
})
