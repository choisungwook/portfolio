import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import { browserClick, browserOpen, browserRead, browserScreenshot, browserTarget, browserType } from '../browser/actions.ts'
import { allowedSites, IRREVERSIBLE_ACTION } from '../browser/sites.ts'
import { consumeApproval, requestApproval } from '../db/bot-requests.ts'
import { sharedDir } from './shared.ts'
import { ToolError, type ScopedTools, type TeamTool } from './tools.ts'

// The bot's own browser, the one its conversation shows on the right (src/browser/). The user watches and can click
// in it too. Errors come back as ToolError so the model reads why (no Chrome installed, a ref that went stale).
//
// Clicking and typing pass a gate, as in Claude Desktop. Opening and reading pages do not.
// 1. A site the user has not allowed for this bot: the action does not run and a "browser site" request waits in Must
//    check. Approving it allows the site for good (the browser pane lists and removes allowed sites).
// 2. On an allowed site, an action that looks irreversible (buy, pay, send, publish, delete, …, in Korean too) waits
//    for a one-time approval of exactly that action, named by its label and page so a new ref still matches.
// 3. Typing into a password field is always refused.
// An approved web action must be used soon: a list of identical Delete buttons should not let an approval from
// yesterday, or for another row, run later.
const APPROVAL_FRESH_SEC = 15 * 60

export function browserTools(scope: ScopedTools): TeamTool[] {
  const { config, agent, db } = scope
  const gate = async (ref: string, typing?: { text: string; submit: boolean }) => {
    const target = await browserTarget(config, agent, ref)
    if (typing && target.type === 'password') throw new Error('Bots never type passwords. Ask the user to type it in the browser pane.')
    if (!allowedSites(db, agent).includes(target.host)) {
      const request = requestApproval(db, agent, 'browser_site', target.host, 'browser site')
      throw new Error(`Clicking and typing on ${target.host} needs the user's approval first, as on every new site. Request #${request.id} is waiting in the user's Must check list. Do not retry now: you will get a message when it is decided. You may still open and read pages.`)
    }
    const action = typing
      ? `type into "${target.label}"${typing.submit ? ' and press Enter' : ''} on ${target.page}: ${typing.text}`
      : `click "${target.label}" (${target.tag}) on ${target.page}`
    // Enter in a textarea or an editable box is how chats and comments send, so submitting there always asks; in a plain
    // field it asks when the field, or the button its form would press, looks irreversible.
    const risky = typing
      ? typing.submit && (target.editable || IRREVERSIBLE_ACTION.test(`${target.label} ${target.form}`))
      : IRREVERSIBLE_ACTION.test(`${target.label} ${target.href}`)
    if (risky && !consumeApproval(db, agent, 'browser_action', action, APPROVAL_FRESH_SEC)) {
      const request = requestApproval(db, agent, 'browser_action', action, 'irreversible web action')
      throw new Error(`This looks like an action that cannot be taken back, so it needs the user's approval: ${action}. Request #${request.id} is waiting in the user's Must check list. Do not retry now; once approved, read the page again and do exactly this once.`)
    }
  }
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
      description: 'Open a web page (http or https) in your browser, the one the user sees beside your conversation. Starts the browser on first use; the page and cookies stay between turns while taskq runs. Then call browser_read to see the page.',
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
      description: 'Click an element of the page by the ref browser_read gave it. Waits for the page to load. The first click or typing on a site waits for the user to allow that site, and a click that looks irreversible (buy, pay, send, publish, delete) waits for the user to approve it once; you get a message when they decide.',
      input: { ref: z.string().regex(/^e\d+$/) },
      readOnly: false,
      handler: (args) => run(async () => {
        await gate(String(args.ref))
        return browserClick(config, agent, String(args.ref))
      }),
    },
    {
      name: 'browser_type',
      description: 'Type text into a field by its ref from browser_read, replacing what it held. submit true presses Enter afterwards. Same approval as browser_click: a new site, or submit on a field that sends or pays. Password fields are refused; never type card numbers or other credentials either: ask the user to type those in the browser pane.',
      input: { ref: z.string().regex(/^e\d+$/), text: z.string().max(5000), submit: z.boolean().optional() },
      readOnly: false,
      handler: (args) => run(async () => {
        await gate(String(args.ref), { text: String(args.text), submit: args.submit === true })
        return browserType(config, agent, String(args.ref), String(args.text), args.submit === true)
      }),
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
