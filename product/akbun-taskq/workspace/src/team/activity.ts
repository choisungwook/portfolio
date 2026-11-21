import { execFile } from 'node:child_process'
import type { Db } from '../db/open.ts'
import { TASK_TITLE_SQL } from '../db/tasks.ts'
import { nowSec } from '../time.ts'

// What a bot's conversation shows on its right: the pull requests it opened that are still open, so the user can
// review them at once, and its background work: the tasks it owns that are not finished and the other bots working on
// what it sent them in their current turn (its sub-sessions).

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/g
const PR_LIMIT = 20
const CACHE_SEC = 60
const FINISHED_WINDOW_SEC = 24 * 3600

export interface PullRequest { url: string; number: number; title: string | null; state: 'OPEN' | 'unknown' }
export type PrState = (url: string) => Promise<{ state: string; title: string } | null>

// The PR links in these texts, newest text first, each once.
export function pullRequestUrls(texts: string[]): string[] {
  const seen = new Set<string>()
  for (const text of texts) for (const url of text.match(PR_URL) ?? []) seen.add(url)
  return [...seen].slice(0, PR_LIMIT)
}

// gh answers for the signed-in user; without gh (or offline) the state is unknown and the link is still shown.
const cache = new Map<string, { at: number; value: { state: string; title: string } | null }>()
export const ghPrState: PrState = (url) => {
  const hit = cache.get(url)
  if (hit && nowSec() - hit.at < CACHE_SEC) return Promise.resolve(hit.value)
  return new Promise((resolve) => {
    execFile('gh', ['pr', 'view', url, '--json', 'state,title'], { timeout: 8000 }, (error, stdout) => {
      let value: { state: string; title: string } | null = null
      try {
        if (!error) value = JSON.parse(stdout) as { state: string; title: string }
      } catch { /* unreadable answer: unknown */ }
      cache.set(url, { at: nowSec(), value })
      resolve(value)
    })
  })
}

export async function botActivity(db: Db, name: string, prState: PrState = ghPrState) {
  const texts = [
    ...db.prepare(`SELECT body FROM team_messages WHERE sender = ? OR recipient = ? ORDER BY id DESC LIMIT 300`).all(name, name).map((r) => String(r.body)),
    ...db.prepare(`SELECT r.summary FROM runs r JOIN tasks t ON t.id = r.task_id WHERE t.owner = ? AND r.summary IS NOT NULL
      ORDER BY r.started_at DESC LIMIT 100`).all(name).map((r) => String(r.summary)),
  ]
  const states = await Promise.all(pullRequestUrls(texts).map(async (url) => ({ url, info: await prState(url) })))
  const pull_requests: PullRequest[] = states
    .filter(({ info }) => !info || info.state === 'OPEN')
    .map(({ url, info }) => ({ url, number: Number(url.split('/').at(-1)), title: info?.title ?? null, state: info ? 'OPEN' : 'unknown' }))
  const background = db.prepare(`SELECT t.id, t.status, ${TASK_TITLE_SQL} FROM tasks t
    WHERE t.owner = ? AND t.status NOT IN ('done', 'failed', 'cancelled') ORDER BY t.updated_at DESC LIMIT 50`).all(name)
  const finished = Number(db.prepare(`SELECT count(*) AS n FROM tasks WHERE owner = ? AND status IN ('done', 'failed', 'cancelled') AND updated_at >= ?`)
    .get(name, nowSec() - FINISHED_WINDOW_SEC)?.n ?? 0)
  const sub_sessions = db.prepare(`SELECT t.agent, t.started_at FROM team_turns t WHERE t.ended_at IS NULL AND t.agent != ?
    AND EXISTS (SELECT 1 FROM team_messages m WHERE m.turn_id = t.id AND m.sender = ?) ORDER BY t.started_at`).all(name, name)
  return { pull_requests, background, finished, sub_sessions }
}
