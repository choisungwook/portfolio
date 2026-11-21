import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { getAgent } from '../src/db/team.ts'
import { botGate } from '../src/team/bot-gate.ts'
import { chromePath, closeBrowsers, ownerPid } from '../src/browser/chrome.ts'
import { browserClick, browserOpen, browserRead, browserScreenshot, browserState, browserType, webUrl } from '../src/browser/actions.ts'
import { seedTestBots, setup } from './helpers.ts'
import { allowedSites } from '../src/browser/sites.ts'
import { consumeApproval, decideApprovalRequest, openApprovals, requestApproval } from '../src/db/bot-requests.ts'
import { teamTools } from '../src/team/tools.ts'
import { hybridSearch } from '../src/team/search.ts'

test('only http and https pages open; a bare host becomes https', () => {
  assert.equal(webUrl('example.com'), 'https://example.com')
  assert.throws(() => webUrl('file:///etc/passwd'), /only http and https/)
  assert.throws(() => webUrl('chrome://settings'), /only http and https/)
})

// Drives a real headless Chrome against a local page; skipped where no Chromium-based browser is installed (CI).
test('a bot opens a page, reads it, types and clicks', { skip: !chromePath() && 'no Chrome on this machine', timeout: 60_000 }, async () => {
  const page = `<title>Form</title><input id=q aria-label="query"><button onclick="document.title='sent '+q.value">Send</button>`
  const server = createServer((_req, res) => res.end(page)).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
  const env = setup()
  try {
    assert.deepEqual(await browserState(env.config, 'coder'), { running: false }, 'looking does not start a browser')
    assert.equal((await browserOpen(env.config, 'coder', url)).title, 'Form')
    const read = await browserRead(env.config, 'coder') as { elements: { ref: string; label: string }[] }
    const field = read.elements.find((e) => e.label === 'query')!
    const button = read.elements.find((e) => e.label === 'Send')!
    await browserType(env.config, 'coder', field.ref, 'retry', false)
    assert.equal((await browserClick(env.config, 'coder', button.ref)).title, 'sent retry')
    const png = await browserScreenshot(env.config, 'coder')
    assert.equal(png.subarray(1, 4).toString(), 'PNG')
    assert.equal((await browserState(env.config, 'coder')).running, true)
  } finally {
    await closeBrowsers(env.config)
    server.close()
    env.cleanup()
  }
})

test('a one-turn MCP process hands the browser to the taskq server it names', () => {
  const before = process.env.TASKQ_OWNER_PID
  try {
    process.env.TASKQ_OWNER_PID = '4242'
    assert.equal(ownerPid(), 4242)
    process.env.TASKQ_OWNER_PID = '1; rm -rf /'
    assert.equal(ownerPid(), process.pid, 'only an integer reaches the watcher shell')
  } finally {
    if (before === undefined) delete process.env.TASKQ_OWNER_PID
    else process.env.TASKQ_OWNER_PID = before
  }
})

test('approving a browser site request allows the site for good', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    const request = requestApproval(env.db, 'coder', 'browser_site', 'shop.example', 'browser site')
    decideApprovalRequest(env.db, request.id, true)
    assert.deepEqual(allowedSites(env.db, 'coder'), ['shop.example'])
    const note = env.db.prepare(`SELECT body FROM team_messages WHERE recipient = 'coder' ORDER BY id DESC LIMIT 1`).get() as { body: string }
    assert.match(note.body, /allowed you to click and type on shop\.example/)
  } finally {
    env.cleanup()
  }
})

test('clicks and typing wait for a site approval, irreversible clicks for a one-time one, passwords never', { skip: !chromePath() && 'no Chrome on this machine', timeout: 60_000 }, async () => {
  const page = `<title>Shop</title><input aria-label="search"><input type=password aria-label="pw"><button onclick="document.title='bought'">Buy now</button><button onclick="document.title='more'">More</button>
    <button onclick="document.title='subscribed'">Subscribe</button><textarea aria-label="Message"></textarea>`
  const server = createServer((_req, res) => res.end(page)).listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  const env = setup()
  try {
    await seedTestBots(env.db)
    const tools = teamTools({ db: env.db, config: env.config, agent: 'coder', search: hybridSearch(env.db) })
    const call = (name: string, args: Record<string, unknown>) => tools.find((t) => t.name === name)!.handler(args) as Promise<Record<string, unknown>>
    await call('browser_open', { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/` })
    const refs = Object.fromEntries(((await call('browser_read', {})).elements as { ref: string; label: string }[]).map((e) => [e.label, e.ref]))
    await assert.rejects(call('browser_click', { ref: refs.More }), /needs the user's approval first, as on every new site/)
    const site = openApprovals(env.db).find((a) => a.tool === 'browser_site')!
    assert.match(site.command, /^127\.0\.0\.1:\d+$/, 'a site is a host and its port')
    decideApprovalRequest(env.db, site.id, true)
    assert.equal((await call('browser_click', { ref: refs.More })).title, 'more', 'an ordinary click runs on an allowed site')
    await assert.rejects(call('browser_type', { ref: refs.pw, text: 'secret' }), /never type passwords/)
    await assert.rejects(call('browser_click', { ref: refs['Buy now'] }), /cannot be taken back/)
    const buy = openApprovals(env.db).find((a) => a.tool === 'browser_action')!
    assert.match(buy.command, /^click "Buy now" \(button\) on http:\/\/127\.0\.0\.1:\d+\/$/)
    decideApprovalRequest(env.db, buy.id, true)
    assert.equal((await call('browser_click', { ref: refs['Buy now'] })).title, 'bought', 'the approved action runs once')
    await assert.rejects(call('browser_click', { ref: refs['Buy now'] }), /cannot be taken back/, 'and asks again after that')
    // A label with an s in it is read whole (an unescaped \\s once turned "Subscribe" into "Sub cribe").
    await assert.rejects(call('browser_click', { ref: refs.Subscribe }), /click "Subscribe"/)
    // Enter in a message box sends, whatever the box is called.
    await assert.rejects(call('browser_type', { ref: refs.Message, text: 'hello', submit: true }), /cannot be taken back/)
    assert.equal((await call('browser_type', { ref: refs.Message, text: 'draft', submit: false })).title, 'bought', 'typing without Enter runs')
  } finally {
    await closeBrowsers(env.config)
    server.close()
    env.cleanup()
  }
})

test('a web action approved longer ago than allowed is not used', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    const request = requestApproval(env.db, 'coder', 'browser_action', 'click "Delete" (button) on https://x/', 'irreversible web action')
    decideApprovalRequest(env.db, request.id, true)
    env.db.prepare('UPDATE bot_approvals SET decided_at = decided_at - 3600 WHERE id = ?').run(request.id)
    assert.equal(consumeApproval(env.db, 'coder', 'browser_action', 'click "Delete" (button) on https://x/', 15 * 60), false)
    assert.equal(consumeApproval(env.db, 'coder', 'browser_action', 'click "Delete" (button) on https://x/'), true, 'without a limit it still counts')
  } finally {
    env.cleanup()
  }
})

test('a bot cannot reach its browser around the gate: the profile stops the turn, DevTools commands are refused', async () => {
  const env = setup()
  try {
    await seedTestBots(env.db)
    const coder = getAgent(env.db, 'coder')!
    const gate = (tool: string, input: Record<string, unknown>) => botGate(env.config, coder, env.home, tool, input)
    const profile = join(env.config.home, 'browser', 'coder')
    assert.equal(gate('Bash', { command: `cat ${profile}/DevToolsActivePort` }).action, 'stop')
    assert.equal(gate('Read', { file_path: join(profile, 'DevToolsActivePort') }).action, 'stop')
    assert.equal(gate('Grep', { pattern: 'x', path: join(env.config.home, 'browser') }).action, 'stop')
    for (const command of [
      'curl -s http://127.0.0.1:9222/json/version',
      'lsof -iTCP -sTCP:LISTEN | grep remote-debugging',
      'find / -name DevToolsActivePort',
      `node -e "ws.send(JSON.stringify({method:'Input.dispatchMouseEvent'}))"`,
    ]) assert.equal(gate('Bash', { command }).action, 'deny', command)
    assert.equal(gate('Bash', { command: 'curl -s https://example.com/api/list' }).action, 'allow', 'ordinary requests still run')
  } finally {
    env.cleanup()
  }
})
