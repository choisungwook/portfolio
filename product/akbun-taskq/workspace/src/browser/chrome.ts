import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Config } from '../config.ts'

// Each bot has its own headless Chrome, the browser its conversation shows on the right. taskq starts the Chrome that
// is installed on this Mac with remote debugging on a free port and talks to it over the DevTools protocol (CDP) with
// Node's own WebSocket, so no browser library is bundled. Chrome writes the port to DevToolsActivePort in its profile
// folder; any taskq process (the server, or `taskq mcp --bot` for a Kiro bot) reads that file and reaches the same
// browser. The profile under TASKQ_HOME/browser/<bot> keeps the bot's cookies between turns.

const CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
]
const START_MS = 10_000
const CALL_MS = 20_000

export function chromePath(): string | null {
  const own = process.env.TASKQ_CHROME
  if (own) return existsSync(own) ? own : null
  return CANDIDATES.find((path) => existsSync(path)) ?? null
}

export const profileDir = (config: Config, bot: string) => join(config.home, 'browser', bot)

// The DevTools port of the bot's running Chrome, or null when none answers.
async function runningPort(config: Config, bot: string): Promise<number | null> {
  const file = join(profileDir(config, bot), 'DevToolsActivePort')
  if (!existsSync(file)) return null
  const port = Number(readFileSync(file, 'utf8').split('\n')[0])
  if (!port) return null
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1500) })
    return res.ok ? port : null
  } catch {
    return null
  }
}

async function start(config: Config, bot: string): Promise<number> {
  const path = chromePath()
  if (!path) throw new Error('No Chrome, Chromium, Edge or Brave is installed (or set TASKQ_CHROME to a Chromium-based browser).')
  const dir = profileDir(config, bot)
  mkdirSync(dir, { recursive: true })
  rmSync(join(dir, 'DevToolsActivePort'), { force: true })
  const args = [
    '--headless=new', `--user-data-dir=${dir}`, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
    '--no-first-run', '--no-default-browser-check', '--window-size=1280,800', 'about:blank',
  ]
  // Chrome must not outlive the taskq process that started it, even one killed without a chance to close it. A shell
  // runs Chrome and checks every 2 seconds that this process is alive; when it is gone, the shell ends Chrome.
  const watch = `"$0" "$@" & c=$!; while kill -0 ${process.pid} 2>/dev/null && kill -0 $c 2>/dev/null; do sleep 2; done; kill $c 2>/dev/null`
  const child = spawn('/bin/sh', ['-c', watch, path, ...args], { detached: true, stdio: 'ignore' })
  child.unref()
  const until = Date.now() + START_MS
  while (Date.now() < until) {
    const port = await runningPort(config, bot)
    if (port) return port
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  throw new Error('Chrome did not start within 10 seconds.')
}

// The page the bot works in: the first tab, or a new one.
async function pageSocket(port: number): Promise<string> {
  const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as { type: string; webSocketDebuggerUrl: string }[]
  const page = list.find((t) => t.type === 'page')
  if (page) return page.webSocketDebuggerUrl
  const created = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json() as { webSocketDebuggerUrl: string }
  return created.webSocketDebuggerUrl
}

export interface Page {
  send<T = Record<string, unknown>>(method: string, params?: Record<string, unknown>): Promise<T>
  evaluate<T>(expression: string): Promise<T>
  close(): void
}

// One CDP connection to the bot's page for one piece of work. With launch false it answers null when no browser runs,
// so looking at the browser never starts one.
export async function openPage(config: Config, bot: string, launch = true): Promise<Page | null> {
  const port = await runningPort(config, bot) ?? (launch ? await start(config, bot) : null)
  if (!port) return null
  const socket = new WebSocket(await pageSocket(port))
  await new Promise<void>((resolve, reject) => {
    socket.addEventListener('open', () => resolve(), { once: true })
    socket.addEventListener('error', () => reject(new Error('could not connect to Chrome')), { once: true })
  })
  let next = 0
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  socket.addEventListener('message', (event) => {
    const message = JSON.parse(String(event.data)) as { id?: number; result?: unknown; error?: { message: string } }
    const call = message.id === undefined ? undefined : waiting.get(message.id)
    if (!call) return
    waiting.delete(message.id!)
    if (message.error) call.reject(new Error(message.error.message))
    else call.resolve(message.result)
  })
  const send = <T>(method: string, params: Record<string, unknown> = {}) => new Promise<T>((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => {
      waiting.delete(id)
      reject(new Error(`${method} timed out`))
    }, CALL_MS)
    waiting.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v as T) }, reject: (e) => { clearTimeout(timer); reject(e) } })
    socket.send(JSON.stringify({ id, method, params }))
  })
  return {
    send,
    async evaluate<T>(expression: string) {
      const out = await send<{ result: { value?: T }; exceptionDetails?: { text: string; exception?: { description?: string } } }>(
        'Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (out.exceptionDetails) throw new Error(out.exceptionDetails.exception?.description ?? out.exceptionDetails.text)
      return out.result.value as T
    },
    close: () => socket.close(),
  }
}

// Ends every bot's Chrome, when taskq stops. Browser.close lets Chrome save its profile.
export async function closeBrowsers(config: Config): Promise<void> {
  const root = join(config.home, 'browser')
  if (!existsSync(root)) return
  await Promise.all(readdirSync(root).map(async (bot) => {
    const port = await runningPort(config, bot)
    if (!port) return
    try {
      const { webSocketDebuggerUrl } = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json() as { webSocketDebuggerUrl: string }
      const socket = new WebSocket(webSocketDebuggerUrl)
      await new Promise<void>((resolve) => {
        socket.addEventListener('open', () => { socket.send(JSON.stringify({ id: 1, method: 'Browser.close' })); setTimeout(resolve, 300) }, { once: true })
        socket.addEventListener('error', () => resolve(), { once: true })
      })
    } catch { /* already gone */ }
    // Wait for Chrome to exit, so its profile is written and the folder can be removed.
    const until = Date.now() + 5000
    while (Date.now() < until && await runningPort(config, bot)) await new Promise((resolve) => setTimeout(resolve, 100))
    await new Promise((resolve) => setTimeout(resolve, 300))
  }))
}
