import type { Db } from '../src/db/open.ts'
import { USER, createAgent, postMessage, seedAgents, setAgentSession } from '../src/db/team.ts'
import { writePage } from '../src/db/wiki.ts'
import { BOT_DEFAULTS, PRESETS, ROSTER } from '../src/team/roster.ts'
import { openThread, takeTurn } from '../src/db/threads.ts'

// Invented bot traffic for the Bots list and conversations. The demo bots are the presets, as a user would create them;
// the reviewer has a sandbox and a blocked command so its settings show both. No turn row is written, so the demo shows no spend and no running agent.
export function seedTeam(db: Db, taskId: string, openTaskIds: string[]): void {
  seedAgents(db, ROSTER)
  for (const [name, preset] of Object.entries(PRESETS)) {
    createAgent(db, name, { ...BOT_DEFAULTS, ...preset, ...(name === 'reviewer' ? { sandbox: true, blocked_commands: ['git push*'] } : {}) })
  }
  for (const name of ['taskq', 'planner', 'coder']) setAgentSession(db, name, `demo-${name}`)
  const say = (sender: string, recipient: string, body: string, task_id?: string) => postMessage(db, { sender, recipient, body, task_id })
  const first = say(USER, 'taskq', 'Add a retry limit to the export job in the demo repo and have it reviewed.')
  say('taskq', 'planner', 'Goal: export job stops after 3 retries. Schedule a code task for coder and a review for reviewer. Report task ids.')
  say('planner', 'taskq', `Created code task ${taskId} for coder. The security review is added automatically when it finishes.`, taskId)
  say('queue', 'coder', `Task ${taskId} (code) ended: done; task status is now done.\nSummary: retry limit added; npm test passed (42 tests).`, taskId)
  say('coder', 'taskq', 'Retry limit is in. Test command and output are in the task summary.', taskId)
  db.prepare('UPDATE team_messages SET read_at = created_at WHERE id >= ?').run(first)
  say('taskq', USER, 'The export job now stops after 3 retries. Review found nothing blocking. One decision is yours: should a stopped job page someone?', taskId)
  writePage(db, {
    slug: 'projects/export-retry', title: 'Export job retry limit', author: 'taskq', base_revision: 0,
    body: 'Goal: stop after 3 retries.\nOwner: coder (code), reviewer (review).\nStatus: done, waiting for the user on paging.\nRepository notes: [[repos/demo]]. Paging question: [[decisions/paging]].\nSource: user message #1.',
  })
  writePage(db, {
    slug: 'repos/demo', title: 'Demo repository conventions', author: 'coder', base_revision: 0,
    body: 'Tests: npm test. Lint: none configured.\nSource: package.json scripts.',
  })
  writePage(db, {
    slug: 'decisions/paging', title: 'Should a stopped export job page someone?', author: 'taskq', base_revision: 0,
    body: 'Open. Discussion #1 recommends a ticket, not a page, because a retry stop is not an outage.\nWaiting for the user.',
  })
  // Each open demo task gets one owner, so the Board badges and the Team tab show who holds what.
  const ownerOf: Record<string, string> = { code: 'coder', security_review: 'reviewer', research: 'doc-reviewer', ops_read: 'planner', ops_change: 'planner' }
  for (const id of openTaskIds) db.prepare(`UPDATE tasks SET owner = ? WHERE id = ?`).run(ownerOf[String(db.prepare('SELECT type FROM tasks WHERE id = ?').get(id)?.type)] ?? 'planner', id)
  const thread = openThread(db, {
    topic: 'Should a stopped export job page someone?', moderator: 'taskq', participants: ['reviewer', 'planner'], rounds: 1,
    context: 'The job now stops after 3 retries. Is that an incident?',
  })
  takeTurn(db, thread.id, 'reviewer', 'A ticket is enough: data is intact and the next run retries. A page trains people to ignore pages.')
  db.prepare('UPDATE team_messages SET read_at = created_at WHERE thread_id = ?').run(thread.id)
  postMessage(db, { sender: 'planner', recipient: 'planner', body: 'Check whether the nightly export ran.', deliver_at: Math.floor(Date.now() / 1000) + 8 * 3600 })
  // One bot is shown working: an open turn that started 42 seconds ago. The demo runs no hub, so it stays open.
  db.prepare('INSERT INTO team_turns (agent, session_id, started_at) VALUES (?, ?, ?)').run('planner', 'demo-planner', Math.floor(Date.now() / 1000) - 42)
}
