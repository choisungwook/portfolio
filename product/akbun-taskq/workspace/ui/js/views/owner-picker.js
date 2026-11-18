// Owner row of the task detail dialog: which team agent owns the task, with a selector to give it to another agent or
// take it back. Done and failed tasks show the owner without the selector.
import { api, mutate } from '../core/api.js'
import { el } from '../core/dom.js'

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
  const finished = task.status === 'done' || task.status === 'failed'
  if (finished) {
    cell.append(task.owner ?? 'user')
    return cell
  }
  const select = el('select', { 'aria-label': 'Owner' }, el('option', { value: '', text: 'user (no agent)' }))
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
