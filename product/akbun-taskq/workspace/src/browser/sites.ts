import type { Db } from '../db/open.ts'
import { getMeta, setMeta } from '../db/meta.ts'

// The sites (host names) where the user let a bot click and type in its browser, as Claude Desktop asks once per site.
// Kept in meta per bot; the browser pane lists them and removes one.

const key = (bot: string) => `browser_sites:${bot}`

export function allowedSites(db: Db, bot: string): string[] {
  try {
    const list = JSON.parse(getMeta(db, key(bot)) ?? '[]') as unknown
    return Array.isArray(list) ? list.filter((s): s is string => typeof s === 'string') : []
  } catch {
    return []
  }
}

export function allowSite(db: Db, bot: string, host: string): void {
  setMeta(db, key(bot), JSON.stringify([...new Set([...allowedSites(db, bot), host.toLowerCase()])].sort()))
}

export function forgetSite(db: Db, bot: string, host: string): void {
  setMeta(db, key(bot), JSON.stringify(allowedSites(db, bot).filter((s) => s !== host.toLowerCase())))
}

// Actions that cannot be taken back. Like the ask-first commands this prevents accidents and is not a boundary: a
// button can be labelled any way. Korean and English labels, matched on the element's text, aria-label or link.
export const IRREVERSIBLE_ACTION = /\b(buy|purchase|pay|checkout|check out|order|place order|subscribe|send|submit|publish|post|tweet|share|delete|remove|destroy|transfer|confirm|sign up|register|unsubscribe|deploy|merge)\b|구매|결제|주문|구독|전송|보내기|제출|게시|발행|공유|삭제|제거|송금|이체|확인|가입|등록|탈퇴|배포|병합/i
