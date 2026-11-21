import type { Config } from '../config.ts'
import { openPage, type Page } from './chrome.ts'

// What a bot (through its tools) and the user (through the right pane) do in the bot's browser. Each call opens one CDP
// connection, does its work and closes it, so nothing stays connected between turns.

const LOAD_MS = 15_000
const TEXT_LIMIT = 8000
const ELEMENT_LIMIT = 150

async function withPage<T>(config: Config, bot: string, work: (page: Page) => Promise<T>, launch = true): Promise<T> {
  const page = await openPage(config, bot, launch)
  if (!page) throw new Error(launch ? 'the browser did not start' : 'the browser is not running')
  try {
    return await work(page)
  } finally {
    page.close()
  }
}

async function settle(page: Page): Promise<void> {
  const until = Date.now() + LOAD_MS
  while (Date.now() < until) {
    try {
      if (await page.evaluate<string>('document.readyState') === 'complete') return
    } catch { /* navigating: the context is being replaced */ }
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
}

const where = (page: Page) => page.evaluate<{ url: string; title: string }>('({ url: location.href, title: document.title })')

// Only web pages: a bot reads files with its file tools, and file: or chrome: pages would reach past them.
export function webUrl(raw: string): string {
  const text = raw.trim()
  const url = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  if (!URL.canParse(url)) throw new Error(`not a URL: ${raw}`)
  const protocol = new URL(url).protocol
  if (protocol !== 'http:' && protocol !== 'https:') throw new Error('only http and https pages open in the browser')
  return url
}

export function browserOpen(config: Config, bot: string, url: string) {
  const target = webUrl(url)
  return withPage(config, bot, async (page) => {
    await page.send('Page.navigate', { url: target })
    await new Promise((resolve) => setTimeout(resolve, 300))
    await settle(page)
    return where(page)
  })
}

// The page as text plus its controls, each tagged with a ref (e1, e2, …) that browser_click and browser_type take.
const READ = `(() => {
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' }
  document.querySelectorAll('[data-taskq-ref]').forEach((el) => el.removeAttribute('data-taskq-ref'))
  const nodes = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, [role=button], [role=link], [role=tab], [role=menuitem], [contenteditable=true], summary')].filter(visible).slice(0, ${ELEMENT_LIMIT})
  const elements = nodes.map((el, i) => {
    const ref = 'e' + (i + 1)
    el.setAttribute('data-taskq-ref', ref)
    const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || '').trim().replace(/\\s+/g, ' ').slice(0, 80)
    return { ref, tag: el.tagName.toLowerCase(), type: el.type || undefined, label, href: el.href || undefined }
  })
  return { url: location.href, title: document.title, text: (document.body?.innerText || '').slice(0, ${TEXT_LIMIT}), elements }
})()`

export function browserRead(config: Config, bot: string) {
  return withPage(config, bot, (page) => page.evaluate<Record<string, unknown>>(READ))
}

async function center(page: Page, ref: string): Promise<{ x: number; y: number }> {
  const point = await page.evaluate<{ x: number; y: number } | null>(`(() => {
    const el = document.querySelector('[data-taskq-ref=${JSON.stringify(ref)}]')
    if (!el) return null
    el.scrollIntoView({ block: 'center', inline: 'center' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!point) throw new Error(`no element ${ref} on this page; call browser_read again, the page may have changed`)
  return point
}

async function clickAt(page: Page, x: number, y: number): Promise<void> {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await page.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 })
  }
  await new Promise((resolve) => setTimeout(resolve, 400))
  await settle(page)
}

// What a ref points at, before acting on it, so the approval gate can name the action in words the user recognizes.
export interface Target { host: string; page: string; label: string; tag: string; type: string; href: string }
export function browserTarget(config: Config, bot: string, ref: string) {
  return withPage(config, bot, async (page) => {
    const target = await page.evaluate<Target | null>(`(() => {
      const el = document.querySelector('[data-taskq-ref=${JSON.stringify(ref)}]')
      if (!el) return null
      const label = (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || '').trim().replace(/\s+/g, ' ').slice(0, 120)
      return { host: location.hostname, page: location.origin + location.pathname, label, tag: el.tagName.toLowerCase(), type: (el.type || '').toLowerCase(), href: el.href || '' }
    })()`)
    if (!target) throw new Error(`no element ${ref} on this page; call browser_read again, the page may have changed`)
    return target
  }, false)
}

export function browserClick(config: Config, bot: string, ref: string) {
  return withPage(config, bot, async (page) => {
    const { x, y } = await center(page, ref)
    await clickAt(page, x, y)
    return where(page)
  })
}

// A click where the user clicked on the picture of the page, in the page's own CSS pixels.
export function browserClickAt(config: Config, bot: string, x: number, y: number) {
  return withPage(config, bot, async (page) => {
    await clickAt(page, x, y)
    return where(page)
  })
}

export function browserType(config: Config, bot: string, ref: string, text: string, submit: boolean) {
  return withPage(config, bot, async (page) => {
    const { x, y } = await center(page, ref)
    await clickAt(page, x, y)
    // Replace what the field held, as a person selecting it all and typing would.
    await page.evaluate(`(() => { const el = document.activeElement; if (el && 'select' in el) el.select() })()`)
    await page.send('Input.insertText', { text })
    if (submit) {
      for (const type of ['keyDown', 'keyUp']) {
        await page.send('Input.dispatchKeyEvent', { type, key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, ...(type === 'keyDown' ? { text: '\r' } : {}) })
      }
      await new Promise((resolve) => setTimeout(resolve, 400))
      await settle(page)
    }
    return where(page)
  })
}

// The pane's picture passes launch false: looking at the browser never starts one.
export function browserScreenshot(config: Config, bot: string, format: 'png' | 'jpeg' = 'png', launch = true) {
  return withPage(config, bot, async (page) => {
    const { data } = await page.send<{ data: string }>('Page.captureScreenshot', format === 'jpeg' ? { format, quality: 70 } : { format })
    return Buffer.from(data, 'base64')
  }, launch)
}

// For the right pane: where the bot's browser is, without starting one.
export async function browserState(config: Config, bot: string): Promise<{ running: boolean; url?: string; title?: string }> {
  const page = await openPage(config, bot, false)
  if (!page) return { running: false }
  try {
    return { running: true, ...(await where(page)) }
  } finally {
    page.close()
  }
}
