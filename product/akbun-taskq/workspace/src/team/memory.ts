import type { Db } from '../db/open.ts'
import { mask } from '../mask.ts'

// A bot's memory: short notes to itself (preferences it learned, how a repository works, what to avoid), kept in
// team_agents.memory and sent with every turn. The Agent SDK has no per-session memory store a host can read and edit;
// its memory files load only from Claude settings, which bots do not read. So taskq keeps the memory, the bot edits it
// with the memory tools, and the user sees and edits the same text from the bot's menu. The wiki is for facts the whole
// team shares; memory is one bot's own.
export const MEMORY_LIMIT = 16_000

export function getMemory(db: Db, bot: string): string {
  return String(db.prepare('SELECT memory FROM team_agents WHERE name = ?').get(bot)?.memory ?? '')
}

export function setMemory(db: Db, bot: string, text: string): string | null {
  if (text.length > MEMORY_LIMIT) return `memory must be at most ${MEMORY_LIMIT} characters; keep only what still matters`
  const changed = db.prepare('UPDATE team_agents SET memory = ? WHERE name = ?').run(mask(text), bot).changes
  return changed === 1 ? null : `no bot named ${bot}`
}
