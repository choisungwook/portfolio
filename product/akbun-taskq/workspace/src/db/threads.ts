import { inTransaction, type Db } from './open.ts'
import { postMessage, type TeamMessage } from './team.ts'
import { nowSec } from '../time.ts'

// A discussion is where several agents look at one question. A task has one owner; a discussion has one moderator and
// several speakers who take turns in a fixed order for a fixed number of rounds. Speakers give views only; the
// moderator concludes and, if work follows, creates or assigns the tasks. The fixed order means two speakers never
// answer at once, and the round limit means a debate cannot run forever.

export interface Thread {
  id: number
  topic: string
  moderator: string
  participants: string[]
  rounds: number
  posts: number
  status: 'open' | 'concluding' | 'closed'
  conclusion: string | null
  wiki_slug: string | null
  created_at: number
  closed_at: number | null
}

function toThread(row: Record<string, unknown>): Thread {
  return { ...(row as unknown as Thread), participants: JSON.parse(String(row.participants)) as string[] }
}

export function getThread(db: Db, id: number): Thread | undefined {
  const row = db.prepare('SELECT * FROM team_threads WHERE id = ?').get(id)
  return row ? toThread(row) : undefined
}

export function listThreads(db: Db, limit: number): Thread[] {
  return db.prepare(`SELECT * FROM team_threads ORDER BY status = 'closed', id DESC LIMIT ?`).all(limit).map((row) => toThread(row))
}

export function openThreadCount(db: Db): number {
  return Number(db.prepare(`SELECT count(*) AS n FROM team_threads WHERE status != 'closed'`).get()?.n ?? 0)
}

export function speakerOf(thread: Thread): string | null {
  if (thread.status !== 'open') return null
  return thread.participants[thread.posts % thread.participants.length]
}

export function threadPosts(db: Db, id: number): TeamMessage[] {
  return db.prepare('SELECT * FROM team_messages WHERE thread_id = ? ORDER BY id').all(id) as unknown as TeamMessage[]
}

// Opens a thread and hands the floor to the first speaker.
export function openThread(db: Db, input: { topic: string; moderator: string; participants: string[]; rounds: number; context: string }): Thread {
  return inTransaction(db, () => {
    const id = Number(db.prepare(`INSERT INTO team_threads (topic, moderator, participants, rounds, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run(input.topic, input.moderator, JSON.stringify(input.participants), input.rounds, nowSec()).lastInsertRowid)
    postMessage(db, {
      sender: input.moderator, recipient: input.participants[0], thread_id: id,
      body: `Discussion #${id} opened: ${input.topic}\n\n${input.context}`,
    })
    return getThread(db, id)!
  })
}

// Records one contribution (or a pass) by the current speaker and gives the floor to the next one. After the last
// round the moderator is asked to conclude. Returns undefined when it is not this agent's turn.
export function takeTurn(db: Db, id: number, speaker: string, body: string): Thread | undefined {
  return inTransaction(db, () => {
    const thread = getThread(db, id)
    if (!thread || speakerOf(thread) !== speaker) return undefined
    const posts = thread.posts + 1
    const done = posts >= thread.rounds * thread.participants.length
    const next = done ? thread.moderator : thread.participants[posts % thread.participants.length]
    db.prepare(`UPDATE team_threads SET posts = ?, status = ? WHERE id = ?`).run(posts, done ? 'concluding' : 'open', id)
    const round = Math.floor((posts - 1) / thread.participants.length) + 1
    const header = done
      ? `Discussion #${id} finished its ${thread.rounds} rounds. As moderator, conclude it with conclude_discussion.`
      : `Discussion #${id}, round ${Math.floor(posts / thread.participants.length) + 1} of ${thread.rounds}: your turn.`
    postMessage(db, { sender: speaker, recipient: next, thread_id: id, body: `${header}\n\n[round ${round}, ${speaker}] ${body}` })
    return getThread(db, id)
  })
}

export function closeThread(db: Db, id: number, moderator: string, conclusion: string, wikiSlug: string | null): boolean {
  return db.prepare(`UPDATE team_threads SET status = 'closed', conclusion = ?, wiki_slug = ?, closed_at = ?
    WHERE id = ? AND moderator = ? AND status != 'closed'`).run(conclusion, wikiSlug, nowSec(), id, moderator).changes === 1
}

// A speaker whose turn ended without a contribution passes, so one silent agent cannot stall the thread.
export function passStalled(db: Db, speaker: string, threadIds: number[]): number[] {
  const passed: number[] = []
  for (const id of new Set(threadIds)) {
    const thread = getThread(db, id)
    if (thread && speakerOf(thread) === speaker && takeTurn(db, id, speaker, '(passed without a contribution)')) passed.push(id)
  }
  return passed
}
