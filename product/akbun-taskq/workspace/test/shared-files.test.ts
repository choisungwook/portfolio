import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createApp } from '../src/api/server.ts'
import { hybridSearch } from '../src/team/search.ts'
import { sharedRelative } from '../src/team/shared.ts'
import { teamTools } from '../src/team/tools.ts'
import { seedTestBots, setup, TOKEN, type TestEnv } from './helpers.ts'

// Files a bot makes for the user: saved in the shared folder, handed over with send_message, opened from the message.

describe('files handed over through the shared folder', () => {
  let env: TestEnv
  let shared: string
  test.beforeEach(async () => {
    env = setup()
    await seedTestBots(env.db)
    shared = join(env.home, 'shared')
    mkdirSync(join(shared, 'outputs', 'taskq'), { recursive: true })
    writeFileSync(join(shared, 'outputs', 'taskq', 'report.html'), '<h1>hi</h1>')
    writeFileSync(join(env.home, 'secret.txt'), 'x')
    symlinkSync(join(env.home, 'secret.txt'), join(shared, 'outputs', 'taskq', 'link.txt'))
  })
  test.afterEach(() => env.cleanup())

  test('[critical] only an existing file inside the shared folder is accepted, by relative or absolute path', () => {
    assert.equal(sharedRelative(env.config, 'outputs/taskq/report.html'), 'outputs/taskq/report.html')
    assert.equal(sharedRelative(env.config, join(shared, 'outputs/taskq/report.html')), 'outputs/taskq/report.html')
    assert.equal(sharedRelative(env.config, join(env.home, 'secret.txt')), null)
    assert.equal(sharedRelative(env.config, '../secret.txt'), null)
    assert.equal(sharedRelative(env.config, 'outputs/taskq/link.txt'), null, 'a link out of the folder is refused')
    assert.equal(sharedRelative(env.config, 'outputs/taskq'), null, 'a folder is not a file')
    assert.equal(sharedRelative(env.config, 'outputs/taskq/missing.pdf'), null)
  })

  test('send_message carries files as paths relative to the shared folder and refuses others', () => {
    const send = teamTools({ db: env.db, config: env.config, agent: 'taskq', search: hybridSearch(env.db) }).find((t) => t.name === 'send_message')!
    send.handler({ to: 'user', body: 'the report', files: [join(shared, 'outputs/taskq/report.html')] })
    const stored = env.db.prepare('SELECT attachments FROM team_messages ORDER BY id DESC LIMIT 1').get()
    assert.deepEqual(JSON.parse(String(stored?.attachments)), ['outputs/taskq/report.html'])
    assert.throws(() => send.handler({ to: 'user', body: 'x', files: [join(env.home, 'secret.txt')] }), /not a file in the shared folder; save what you hand over under .*outputs\/taskq\//)
  })

  test('open-file opens a shared file or its folder on this machine, nothing outside', async () => {
    const opened: string[] = []
    const app = createApp({ db: env.db, config: env.config, opener: (path) => opened.push(path) }, TOKEN)
    const call = (body: unknown) => app.request('/api/open-file', {
      method: 'POST', body: JSON.stringify(body),
      headers: { 'x-taskq-token': TOKEN, 'content-type': 'application/json', host: `127.0.0.1:${env.config.port}` },
    })
    assert.equal((await call({ path: 'outputs/taskq/report.html' })).status, 200)
    assert.equal((await call({ path: 'outputs/taskq/report.html', reveal: true })).status, 200)
    assert.equal((await call({ path: '../secret.txt' })).status, 404)
    assert.equal((await call({ path: 'outputs/taskq/link.txt' })).status, 404)
    assert.deepEqual(opened.map((p) => p.slice(env.home.length)), ['/shared/outputs/taskq/report.html', '/shared/outputs/taskq'])
  })

  test('[critical] an HTML preview is served sandboxed under a short-lived ticket, with only the files beside it', async () => {
    writeFileSync(join(shared, 'outputs', 'taskq', 'style.css'), 'h1{color:red}')
    writeFileSync(join(shared, 'outputs', 'notes.md'), '# not beside it')
    const app = createApp({ db: env.db, config: env.config }, TOKEN)
    const host = `127.0.0.1:${env.config.port}`
    const ask = (body: unknown, token = TOKEN) => app.request('/api/shared/preview', {
      method: 'POST', body: JSON.stringify(body), headers: { 'x-taskq-token': token, 'content-type': 'application/json', host },
    })
    const get = (path: string) => app.request(path, { headers: { host } })
    assert.equal((await ask({ path: 'outputs/taskq/report.html' }, 'wrong')).status, 401)
    assert.equal((await ask({ path: 'outputs/taskq/style.css' })).status, 404, 'only HTML gets a preview')
    assert.equal((await ask({ path: '../secret.txt' })).status, 404)
    const { url } = await (await ask({ path: 'outputs/taskq/report.html' })).json() as { url: string }
    assert.match(url, /^\/preview\/[0-9a-f]{32}\/report\.html$/)
    const page = await get(url)
    assert.equal(await page.text(), '<h1>hi</h1>')
    assert.match(page.headers.get('content-security-policy') ?? '', /^sandbox allow-scripts;.*frame-ancestors http:\/\/127\.0\.0\.1:/)
    const base = url.slice(0, url.lastIndexOf('/'))
    assert.equal(await (await get(`${base}/style.css`)).text(), 'h1{color:red}')
    assert.equal((await get(`${base}/../notes.md`)).status, 404)
    assert.equal((await get(`${base}/%2e%2e/notes.md`)).status, 404)
    assert.equal((await get(`${base}/link.txt`)).status, 404, 'a link out of the folder is refused')
    assert.equal((await get('/preview/00000000000000000000000000000000/report.html')).status, 404)
  })
})
