// Workflow row of the task detail dialog: which workflow the owner bot runs for this task, a selector to change it while
// the task is not finished, and the task's workflow runs with their status (each opens in the Workflows view).
import { api, mutate, qs } from '../core/api.js'
import { el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { t } from '../core/i18n.js'

export function workflowValue(task, onChange) {
  const cell = el('dd', { 'data-area': 'task-workflow' })
  const finished = ['done', 'failed', 'cancelled', 'running'].includes(task.status)
  const current = task.data.workflow_id || ''
  const select = el('select', { 'aria-label': t('wf.workflow', 'Workflow'), disabled: finished }, el('option', { value: '', text: t('wf.none', 'none') }))
  api.get('/workflows?deleted=1').then((workflows) => {
    for (const w of workflows) {
      if (w.deleted_at !== null && w.id !== current) continue
      select.append(el('option', { value: w.id, text: w.deleted_at !== null ? `${w.name} (${t('wf.deleted_badge', 'deleted')})` : w.name }))
    }
    select.value = current
  }).catch(() => {})
  select.addEventListener('change', async () => {
    const ok = await mutate(() => api.patch(`/tasks/${task.id}`, { workflow_id: select.value || null }), t('wf.saved', 'Saved'))
    if (ok) onChange()
    else select.value = current
  })
  cell.append(select)
  if (current && !task.owner) cell.append(el('p', { class: 'meta', text: t('wf.needs_bot', 'Only a bot runs workflows: pick the bot that runs it.') }))
  const runs = el('ul', { class: 'task-wf-runs' })
  cell.append(runs)
  api.get(`/workflow-runs${qs({ task: task.id, limit: 10 })}`).then((list) => {
    runs.append(...list.map((r) => el('li', {}, el('button', {
      type: 'button', class: 'link', onclick: () => emit('open-workflow-run', r.id),
      text: `${r.workflow_name}${r.workflow_deleted ? ` (${t('wf.deleted_badge', 'deleted')})` : ''} · ${r.bot} · ${t(`wf.status.${r.status}`, r.status)}`,
    }))))
  }).catch(() => {})
  return cell
}
