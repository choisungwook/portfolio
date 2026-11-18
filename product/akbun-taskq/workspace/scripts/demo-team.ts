import type { Db } from '../src/db/open.ts'
import { USER, postMessage, seedAgents, setAgentSession } from '../src/db/team.ts'
import { writePage } from '../src/db/wiki.ts'
import { DEFAULT_ROSTER } from '../src/team/roster.ts'

// Invented team traffic for the Team tab. No turn row is written, so the demo shows no spend and no running agent.
export function seedTeam(db: Db, taskId: string): void {
  seedAgents(db, DEFAULT_ROSTER)
  for (const name of ['lead', 'planner', 'coder']) setAgentSession(db, name, `demo-${name}`)
  const say = (sender: string, recipient: string, body: string, task_id?: string) => postMessage(db, { sender, recipient, body, task_id })
  const first = say(USER, 'lead', 'Add a retry limit to the export job in the demo repo and have it reviewed.')
  say('lead', 'planner', 'Goal: export job stops after 3 retries. Schedule a code task for coder and a review for reviewer. Report task ids.')
  say('planner', 'lead', `Created code task ${taskId} for coder. The security review is added automatically when it finishes.`, taskId)
  say('taskq', 'coder', `Task ${taskId} (code) ended: done; task status is now done.\nSummary: retry limit added; npm test passed (42 tests).`, taskId)
  say('coder', 'lead', 'Retry limit is in. Test command and output are in the task summary.', taskId)
  db.prepare('UPDATE team_messages SET read_at = created_at WHERE id >= ?').run(first)
  say('lead', USER, 'The export job now stops after 3 retries. Review found nothing blocking. One decision is yours: should a stopped job page someone?', taskId)
  writePage(db, {
    slug: 'projects/export-retry', title: 'Export job retry limit', author: 'lead', base_revision: 0,
    body: 'Goal: stop after 3 retries.\nOwner: coder (code), reviewer (review).\nStatus: done, waiting for the user on paging.\nSource: user message #1.',
  })
  writePage(db, {
    slug: 'repos/demo', title: 'Demo repository conventions', author: 'coder', base_revision: 0,
    body: 'Tests: npm test. Lint: none configured.\nSource: package.json scripts.',
  })
}
