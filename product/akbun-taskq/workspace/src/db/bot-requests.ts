import type { Db } from './open.ts'
import { inTransaction } from './open.ts'
import { postMessage, SYSTEM } from './team.ts'
import { raiseAlert } from '../alerts/rules.ts'
import { mask } from '../mask.ts'
import { nowSec } from '../time.ts'
import { teamChanged } from '../wake.ts'
import { allowSite } from '../browser/sites.ts'

// A call a bot waits on the user for: it needs approval before it runs.

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

// A call matched an ask-first rule. One open request per bot and command, so a retry does not stack requests.
export function requestApproval(db: Db, bot: string, tool: string, command: string, rule: string): BotApproval {
  return inTransaction(db, () => {
    const text = mask(command).slice(0, 4000)
    const open = db.prepare(`SELECT * FROM bot_approvals WHERE bot = ? AND tool = ? AND command = ? AND status = 'pending'`).get(bot, tool, text) as unknown as BotApproval | undefined
    if (open) {
      // The user acknowledged the alert without deciding: ask again, so the request does not wait unseen.
      const shown = db.prepare('SELECT 1 FROM alerts WHERE ref = ? AND acked_at IS NULL').get(`bot-approval:${open.id}`)
      if (!shown) raiseAlert(db, { task_id: null, kind: 'approval_required', message: `${bot} asks before running (${rule}): ${text.slice(0, 160)}`, ref: `bot-approval:${open.id}` })
      return open
    }
    const id = Number(db.prepare(`INSERT INTO bot_approvals (bot, tool, command, rule, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(bot, tool, text, rule, nowSec()).lastInsertRowid)
    raiseAlert(db, { task_id: null, kind: 'approval_required', message: `${bot} asks before running (${rule}): ${text.slice(0, 160)}`, ref: `bot-approval:${id}` })
    return db.prepare('SELECT * FROM bot_approvals WHERE id = ?').get(id) as unknown as BotApproval
  })
}

// An approved request lets exactly that call run once; using it marks it used. maxAgeSec, when given, ignores an
// approval decided longer ago than that.
export function consumeApproval(db: Db, bot: string, tool: string, command: string, maxAgeSec?: number): boolean {
  const since = maxAgeSec === undefined ? 0 : nowSec() - maxAgeSec
  const row = db.prepare(`SELECT id FROM bot_approvals WHERE bot = ? AND tool = ? AND command = ? AND status = 'approved' AND coalesce(decided_at, 0) >= ? ORDER BY id LIMIT 1`)
    .get(bot, tool, mask(command).slice(0, 4000), since)
  if (!row) return false
  db.prepare(`UPDATE bot_approvals SET status = 'used', used_at = ? WHERE id = ?`).run(nowSec(), row.id)
  return true
}

export function decideApprovalRequest(db: Db, id: number, approve: boolean): BotApproval | undefined {
  return inTransaction(db, () => {
    const row = db.prepare(`SELECT * FROM bot_approvals WHERE id = ? AND status = 'pending'`).get(id) as unknown as BotApproval | undefined
    if (!row) return undefined
    // A site request is not one call: approving it allows the bot to click and type on that site from now on.
    const site = row.tool === 'browser_site'
    if (approve && site) allowSite(db, row.bot, row.command)
    db.prepare(`UPDATE bot_approvals SET status = ?, decided_at = ? WHERE id = ?`).run(approve ? (site ? 'used' : 'approved') : 'denied', nowSec(), id)
    db.prepare(`UPDATE alerts SET acked_at = ? WHERE ref = ? AND acked_at IS NULL`).run(nowSec(), `bot-approval:${id}`)
    postMessage(db, {
      sender: SYSTEM, recipient: row.bot,
      body: approve && site
        ? `The user allowed you to click and type on ${row.command} in your browser (request #${id}). Read the page again and go on.`
        : approve
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
