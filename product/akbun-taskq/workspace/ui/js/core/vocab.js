import { currentLanguage, KO_WORDS } from './i18n.js'
// Shared names for statuses, outcomes, types and alert kinds, plus helpers that read JSON text fields.
// The board in three panes: drafts on the left as an inbox, the statuses a task moves through in the middle (two rows),
// and where it ends on the right: failed above (cancelled folded under it), done below.
export const BOARD_PANES = { inbox: ['draft'], flow: ['ready', 'running', 'needs_approval', 'needs_auth', 'review'], ends: ['failed', 'cancelled', 'done'] }
// The middle pane has two columns: running, and one waiting column for every status that waits on the queue or the user.
export const BOARD_WAITING = ['ready', 'needs_approval', 'needs_auth', 'review']
export const COLLAPSED_COLUMNS = ['cancelled']
// Outcomes of a last run that the board marks with an error icon.
export const ERROR_OUTCOMES = ['failed', 'stale']
export const TASK_TYPES = ['ops_read', 'ops_change', 'code', 'research', 'security_review']
export const OUTCOMES = ['done', 'failed', 'needs_approval', 'needs_auth', 'review', 'stale']
export const SEVERITY_RANK = { critical: 0, high: 1, normal: 2 }

// Short text marker shown next to each type, so type is not only a color.
export const TYPE_MARK = {
  ops_read: 'Read account', ops_change: 'Change account', code: 'Code', research: 'Research', security_review: 'Security review',
}

// Which task status enables each action button. Approve and Deny live in the approval panel only.
export const ACTION_STATUS = { resume: 'needs_auth', done: 'review' }

// Plain words for the identifiers the API uses. Anything not listed is shown with underscores as spaces.
const WORDS = {
  draft: 'Draft', ready: 'Queued', running: 'Running', done: 'Done', failed: 'Failed',
  cancelled: 'Cancelled', needs_approval: 'Waiting for approval', needs_auth: 'Login needed', review: 'Ready to review', stale: 'Interrupted',
  ops_read: 'Read account', ops_change: 'Change account', code: 'Code', research: 'Research',
  security_review: 'Security review',
  critical: 'Critical', high: 'High', normal: 'Normal',
  approval_required: 'Approval needed', security_finding: 'Security finding', prod_touch: 'Production error',
  worker_flag: 'Flagged by the agent', auth_required: 'Login needed', stale_repeat: 'Interrupted repeatedly',
  budget_exceeded: 'Budget exceeded', review_ready: 'Ready to review', proposal_pending: 'Proposal waiting',
  team_message: 'Message from a bot', team_paused: 'Bots paused',
  blocks: 'Blocks', discovered_from: 'Found while working on', memory: 'Memory note', skill: 'Skill note',
  pending: 'Waiting', applied: 'Applied', rejected: 'Rejected',
}
export const label = (value) => (currentLanguage() === 'ko' ? KO_WORDS[value] : undefined) ?? WORDS[value] ?? String(value ?? '').replaceAll('_', ' ')

// Run fields like stats and task_data come back as JSON text. Accepts text or already-parsed values.
export function parseField(value, fallback) {
  if (value === null || value === undefined) return fallback
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

export const outcomeOf = (run) => run.outcome ?? 'running'
