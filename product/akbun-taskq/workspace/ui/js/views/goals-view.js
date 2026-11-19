// Goals: give the bots an objective and a done-when condition instead of a task list. The orchestrator (taskq) splits
// it into tasks for the bots that fit, they hand work to each other, and it closes the goal with a summary.
import { api, mutate } from '../core/api.js'
import { on } from '../core/bus.js'
import { area, el, fill } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { show } from '../core/nav.js'

let root

export function initGoalsView() {
  root = area('goals-view')
  on('tab', (name) => {
    if (name === 'goals') render()
  })
}

async function render() {
  let goals = []
  try {
    goals = await api.get('/goals')
  } catch (error) {
    fill(root, el('p', { class: 'error', text: error.message }))
    return
  }
  const objective = el('textarea', { rows: 3, maxlength: 4000, required: true, placeholder: t('goals.objective_ph', 'Ship the export retry fix to production'), 'aria-label': t('goals.objective', 'Objective') })
  const doneWhen = el('input', { type: 'text', maxlength: 2000, required: true, placeholder: t('goals.done_ph', 'The fix is merged, deployed, and the export job passed twice'), 'aria-label': t('goals.done_when', 'Done when') })
  const form = el('form', { class: 'goal-form', onsubmit: async (event) => {
    event.preventDefault()
    const made = await mutate(() => api.post('/goals', { objective: objective.value, done_when: doneWhen.value }), t('goals.given', 'Given to taskq'))
    if (made) render()
  } },
  el('label', {}, t('goals.objective', 'Objective'), objective),
  el('label', {}, t('goals.done_when', 'Done when'), doneWhen),
  el('button', { type: 'submit', text: t('goals.give', 'Give to the bots') }))
  fill(root,
    el('div', { class: 'wf-head' }, el('h2', { text: t('nav.goals', 'Goals') })),
    el('p', { class: 'meta', text: t('goals.hint', 'Give an objective, not a task list. taskq splits it into tasks for the bots that fit, they pass work to each other, and you are asked only for decisions that are yours. taskq closes the goal with a summary when the done-when condition holds.') }),
    form,
    goals.length === 0 ? el('p', { class: 'meta', text: t('goals.none', 'No goals yet.') }) : el('ul', { class: 'goal-list' }, ...goals.map(goalItem)))
}

function goalItem(goal) {
  return el('li', { class: 'goal', dataset: { status: goal.status } },
    el('div', { class: 'conn-head' },
      el('strong', { text: `#${goal.id} ${goal.objective}` }),
      el('span', { class: 'wf-status', dataset: { status: goal.status === 'done' ? 'succeeded' : goal.status === 'dropped' ? 'cancelled' : 'running' }, text: goal.status })),
    el('p', { class: 'meta', text: `${t('goals.done_when', 'Done when')}: ${goal.done_when} · ${fmtDateTime(goal.created_at)}` }),
    goal.summary ? el('p', { text: goal.summary }) : null,
    goal.status === 'open'
      ? el('div', { class: 'conn-actions' },
        el('button', { type: 'button', class: 'quiet', text: t('goals.open_taskq', 'Open taskq'), onclick: () => show('bot', 'taskq') }),
        el('button', { type: 'button', class: 'quiet', text: t('goals.drop', 'Drop'), onclick: async () => {
          if (await mutate(() => api.post(`/goals/${goal.id}/close`, { status: 'dropped', summary: 'dropped by the user' }), t('goals.dropped', 'Dropped'))) render()
        } }))
      : null)
}
