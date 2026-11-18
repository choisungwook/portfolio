// Operator controls in the task detail: Cancel for running, needs_approval and needs_auth tasks (a second click
// confirms), and Retry for failed tasks with a resume checkbox. The armed cancel and the checkbox survive a redraw.
import { api, mutate } from '../core/api.js'
import { el } from '../core/dom.js'

export const CANCELLABLE_STATUS = ['running', 'needs_approval', 'needs_auth']
const ARM_MS = 5000

let armedTask = null
let resumeNext = false

// redraw re-renders the detail, so the armed state shows and disarms on time.
export function operatorControls(task, redraw) {
  const parts = []
  if (CANCELLABLE_STATUS.includes(task.status)) parts.push(cancelControl(task, redraw))
  if (task.status === 'failed' || task.status === 'cancelled') parts.push(retryControl(task))
  return parts.length > 0 ? el('div', { class: 'operator', dataset: { area: 'operator-controls' } }, ...parts) : null
}

function cancelControl(task, redraw) {
  const armed = armedTask === task.id
  const button = el('button', {
    type: 'button',
    class: 'danger',
    dataset: { area: 'cancel-task', armed: armed ? 'true' : 'false' },
    text: armed ? 'Confirm cancel' : 'Cancel task',
    onclick: () => onCancel(task.id, redraw),
  })
  const note = el('span', { class: 'meta', text: armed ? 'Stops the run now. The task ends as failed, and no alert is raised.' : '' })
  return el('span', { class: 'cancel-control' }, button, note)
}

function onCancel(id, redraw) {
  if (armedTask !== id) {
    armedTask = id
    setTimeout(() => {
      if (armedTask !== id) return
      armedTask = null
      redraw()
    }, ARM_MS)
    redraw()
    return
  }
  armedTask = null
  mutate(() => api.post(`/tasks/${id}/cancel`, {}), 'Cancel requested')
}

function retryControl(task) {
  const box = el('input', { type: 'checkbox', name: 'resume', dataset: { area: 'retry-resume' } })
  box.checked = resumeNext
  box.addEventListener('change', () => {
    resumeNext = box.checked
  })
  return el('span', { class: 'retry-control' },
    el('label', {}, box, ' Resume previous session'),
    el('button', {
      type: 'button',
      dataset: { area: 'retry-task' },
      text: 'Retry',
      onclick: () => mutate(() => api.post(`/tasks/${task.id}/retry`, { resume: resumeNext }), 'Task is ready to run again'),
    }))
}
