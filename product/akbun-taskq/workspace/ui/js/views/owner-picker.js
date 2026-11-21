// The Assigned bot row of the task detail dialog: which bot the task belongs to, with a selector to give it to a bot or
// take it back. A task needs one to run. A done task, or one a run is working on, shows the bot without the selector.
import { api, mutate } from '../core/api.js'
import { el } from '../core/dom.js'
import { t } from '../core/i18n.js'

let agents = null

async function loadAgents() {
  try {
    const team = await api.get('/bots')
    agents = team.agents.filter((a) => a.enabled).map((a) => a.name)
  } catch {
    agents = []
  }
  return agents
}

export function ownerValue(task, onChange) {
  const cell = el('dd', { 'data-area': 'task-owner' })
  if (task.status === 'done' || task.status === 'running') {
    cell.append(task.owner ? `@${task.owner}` : t('owner.none_short', 'None'))
    return cell
  }
  const select = el('select', { 'aria-label': t('owner.label', 'Assigned bot') }, el('option', { value: '', text: t('owner.none', 'None (pick a bot to run it)') }))
  const fill = (names) => {
    for (const name of names) select.append(el('option', { value: name, text: name }))
    select.value = task.owner ?? ''
  }
  if (agents) fill(agents)
  else loadAgents().then(fill)
  select.addEventListener('change', async () => {
    const owner = select.value || null
    const ok = await mutate(() => api.post(`/bots/tasks/${task.id}/owner`, { owner }), owner ? `Given to ${owner}` : 'Taken back')
    if (ok) onChange()
    else select.value = task.owner ?? ''
  })
  cell.append(select)
  return cell
}
