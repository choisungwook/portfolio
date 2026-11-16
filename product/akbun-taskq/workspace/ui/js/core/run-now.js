import { api, mutate } from './api.js'
import { el } from './dom.js'

// Statuses the server lets a user start by hand (POST /tasks/:id/run). running and needs_approval are already running.
export const RUNNABLE = ['draft', 'ready', 'failed', 'needs_auth', 'review', 'done']

// The word says what happens: a finished task starts a new session, a login wait resumes its session.
const LABEL = {
  draft: 'Run now', ready: 'Run now', needs_auth: 'Resume and run', failed: 'Run again', review: 'Run again', done: 'Run again',
}

// primary: the one primary action of a view (task detail). Elsewhere it is a ghost button.
export function runNowButton(task, { primary = false } = {}) {
  const runnable = RUNNABLE.includes(task.status)
  return el('button', {
    type: 'button',
    class: primary ? 'run-now primary' : 'run-now',
    disabled: !runnable,
    title: runnable ? undefined : 'Already running',
    'aria-label': `${runnable ? LABEL[task.status] : 'Run now'}: ${task.data.title ?? task.data.intent}`,
    text: runnable ? LABEL[task.status] : 'Run now',
    onclick: (event) => {
      event.stopPropagation()
      mutate(() => api.post(`/tasks/${task.id}/run`, {}), 'Run requested. It starts as soon as a slot is free.')
    },
  })
}
