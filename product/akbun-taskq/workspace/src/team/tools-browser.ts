import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { browserClick, browserOpen, browserRead, browserScreenshot, browserType } from '../browser/actions.ts'
import { sharedDir } from './shared.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

// The bot's own browser, the one its conversation shows on the right (src/browser/). The user watches and can click
// in it too. Errors come back as ToolError so the model reads why (no Chrome installed, a ref that went stale).
export function browserTools(scope: ScopedTools): TeamTool[] {
  const { config, agent } = scope
  const run = async <T extends Record<string, unknown>>(work: () => Promise<T>): Promise<T> => {
    try {
      return await work()
    } catch (error) {
      throw new ToolError(error instanceof Error ? error.message : String(error))
    }
  }
  return [
    {
      name: 'browser_open',
      description: 'Open a web page (http or https) in your browser, the one the user sees beside your conversation. Starts the browser on first use; cookies stay between turns. Then call browser_read to see the page.',
      input: { url: z.string().min(1).max(2000) },
      readOnly: false,
      handler: (args) => run(() => browserOpen(config, agent, String(args.url))),
    },
    {
      name: 'browser_read',
      description: 'Read the page open in your browser: url, title, its text (first 8,000 characters) and its links, buttons and fields, each with a ref such as e3 for browser_click and browser_type. Refs change when the page changes, so read again after acting.',
      input: {},
      readOnly: true,
      handler: () => run(() => browserRead(config, agent)),
    },
    {
      name: 'browser_click',
      description: 'Click an element of the page by the ref browser_read gave it. Waits for the page to load. Ask the user before a click that buys, sends, publishes or deletes something.',
      input: { ref: z.string().regex(/^e\d+$/) },
      readOnly: false,
      handler: (args) => run(() => browserClick(config, agent, String(args.ref))),
    },
    {
      name: 'browser_type',
      description: 'Type text into a field by its ref from browser_read, replacing what it held. submit true presses Enter afterwards. Never type passwords, card numbers or other credentials: ask the user to type those in the browser pane.',
      input: { ref: z.string().regex(/^e\d+$/), text: z.string().max(5000), submit: z.boolean().optional() },
      readOnly: false,
      handler: (args) => run(() => browserType(config, agent, String(args.ref), String(args.text), args.submit === true)),
    },
    {
      name: 'browser_screenshot',
      description: 'Save a PNG of what your browser shows into the shared folder (browser/<you>-<time>.png) and return its path, to look at it or send it to the user with send_message files.',
      input: {},
      readOnly: false,
      handler: () => run(async () => {
        const png = await browserScreenshot(config, agent)
        const dir = join(sharedDir(config), 'browser')
        mkdirSync(dir, { recursive: true })
        const name = `${agent}-${new Date().toISOString().replace(/[:.]/g, '-')}.png`
        writeFileSync(join(dir, name), png)
        return { path: `browser/${name}` }
      }),
    },
  ]
}
