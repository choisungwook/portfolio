import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { chromePath, closeBrowsers } from '../src/browser/chrome.ts'
import { browserClick, browserOpen, browserRead, browserScreenshot, browserState, browserType, webUrl } from '../src/browser/actions.ts'
import { setup } from './helpers.ts'

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
