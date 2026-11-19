import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { postMessage, SYSTEM } from './team.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'

// Things a bot waits on the user for: a call that needs approval before it runs, and a login only the user can do.

export interface BotApproval {
  id: number
  bot: string
  tool: string
  command: string
  rule: string
  status: 'pending' | 'approved' | 'denied' | 'used'
  created_at: number
  decided_at: number | null
}

export interface BotLogin {
  id: number
  bot: string
  what: string
  how: string
  created_at: number
  done_at: number | null
}

// A call matched an ask-first rule. One open request per bot and command, so a retry does not stack requests.
export function requestApproval(db: Db, bot: string, tool: string, command: string, rule: string): BotApproval {
  return inTransaction(db, () => {
    const text = mask(command).slice(0, 4000)
    const open = db.prepare(`SELECT * FROM bot_approvals WHERE bot = ? AND tool = ? AND command = ? AND status = 'pending'`).get(bot, tool, text)
    if (open) return open as unknown as BotApproval
    const id = Number(db.prepare(`INSERT INTO bot_approvals (bot, tool, command, rule, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(bot, tool, text, rule, nowSec()).lastInsertRowid)
    raiseAlert(db, { task_id: null, kind: 'approval_required', message: `${bot} asks before running (${rule}): ${text.slice(0, 160)}`, ref: `bot-approval:${id}` })
    return db.prepare('SELECT * FROM bot_approvals WHERE id = ?').get(id) as unknown as BotApproval
  })
}

// An approved request lets exactly that call run once; using it marks it used.
export function consumeApproval(db: Db, bot: string, tool: string, command: string): boolean {
  const row = db.prepare(`SELECT id FROM bot_approvals WHERE bot = ? AND tool = ? AND command = ? AND status = 'approved' ORDER BY id LIMIT 1`)
    .get(bot, tool, mask(command).slice(0, 4000))
  if (!row) return false
  db.prepare(`UPDATE bot_approvals SET status = 'used', used_at = ? WHERE id = ?`).run(nowSec(), row.id)
  return true
}

export function decideApprovalRequest(db: Db, id: number, approve: boolean): BotApproval | undefined {
  return inTransaction(db, () => {
    const row = db.prepare(`SELECT * FROM bot_approvals WHERE id = ? AND status = 'pending'`).get(id) as unknown as BotApproval | undefined
    if (!row) return undefined
    db.prepare(`UPDATE bot_approvals SET status = ?, decided_at = ? WHERE id = ?`).run(approve ? 'approved' : 'denied', nowSec(), id)
    db.prepare(`UPDATE alerts SET acked_at = ? WHERE ref = ? AND acked_at IS NULL`).run(nowSec(), `bot-approval:${id}`)
    postMessage(db, {
      sender: SYSTEM, recipient: row.bot,
      body: approve
        ? `The user approved request #${id}. You may now run this exact ${row.tool} call once:\n${row.command}`
        : `The user denied request #${id} (${row.tool}: ${row.command.slice(0, 200)}). Do not run it; find another way or report what is blocked.`,
    })
    teamChanged.notify()
    return { ...row, status: approve ? 'approved' : 'denied' }
  })
}

export function openApprovals(db: Db): BotApproval[] {
  return db.prepare(`SELECT * FROM bot_approvals WHERE status = 'pending' ORDER BY id`).all() as unknown as BotApproval[]
}

// A login wall: the bot stops getting turns until the user says they signed in (or cancels the request).
export function requestLogin(db: Db, bot: string, what: string, how: string): BotLogin {
  return inTransaction(db, () => {
    const open = db.prepare('SELECT * FROM bot_logins WHERE bot = ? AND done_at IS NULL').get(bot)
    if (open) return open as unknown as BotLogin
    const id = Number(db.prepare('INSERT INTO bot_logins (bot, what, how, created_at) VALUES (?, ?, ?, ?)')
      .run(bot, mask(what).slice(0, 300), mask(how).slice(0, 1000), nowSec()).lastInsertRowid)
    raiseAlert(db, { task_id: null, kind: 'auth_required', message: `${bot} needs you to sign in: ${what.slice(0, 160)}`, ref: `bot-login:${id}` })
    return db.prepare('SELECT * FROM bot_logins WHERE id = ?').get(id) as unknown as BotLogin
  })
}

export function finishLogin(db: Db, id: number, signedIn: boolean): BotLogin | undefined {
  return inTransaction(db, () => {
    const row = db.prepare('SELECT * FROM bot_logins WHERE id = ? AND done_at IS NULL').get(id) as unknown as BotLogin | undefined
    if (!row) return undefined
    db.prepare('UPDATE bot_logins SET done_at = ?, cancelled = ? WHERE id = ?').run(nowSec(), signedIn ? 0 : 1, id)
    db.prepare(`UPDATE alerts SET acked_at = ? WHERE ref = ? AND acked_at IS NULL`).run(nowSec(), `bot-login:${id}`)
    postMessage(db, {
      sender: SYSTEM, recipient: row.bot,
      body: signedIn
        ? `The user signed in (${row.what}). Continue where you stopped.`
        : `The user will not sign in for "${row.what}" now. Do not wait for it; report what is blocked.`,
    })
    teamChanged.notify()
    return row
  })
}

export function openLogins(db: Db): BotLogin[] {
  return db.prepare('SELECT * FROM bot_logins WHERE done_at IS NULL ORDER BY id').all() as unknown as BotLogin[]
}
