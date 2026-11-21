import { api, mutate } from './api.js'
import { el } from './dom.js'
import { t } from './i18n.js'

import { RUNNABLE } from '../pure/board-drop.js'

export { RUNNABLE }

// The word says what happens: a finished task starts a new session, a login wait resumes its session.
const LABEL = {
  draft: 'Run now', ready: 'Run now', needs_auth: 'Resume and run', failed: 'Run again', cancelled: 'Run again', review: 'Run again', done: 'Run again',
}

// primary: the one primary action of a view (task detail). Elsewhere it is a ghost button.
// A task with no agent (owner) does not run: the server refuses it too.
export function runNowButton(task, { primary = false } = {}) {
  const runnable = RUNNABLE.includes(task.status)
  const reason = !runnable ? 'Already running' : task.owner ? undefined : 'Give the task to a bot first'
  return el('button', {
    type: 'button',
    class: primary ? 'run-now primary' : 'run-now',
    disabled: Boolean(reason),
    title: reason,
    'aria-label': `${runnable ? LABEL[task.status] : 'Run now'}: ${task.data.title ?? task.data.intent}`,
    // Without an owner bot the button says so on itself, not only in a tooltip.
    text: runnable && !task.owner ? t('task.needs_bot', 'Needs a bot') : runnable ? LABEL[task.status] : 'Run now',
    onclick: (event) => {
      event.stopPropagation()
      mutate(() => api.post(`/tasks/${task.id}/run`, {}), 'Run requested. It starts as soon as a slot is free.')
    },
  })
}
