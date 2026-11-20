import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { openDb } from '../src/db/open.ts'
import { getAgent, listMessages, postMessage, updateAgent } from '../src/db/team.ts'
import { limits } from '../src/db/settings.ts'
import { appearance } from '../src/db/meta.ts'
import { createTeamHub } from '../src/team/hub.ts'
import type { TeamBackend } from '../src/team/types.ts'
import { teamChanged } from '../src/wake.ts'
import { getTask, insertTask } from '../src/db/tasks.ts'
import { startBotTask } from '../src/team/bot-work.ts'
import { seedTestBots, setup, waitFor, TOKEN, type TestEnv } from './helpers.ts'

describe('files, search, memory, limits and settings', () => {
  let env: TestEnv
  const opened: string[] = []
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    opened.length = 0
  })
  test.afterEach(() => env.cleanup())

  const app = (bots?: { cancel(name: string): boolean; busy(): string[] }) =>
    createApp({ db: env.db, config: env.config, bots, opener: (path) => opened.push(path) }, TOKEN)
  const headers = { 'x-taskq-token': TOKEN, 'content-type': 'application/json' }
  const call = (method: string, path: string, body?: unknown, bots?: { cancel(name: string): boolean; busy(): string[] }) =>
    app(bots).request(`/api${path}`, { method, headers: { ...headers, host: `127.0.0.1:${env.config.port}` }, body: body === undefined ? undefined : JSON.stringify(body) })

  test('an uploaded file lands in the shared folder, is listed and downloads; paths outside are refused', async () => {
    const res = await call('POST', '/files', { name: '보고서 v1.md', data: Buffer.from('# hi').toString('base64') })
    assert.equal(res.status, 201)
    const { path } = await res.json() as { path: string }
    assert.match(path, /^attachments\/\d{4}-\d{2}-\d{2}\/[0-9a-f]{8}-보고서 v1\.md$/)
    assert.equal(readFileSync(join(env.home, 'shared', path), 'utf8'), '# hi')
    const list = await (await call('GET', `/shared?dir=${encodeURIComponent(path.split('/').slice(0, 2).join('/'))}`)).json() as { entries: { name: string }[] }
    assert.equal(list.entries.length, 1)
    assert.equal(await (await call('GET', `/shared/file?path=${encodeURIComponent(path)}`)).text(), '# hi')
    assert.equal((await call('GET', '/shared/file?path=../data/taskq.db')).status, 400)
    assert.equal((await call('GET', '/shared?dir=../..')).status, 400)
    assert.equal((await call('POST', '/files', { name: 'x', data: '@@notbase64' })).status, 400)
  })

  test('a message can carry attachments: uploads and existing shared files, nothing outside', async () => {
    const { path } = await (await call('POST', '/files', { name: 'a.txt', data: Buffer.from('a').toString('base64') })).json() as { path: string }
    const shared = join(env.home, 'shared', 'outputs', 'coder')
    mkdirSync(shared, { recursive: true })
    writeFileSync(join(shared, 'report.md'), '# r')
    assert.equal((await call('POST', '/bots/messages', { to: 'coder', body: 'see @outputs/coder/report.md', attachments: ['outputs/coder/report.md'] })).status, 201, 'a file picked with @')
    assert.equal((await call('POST', '/bots/messages', { to: 'coder', body: 'x', attachments: ['outputs/coder/missing.md'] })).status, 400)
    assert.equal((await call('POST', '/bots/messages', { to: 'coder', body: 'x', attachments: ['outputs/coder'] })).status, 400, 'a folder is not a file')
    assert.equal((await call('POST', '/bots/messages', { to: 'coder', body: 'look', attachments: [path] })).status, 201)
    assert.equal((await call('POST', '/bots/messages', { to: 'coder', body: 'x', attachments: ['../etc/passwd'] })).status, 400)
    const stored = env.db.prepare('SELECT attachments FROM team_messages ORDER BY id DESC LIMIT 1').get()
    assert.deepEqual(JSON.parse(String(stored?.attachments)), [path])
  })

  test('[critical] searching every conversation finds Korean stems, two-letter words and English, newest first', async () => {
    postMessage(env.db, { sender: 'user', recipient: 'coder', body: '배포 스크립트의 검색률이 낮다' })
    postMessage(env.db, { sender: 'coder', recipient: 'user', body: 'PR opened for the export job' })
    postMessage(env.db, { sender: 'planner', recipient: 'taskq', body: 'prompts are ready' })
    const find = async (q: string) => (await (await call('GET', `/bots/search?q=${encodeURIComponent(q)}`)).json() as { sender: string }[]).map((h) => h.sender)
    assert.deepEqual(await find('검색률'), ['user'])
    assert.deepEqual(await find('배포'), ['user'])
    assert.deepEqual(await find('PR export'), ['coder'])
    assert.deepEqual(await find('pr'), ['coder'])
    assert.deepEqual(await find('nothing-like-this'), [])
  })

  test('bot memory is read and written by the user and capped', async () => {
    assert.equal((await call('PUT', '/bots/coder/memory', { memory: 'prefers pnpm' })).status, 200)
    assert.equal(getAgent(env.db, 'coder')?.memory, 'prefers pnpm')
    assert.equal((await call('PUT', '/bots/coder/memory', { memory: 'x'.repeat(20_000) })).status, 400)
    assert.deepEqual(await (await call('GET', '/bots/coder/memory')).json(), { memory: 'prefers pnpm', limit: 16000 })
  })

  test('[critical] limits, appearance, bots and memory survive closing and reopening the database', async () => {
    assert.equal((await call('POST', '/settings/limits', { max_concurrent_turns: 3, bot_turns_per_hour: 7 })).status, 200)
    assert.equal((await call('POST', '/settings/limits', { max_concurrent_turns: 0 })).status, 400)
    assert.equal((await call('POST', '/settings/appearance', { language: 'en', theme: 'dark' })).status, 200)
    assert.equal((await call('POST', '/settings/appearance', { theme: 'blue' })).status, 400)
    await call('PUT', '/bots/coder', { sandbox: true, hourly_turns: 3 })
    await call('PUT', '/bots/coder/memory', { memory: 'remember me' })
    // A second connection to the same file is what a restarted (or upgraded) taskq sees.
    const reopened = openDb(env.home)
    try {
      assert.equal(limits(reopened, env.config).max_concurrent_turns, 3)
      assert.equal(limits(reopened, env.config).bot_turns_per_hour, 7)
      assert.deepEqual({ ...appearance(reopened) }, { font_family: 'system', font_size: 15, language: 'en', theme: 'dark' })
      const coder = getAgent(reopened, 'coder')!
      assert.equal(coder.sandbox, true)
      assert.equal(coder.hourly_turns, 3)
      assert.equal(coder.memory, 'remember me')
    } finally {
      reopened.close()
    }
  })

  test('open-folder opens only folders taskq names, and returns the path', async () => {
    const res = await call('POST', '/open-folder', { target: 'shared' })
    assert.equal(res.status, 200)
    assert.deepEqual(opened, [join(env.home, 'shared')])
    assert.equal((await call('POST', '/open-folder', { target: '/etc' })).status, 400)
  })

  test('session transcripts are named per runtime, and a bot opens where its own runtime keeps them', async () => {
    const settings = await (await call('GET', '/settings')).json() as { paths: { sessions: Record<string, { path: string; exists: boolean }> } }
    assert.deepEqual(Object.keys(settings.paths.sessions), ['claude', 'codex', 'kiro'])
    assert.match(settings.paths.sessions.codex.path, /sessions$/)
    assert.equal((await call('POST', '/open-folder', { target: 'sessions', runtime: 'gemini' })).status, 400)
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, sdk: 'openai', provider: 'bedrock' })
    mkdirSync(join(env.home, 'team', 'coder'), { recursive: true })
    assert.equal((await call('POST', '/open-folder', { target: 'bot', bot: 'coder' })).status, 200)
    assert.deepEqual(opened, [join(env.home, 'team', 'coder')])
    updateAgent(env.db, 'coder', { ...getAgent(env.db, 'coder')!, provider: 'api' })
    const res = await call('POST', '/open-folder', { target: 'bot', bot: 'coder' })
    assert.equal(res.status, 404)
    assert.match(((await res.json()) as { error: string }).error, /no local transcript/)
  })

  test('cancel stops a working bot; its running task becomes cancelled and the turn shows as cancelled', async () => {
    const task = insertTask(env.db, { type: 'research', status: 'ready', owner: 'coder', data: { intent: 'long work' } })
    let started!: () => void
    const begun = new Promise<void>((resolve) => { started = resolve })
    const backend: TeamBackend = {
      runTurn: (_config, request) => new Promise((resolve) => {
        startBotTask(env.db, 'coder', task.id, null)
        started()
        request.signal.addEventListener('abort', () => resolve({ outcome: 'failed', error: 'aborted' }))
      }),
    }
    const hub = createTeamHub({ db: env.db, config: env.config, backend })
    await hub.start()
    postMessage(env.db, { sender: 'user', recipient: 'coder', body: 'go' })
    teamChanged.notify()
    await begun
    assert.equal((await call('POST', '/bots/coder/cancel', undefined, hub)).status, 200)
    await waitFor(() => getTask(env.db, task.id)?.status === 'cancelled')
    const turn = env.db.prepare('SELECT outcome FROM team_turns ORDER BY id DESC LIMIT 1').get()
    assert.equal(turn?.outcome, 'cancelled')
    assert.ok(listMessages(env.db, { agent: 'coder', limit: 5 }).some((m) => m.body === 'The user cancelled this turn.'))
    assert.equal((await call('POST', '/bots/coder/cancel', undefined, hub)).status, 409)
    await hub.stop()
  })

  test('updating a git-backed skill pulls it and reloads every bot that uses it', async () => {
    const origin = join(env.home, 'origin-skill')
    mkdirSync(origin, { recursive: true })
    writeFileSync(join(origin, 'SKILL.md'), '---\nname: notes\ndescription: v1\n---\nv1\n')
    const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-C', cwd, '-c', 'user.email=t@example.com', '-c', 'user.name=t', ...args], { stdio: 'pipe' })
    git(origin, 'init', '-q')
    git(origin, 'add', '.')
    git(origin, 'commit', '-qm', 'v1')
    const clone = join(env.home, 'skills', 'notes')
    mkdirSync(join(env.home, 'skills'), { recursive: true })
    execFileSync('git', ['clone', '-q', origin, clone])
    assert.equal((await call('POST', '/bot-skills', { path: clone })).status, 201)
    await call('PUT', '/bots/coder', { skills: ['notes'] })
    writeFileSync(join(origin, 'SKILL.md'), '---\nname: notes\ndescription: v2\n---\nv2\n')
    git(origin, 'commit', '-qam', 'v2')
    const result = await (await call('POST', '/bot-skills/notes/update')).json() as { method: string; reloaded: string[] }
    assert.equal(result.method, 'git')
    assert.deepEqual(result.reloaded, ['coder'])
    const copy = join(env.home, 'bot-plugins', 'coder', 'skills-plugin', 'skills', 'notes', 'SKILL.md')
    assert.match(readFileSync(copy, 'utf8'), /v2/)
    assert.ok(existsSync(copy))
  })
})
