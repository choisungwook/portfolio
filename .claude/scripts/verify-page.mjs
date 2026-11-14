#!/usr/bin/env node
// Opens a page in headless Chromium and reports what a reviewer would look at:
// console errors, failed requests, the visible controls, and a screenshot.
//
//   node .claude/scripts/verify-page.mjs <directory | url> [--out <dir>] [--click <selector>]...
//
// A directory is served as a static site, which is enough for the no-build-step
// apps under product/. Exits 1 when the page logged an error.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { mkdirSync, statSync } from 'node:fs'
import { extname, join, normalize, resolve } from 'node:path'
import { createRequire } from 'node:module'

// require() also finds a globally installed Playwright (NODE_PATH); import does not.
const { chromium } = createRequire(import.meta.url)('playwright')

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.wasm': 'application/wasm',
}

function parseArgs(argv) {
  const options = { target: argv[0], out: 'verify-page-output', clicks: [] }
  for (let i = 1; i < argv.length; i += 2) {
    if (argv[i] === '--out') options.out = argv[i + 1]
    else if (argv[i] === '--click') options.clicks.push(argv[i + 1])
    else throw new Error(`unknown option ${argv[i]}`)
  }
  if (!options.target) throw new Error('usage: verify-page.mjs <directory | url> [--out <dir>] [--click <selector>]...')
  return options
}

function serveDirectory(root) {
  const server = createServer(async (request, response) => {
    const path = normalize(decodeURIComponent(new URL(request.url, 'http://x').pathname))
    const file = join(root, path.endsWith('/') ? `${path}index.html` : path)
    try {
      if (!file.startsWith(root)) throw new Error('outside root')
      const body = await readFile(file)
      response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
      response.end(body)
    } catch {
      response.writeHead(404).end()
    }
  })
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)))
}

// Runs in the page. Lists what a user can see and act on, so a feature map
// can name the same things the DOM does.
function describePage() {
  const visible = (element) => element.getClientRects().length > 0
  const label = (element) =>
    (element.getAttribute('aria-label') || element.textContent || element.getAttribute('placeholder') || element.id || '').replace(/\s+/g, ' ').trim().slice(0, 60)
  const pick = (selector) => [...document.querySelectorAll(selector)].filter(visible).map(label).filter(Boolean)
  return {
    title: document.title,
    headings: pick('h1, h2, h3'),
    controls: [...new Set(pick('button, [role=button], a[href], input, select, textarea, summary'))],
  }
}

const options = parseArgs(process.argv.slice(2))
const isUrl = /^https?:\/\//.test(options.target)
const server = isUrl ? null : await serveDirectory(resolve(options.target))
if (!isUrl && !statSync(options.target).isDirectory()) throw new Error(`${options.target} is not a directory`)
const url = isUrl ? options.target : `http://127.0.0.1:${server.address().port}/`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
const errors = []
page.on('console', (message) => message.type() === 'error' && errors.push(`console: ${message.text()}`))
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('requestfailed', (request) => errors.push(`requestfailed: ${request.url()}`))
page.on('response', (response) => response.status() >= 400 && errors.push(`http ${response.status()}: ${response.url()}`))

await page.goto(url, { waitUntil: 'networkidle' })
for (const selector of options.clicks) await page.click(selector)

mkdirSync(options.out, { recursive: true })
const screenshot = join(options.out, 'page.png')
await page.screenshot({ path: screenshot, fullPage: true })
console.log(JSON.stringify({ url, ...(await page.evaluate(describePage)), errors, screenshot }, null, 2))

await browser.close()
server?.close()
process.exit(errors.length > 0 ? 1 : 0)
