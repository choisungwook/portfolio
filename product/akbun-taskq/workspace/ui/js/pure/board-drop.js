// What dropping a card on another board column asks the server to do. Only moves the API already has are allowed, so a
// drop never sets a status by hand: anything else returns null and the column does not accept the card.

// Statuses the server lets a user start by hand (POST /tasks/:id/run). running and needs_approval are already running.
export const RUNNABLE = ['draft', 'ready', 'failed', 'cancelled', 'needs_auth', 'review', 'done']
const CANCELLABLE = ['running', 'needs_approval', 'needs_auth']

export function dropRequest(task, to) {
  const from = task.status
  const at = (action, body = {}) => ({ method: 'post', path: `/tasks/${task.id}/${action}`, body })
  if (from === to) return null
  if (to === 'running') return RUNNABLE.includes(from) && task.owner ? at('run') : null
  if (to === 'cancelled') return CANCELLABLE.includes(from) ? at('cancel') : null
  if (from === 'draft' && to === 'ready') return { method: 'patch', path: `/tasks/${task.id}`, body: { status: 'ready' } }
  if (from === 'needs_auth' && to === 'ready') return at('resume')
  if (from === 'review' && to === 'done') return at('done')
  if (from === 'failed' && to === 'ready') return at('retry')
  if (from === 'failed' && to === 'draft') return at('retry', { draft: true })
  return null
}
