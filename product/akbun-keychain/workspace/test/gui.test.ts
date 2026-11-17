import { strict as assert } from 'node:assert'
import { request as httpRequest } from 'node:http'
import { afterEach, beforeEach, describe, test } from 'node:test'
import { startGui } from '../src/gui/server.ts'
import { readAudit } from '../src/core/audit.ts'
import { create, initVault, openVault } from '../src/core/vault.ts'
import { PASSWORD, TEST_KDF_N, encodings, useTempHome } from './helpers.ts'

const SECRET = 'gui-secret-value-55443322'

interface Reply {
  status: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

let gui: Awaited<ReturnType<typeof startGui>>
let exitCode: number | undefined
let cookie = ''

function send(method: string, path: string, options: { body?: unknown; host?: string; origin?: string | null; cookie?: string } = {}): Promise<Reply> {
  const origin = options.origin === undefined ? `http://127.0.0.1:${gui.port}` : options.origin
  const headers: Record<string, string> = { Host: options.host ?? `127.0.0.1:${gui.port}` }
  if (origin !== null) headers.Origin = origin
  if (options.cookie ?? cookie) headers.Cookie = options.cookie ?? cookie
  const payload = options.body === undefined ? undefined : JSON.stringify(options.body)
  if (payload) headers['Content-Type'] = 'application/json'
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: gui.port, method, path, headers }, (res) => {
      let body = ''
      res.setEncoding('utf8').on('data', (chunk: string) => { body += chunk })
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }))
    })
    req.on('error', reject)
    req.end(payload)
  })
}

async function login(): Promise<void> {
  const reply = await send('POST', '/api/login', { body: { bootstrap: gui.bootstrap, password: PASSWORD } })
  assert.equal(reply.status, 200, reply.body)
  cookie = String(reply.headers['set-cookie']).split(';')[0]
}

describe('page server', () => {
  beforeEach(async () => {
    useTempHome()
    await initVault(PASSWORD, { kdfN: TEST_KDF_N })
    await create(openVault(PASSWORD), { name: 'app/token', value: SECRET })
    exitCode = undefined
    cookie = ''
    gui = await startGui({ port: 0, onClose: (code) => { exitCode = code } })
  })
  afterEach(() => gui.close())

  test('[critical] every /api route except login returns 401 without the cookie', async () => {
    const routes: [string, string][] = [
      ['GET', '/api/keys'], ['POST', '/api/keys'], ['PATCH', '/api/keys/app%2Ftoken'], ['DELETE', '/api/keys/app%2Ftoken'],
      ['POST', '/api/keys/app%2Ftoken/reveal'], ['GET', '/api/audit'], ['GET', '/api/agent'], ['POST', '/api/agent/unlock'],
      ['POST', '/api/agent/lock'], ['POST', '/api/logout'],
    ]
    await login()
    for (const [method, path] of routes) {
      const reply = await send(method, path, { cookie: 'akbun_keychain_session=forged', body: {} })
      assert.equal(reply.status, 401, `${method} ${path}`)
    }
    assert.equal((await send('GET', '/api/keys')).status, 200)
  })

  test('[critical] a wrong Host, or a write with a wrong Origin, is refused', async () => {
    await login()
    assert.equal((await send('GET', '/api/keys', { host: `localhost:${gui.port}` })).status, 421)
    assert.equal((await send('GET', '/', { host: `evil.example:${gui.port}` })).status, 421)
    assert.equal((await send('POST', '/api/keys/app%2Ftoken/reveal', { origin: 'http://evil.example' })).status, 403)
    assert.equal((await send('DELETE', '/api/keys/app%2Ftoken', { origin: null })).status, 403)
    assert.equal((await send('POST', '/api/login', { origin: 'http://evil.example', body: { bootstrap: gui.bootstrap, password: PASSWORD } })).status, 403)
  })

  test('[critical] the bootstrap token is refused after one successful login', async () => {
    await login()
    const again = await send('POST', '/api/login', { body: { bootstrap: gui.bootstrap, password: PASSWORD } })
    assert.equal(again.status, 401)
    assert.equal(JSON.parse(again.body).error, 'BAD_BOOTSTRAP')
  })

  test('[critical] a wrong password returns 401 with attempts_left, and the fifth ends the server', async () => {
    for (let attempt = 1; attempt <= 5; attempt++) {
      const reply = await send('POST', '/api/login', { body: { bootstrap: gui.bootstrap, password: 'wrong password value' } })
      assert.equal(reply.status, 401)
      assert.equal(JSON.parse(reply.body).attempts_left, 5 - attempt)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(exitCode, 4)
  })

  test('[critical] no HTTP error body contains the password, a value or a token', async () => {
    const bodies: string[] = []
    const record = async (reply: Promise<Reply>) => bodies.push((await reply).body)
    await record(send('POST', '/api/login', { body: { bootstrap: gui.bootstrap, password: `${PASSWORD}x` } }))
    await record(send('POST', '/api/login', { body: { bootstrap: `${gui.bootstrap}x`, password: PASSWORD } }))
    await login()
    await record(send('POST', '/api/keys', { body: { name: 'app/token', value: SECRET } }))
    await record(send('POST', '/api/keys', { body: { name: 'Bad Name', value: SECRET } }))
    await record(send('POST', '/api/keys', { body: { name: 'big', value: SECRET.repeat(5000) } }))
    await record(send('PATCH', '/api/keys/missing', { body: { value: SECRET } }))
    await record(send('POST', '/api/keys', { body: 'not json' as unknown }))
    const needles = [...encodings(SECRET), ...encodings(PASSWORD), gui.bootstrap, cookie.split('=')[1]]
    for (const body of bodies) {
      assert.ok(JSON.parse(body).error, body)
      for (const needle of needles) assert.ok(!body.includes(needle), body.slice(0, 100))
    }
  })

  test('create, reveal, edit and delete a key, each in the audit log as gui', async () => {
    await login()
    assert.equal((await send('POST', '/api/keys', { body: { name: 'web/key', value: 'v1', tags: ['web'], ai_access: 'reveal' } })).status, 201)
    assert.equal(JSON.parse((await send('POST', '/api/keys/web%2Fkey/reveal')).body).value, 'v1')
    const edited = await send('PATCH', '/api/keys/web%2Fkey', { body: { description: 'edited', rename: 'web/renamed' } })
    assert.equal(edited.status, 200, edited.body)
    assert.equal(JSON.parse(edited.body).name, 'web/renamed')
    assert.equal((await send('DELETE', '/api/keys/web%2Frenamed')).status, 200)
    const keys = JSON.parse((await send('GET', '/api/keys')).body).entries.map((entry: { name: string }) => entry.name)
    assert.deepEqual(keys, ['app/token'])
    const ops = readAudit().filter((line) => line.actor === 'gui').map((line) => line.op)
    assert.deepEqual(ops, ['login', 'create', 'reveal', 'update', 'rename', 'delete'])
  })

  test('the page and its assets are served with CSP and no-store', async () => {
    for (const path of ['/', '/js/app.js', '/css/app.css', '/css/theme/carbon.css']) {
      const reply = await send('GET', path)
      assert.equal(reply.status, 200, path)
      assert.match(String(reply.headers['content-security-policy']), /default-src 'self'/)
      assert.equal(reply.headers['cache-control'], 'no-store')
    }
    assert.equal((await send('GET', '/../package.json')).status, 404)
  })

  test('logout ends the server', async () => {
    await login()
    assert.equal((await send('POST', '/api/logout')).status, 200)
    await new Promise((resolve) => setTimeout(resolve, 100))
    assert.equal(exitCode, 0)
  })
})

test('the page server ends after the idle timeout', async () => {
  useTempHome()
  await initVault(PASSWORD, { kdfN: TEST_KDF_N })
  let code: number | undefined
  const short = await startGui({ port: 0, idleMs: 200, onClose: (value) => { code = value } })
  await new Promise((resolve) => setTimeout(resolve, 500))
  assert.equal(code, 0)
  short.close()
})
