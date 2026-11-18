// Shared names for statuses, outcomes, types and alert kinds, plus helpers that read JSON text fields.
export const BOARD_COLUMNS = ['ready', 'running', 'needs_approval', 'needs_auth', 'review', 'done']
export const COLLAPSED_COLUMNS = ['draft', 'failed', 'cancelled']
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
export const label = (value) => WORDS[value] ?? String(value ?? '').replaceAll('_', ' ')

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
