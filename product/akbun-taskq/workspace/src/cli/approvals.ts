import { createInterface } from 'node:readline/promises'
import { parseArgs } from 'node:util'
import type { Db } from '../db/open.ts'
import { ApprovalError, decideApproval, openApproval, type PendingApproval } from '../db/approvals.ts'

// Control characters and invisible or bidi format characters are shown as escapes, so the operator reads what runs.
export function escapeControls(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, (char) => `\\x${char.charCodeAt(0).toString(16).padStart(2, '0')}`)
    .replace(/[\u00ad\u061c\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, (char) =>
      `\\u{${char.charCodeAt(0).toString(16)}}`)
}

export function printPending(pending: PendingApproval): void {
  const json = JSON.stringify(pending.input, null, 2) ?? 'null'
  console.log(`request ${pending.request_id}  tool ${pending.tool}  ${pending.bytes} bytes`)
  console.log(escapeControls(json))
}

// approve and deny print the exact pending input first. A terminal asks; a script passes --request and --yes.
export async function decideFromCli(db: Db, args: string[], approve: boolean): Promise<void> {
  const { positionals, values } = parseArgs({
    args, strict: true, allowPositionals: true,
    options: { request: { type: 'string' }, yes: { type: 'boolean' } },
  })
  const id = positionals[0]
  if (!id) throw new Error('task id is required')
  const interactive = process.stdin.isTTY === true
  if (!interactive && (values.request === undefined || !values.yes)) {
    throw new Error('non-interactive use needs --request <request_id> --yes')
  }
  const pending = openApproval(db, id)
  if (!pending) throw new Error(`no pending approval for ${id}`)
  if (values.request !== undefined && values.request !== pending.request_id) {
    throw new Error('request_id is not the open approval request')
  }
  printPending(pending)
  if (!values.yes && !(await confirm(approve ? 'Approve this? [y/N] ' : 'Deny this? [y/N] '))) {
    console.log('not decided')
    return
  }
  try {
    decideApproval(db, id, pending.request_id, approve)
  } catch (error) {
    if (error instanceof ApprovalError) throw new Error(error.message)
    throw error
  }
  console.log(approve ? 'approved' : 'denied')
}

async function confirm(question: string): Promise<boolean> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
}
