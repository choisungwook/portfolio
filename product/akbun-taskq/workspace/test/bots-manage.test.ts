import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { getAgent, listMessages } from '../src/db/team.ts'
import { getTask, insertTask } from '../src/db/tasks.ts'
import { setQueueAutorun } from '../src/db/meta.ts'
import { blockedBy, botGate } from '../src/team/bot-gate.ts'
import { finishBotTask, recoverBotTasks, releaseBotTasks, startBotTask } from '../src/team/bot-work.ts'
import { pluginPaths, reloadAll, skillsPluginDir } from '../src/team/bot-plugin.ts'
import { symlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'
import { createRunner } from '../src/runner/runner.ts'
import { fakeWorker, result, seedTestBots, setup, sleep, statusOf, waitFor, TOKEN, type TestEnv } from './helpers.ts'

describe('bot management api', () => {
  let env: TestEnv
  test.beforeEach(() => {
    env = setup()
  })
  test.afterEach(() => env.cleanup())

  const app = () => createApp({ db: env.db, config: env.config }, TOKEN)
  const headers = () => ({ host: `127.0.0.1:${env.config.port}`, 'x-taskq-token': TOKEN, 'content-type': 'application/json' })
  const call = (method: string, path: string, body?: unknown) => app().request(`/api${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) })

  test('a bot is created from a preset in auto mode with no sandbox and no gate, and taskq stays first', async () => {
    await call('GET', '/bots')
    const created = await call('POST', '/bots', { name: 'coder', preset: 'coder' })
    assert.equal(created.status, 201)
    const bot = await created.json() as Record<string, unknown>
    assert.equal(bot.permission_mode, 'auto')
    assert.equal(bot.sandbox, false)
    assert.deepEqual(bot.blocked_commands, [])
    assert.equal(bot.role, 'coder')
    const list = await (await call('GET', '/bots')).json() as { agents: { name: string; system: boolean }[] }
    assert.deepEqual(list.agents.map((a) => a.name), ['taskq', 'coder'])
    assert.equal(list.agents[0].system, true)
    assert.equal((await call('POST', '/bots', { name: 'coder', description: 'x' })).status, 409)
    assert.equal((await call('POST', '/bots', { name: 'Bad Name', description: 'x' })).status, 400)
  })

  test('settings are validated and saved; taskq cannot be deleted or disabled', async () => {
    await call('GET', '/bots')
    await call('POST', '/bots', { name: 'ops', description: 'Runs read-only account checks' })
    const saved = await call('PUT', '/bots/ops', { sandbox: true, allowed_domains: ['sts.amazonaws.com'], blocked_commands: ['git push*'], permission_mode: 'acceptEdits' })
    assert.equal(saved.status, 200)
    const bot = getAgent(env.db, 'ops')!
    assert.equal(bot.sandbox, true)
    assert.deepEqual(bot.blocked_commands, ['git push*'])
    assert.equal(bot.permission_mode, 'acceptEdits')
    assert.equal((await call('PUT', '/bots/ops', { permission_mode: 'yolo' })).status, 400)
    assert.equal((await call('PUT', '/bots/ops', { workdir: '/no/such/dir' })).status, 400)
    assert.equal((await call('PUT', '/bots/ops', { skills: ['not-registered'] })).status, 400)
    assert.equal((await call('DELETE', '/bots/taskq')).status, 409)
    assert.equal((await call('PUT', '/bots/taskq', { enabled: false })).status, 409)
    assert.equal((await call('DELETE', '/bots/ops')).status, 204)
    assert.equal(getAgent(env.db, 'ops'), undefined)
  })

  test('a registered skill is copied into the bot on save and again on reload', async () => {
    const skill = join(env.home, 'skills-src', 'release-notes')
    mkdirSync(skill, { recursive: true })
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: release-notes\ndescription: Writes release notes\n---\nversion 1\n')
    assert.equal((await call('POST', '/bot-skills', { path: skill })).status, 201)
    await call('GET', '/bots')
    await call('POST', '/bots', { name: 'writer', description: 'Writes', skills: ['release-notes'] })
    const copy = join(skillsPluginDir(env.config, 'writer'), 'skills', 'release-notes', 'SKILL.md')
    assert.match(readFileSync(copy, 'utf8'), /version 1/)
    writeFileSync(join(skill, 'SKILL.md'), '---\nname: release-notes\ndescription: Writes release notes\n---\nversion 2\n')
    assert.match(readFileSync(copy, 'utf8'), /version 1/, 'a turn keeps the snapshot until reload')
    const reloaded = await (await call('POST', '/bots/writer/reload', { kind: 'skill' })).json() as { note: string }
    assert.match(reloaded.note, /Skills reloaded: release-notes/)
    assert.match(readFileSync(copy, 'utf8'), /version 2/)
    assert.deepEqual(pluginPaths(env.db, env.config, 'writer'), [skillsPluginDir(env.config, 'writer')])
    const note = listMessages(env.db, { agent: 'writer', limit: 5 }).find((m) => m.body.startsWith('Skills reloaded'))
    assert.ok(note?.read_at, 'the reload note does not start a turn')
    assert.equal((await call('DELETE', '/bot-skills/release-notes')).status, 204)
    assert.deepEqual(getAgent(env.db, 'writer')?.skills, [])
  })

  test('appearance and queue autorun are global settings', async () => {
    assert.equal((await call('POST', '/settings/appearance', { font_family: 'pretendard', font_size: 17 })).status, 200)
    assert.equal((await call('POST', '/settings/appearance', { font_family: 'comic', font_size: 17 })).status, 400)
    assert.equal((await call('POST', '/settings/appearance', { font_family: 'system', font_size: 40 })).status, 400)
    await call('POST', '/settings/queue-autorun', { enabled: false })
    const settings = await (await call('GET', '/settings')).json() as { appearance: unknown; queue_autorun: boolean }
    assert.deepEqual(settings.appearance, { font_family: 'pretendard', font_size: 17, language: 'ko', theme: 'system' })
    assert.equal(settings.queue_autorun, false)
  })
})

describe('bots working on tasks', () => {
  let env: TestEnv
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
  })
  test.afterEach(() => env.cleanup())

  test('a bot starts and finishes its own task; the run is recorded under the bot', () => {
    const task = insertTask(env.db, { type: 'code', status: 'ready', owner: 'coder', data: { intent: 'fix it' } })
    assert.equal(startBotTask(env.db, 'reviewer', task.id, null).ok, false)
    const started = startBotTask(env.db, 'coder', task.id, 'sess-1')
    assert.equal(started.ok, true)
    assert.equal(getTask(env.db, task.id)?.status, 'running')
    assert.equal(getTask(env.db, task.id)?.claimed_by, 'bot:coder')
    assert.equal(finishBotTask(env.db, 'coder', task.id, 'done', 'npm test: 42 passed').ok, true)
    assert.equal(getTask(env.db, task.id)?.status, 'done')
    const run = env.db.prepare('SELECT bot, outcome, summary FROM runs WHERE task_id = ?').get(task.id)
    assert.deepEqual({ ...run }, { bot: 'coder', outcome: 'done', summary: 'npm test: 42 passed' })
  })

  test('an account draft cannot be started by a bot, and a restart hands a started task back', () => {
    const ops = insertTask(env.db, { type: 'ops_change', status: 'draft', owner: 'coder', data: { intent: 'scale' } })
    assert.match((startBotTask(env.db, 'coder', ops.id, null) as { error: string }).error, /promote/)
    const task = insertTask(env.db, { type: 'research', status: 'ready', owner: 'coder', data: { intent: 'survey' } })
    startBotTask(env.db, 'coder', task.id, null)
    assert.equal(recoverBotTasks(env.db), 1)
    assert.equal(getTask(env.db, task.id)?.status, 'ready')
    assert.match(listMessages(env.db, { recipient: 'coder', limit: 1 })[0].body, /restarted while you were working/)
  })

  test('the queue skips a bot\'s task and, with autorun off, unowned tasks too; run-now still runs once', async () => {
    const owned = insertTask(env.db, { type: 'research', status: 'ready', owner: 'coder', data: { intent: 'bot work' } })
    const mine = insertTask(env.db, { type: 'research', status: 'ready', data: { intent: 'my work' } })
    setQueueAutorun(env.db, false)
    const runner = createRunner({ db: env.db, config: env.config, worker: fakeWorker(() => result('done', 'ok')) })
    await runner.start()
    await sleep(60)
    assert.equal(statusOf(env.db, owned.id), 'ready')
    assert.equal(statusOf(env.db, mine.id), 'ready')
    runner.runNow(mine.id)
    await waitFor(() => statusOf(env.db, mine.id) === 'review')
    await runner.stop()
    assert.equal(statusOf(env.db, owned.id), 'ready')
    assert.equal(env.db.prepare('SELECT bot FROM runs WHERE task_id = ?').get(mine.id)?.bot, null)
  })

  test('blocked command patterns match anywhere in the command, and * is the only wildcard', () => {
    for (const command of ['cd app && git push origin main', 'sudo git push', 'x=1 git push', 'bash -c "git push"', 'true\ngit push', 'echo $(git push)']) {
      assert.equal(blockedBy(command, ['git push*']), 'git push*', command)
    }
    assert.equal(blockedBy('git status', ['git push*']), null)
    assert.equal(blockedBy('/bin/rm -rf /tmp/x', ['rm -rf *']), 'rm -rf *')
    assert.equal(blockedBy('echo a.b', ['echo a?b']), null)
    assert.ok(existsSync(env.home))
  })

  test('[critical] a shell command naming taskq data or config stops the turn even with no sandbox and no blocked commands', () => {
    const bot = getAgent(env.db, 'coder')!
    const gate = (command: string) => botGate(env.config, bot, env.home, 'Bash', { command }).action
    assert.equal(gate(`sqlite3 ${join(env.home, 'data', 'taskq.db')} "UPDATE meta SET value = '0'"`), 'stop')
    assert.equal(gate(`sed -i s/10/1000/ ${join(env.home, 'taskq.config.json')}`), 'stop')
    assert.equal(gate('cat taskq.db'), 'stop')
    assert.equal(gate(`echo x > ${join(homedir(), '.claude', 'settings.json')}`), 'deny')
    assert.equal(gate('echo x > ~/.claude/settings.json'), 'deny')
    assert.equal(gate('npm test'), 'allow')
    assert.equal(gate(`echo '{}' > ${join(env.home, 'bot-plugins', 'coder', 'skills-plugin', '.mcp.json')}`), 'stop')
    const write = botGate(env.config, bot, env.home, 'Write', { file_path: join(env.home, 'bot-plugins', 'coder', 'skills-plugin', 'hooks', 'hooks.json'), content: '{}' })
    assert.equal(write.action, 'stop')
    assert.equal(botGate(env.config, bot, join(env.home, 'team', 'coder'), 'Write', { file_path: 'notes.md', content: 'x' }).action, 'allow')
  })

  test('[critical] reload refuses a snapshot folder that a bot replaced with a symlink, and deletes nothing outside', () => {
    const victim = join(env.home, 'victim')
    mkdirSync(join(victim, 'plugins', 'keep'), { recursive: true })
    mkdirSync(join(env.home, 'bot-plugins'), { recursive: true })
    symlinkSync(victim, join(env.home, 'bot-plugins', 'coder'))
    assert.throws(() => reloadAll(env.db, env.config, 'coder'), /symbolic link/)
    assert.ok(existsSync(join(victim, 'plugins', 'keep')))
  })

  test('[critical] a task left running when a turn ends, or held by a deleted bot, is handed back', () => {
    const a = insertTask(env.db, { type: 'research', status: 'ready', owner: 'coder', data: { intent: 'one' } })
    startBotTask(env.db, 'coder', a.id, null)
    assert.deepEqual(releaseBotTasks(env.db, 'coder', 'the turn ended without finish_task', 'ready'), [a.id])
    assert.equal(getTask(env.db, a.id)?.status, 'ready')
    assert.equal(getTask(env.db, a.id)?.owner, 'coder')
    startBotTask(env.db, 'coder', a.id, null)
    releaseBotTasks(env.db, 'coder', 'the bot was deleted', 'draft')
    assert.equal(getTask(env.db, a.id)?.status, 'draft')
    assert.equal(getTask(env.db, a.id)?.owner, null)
  })

  test('[critical] a bot cannot start a draft; a running task cannot change hands; a finished code task gets a review by another bot', () => {
    const draft = insertTask(env.db, { type: 'research', status: 'draft', owner: 'coder', data: { intent: 'just a note' } })
    assert.match((startBotTask(env.db, 'coder', draft.id, null) as { error: string }).error, /draft/)
    const code = insertTask(env.db, { type: 'code', status: 'ready', owner: 'coder', data: { intent: 'change code' } })
    startBotTask(env.db, 'coder', code.id, null)
    const assign = teamTools({ db: env.db, config: env.config, agent: 'taskq', search: hybridSearch(env.db) }).find((t) => t.name === 'assign_task')!
    assert.throws(() => assign.handler({ task_id: code.id, to: 'reviewer' }), /running/)
    finishBotTask(env.db, 'coder', code.id, 'done', 'changed; npm test passed')
    const review = env.db.prepare(`SELECT owner FROM tasks WHERE type = 'security_review' AND json_extract(data, '$.review_of') = ?`).get(code.id)
    assert.equal(review?.owner, 'reviewer')
  })
})
