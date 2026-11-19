// Task detail dialog, kept to what is needed to act: title, status, owner and workflow, the state buttons, the pending
// approval, intent, files, runs and alerts. Events, dependencies and handoffs stay in the API and CLI.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'
import { ACTION_STATUS, label, outcomeOf } from '../core/vocab.js'
import { statusIndicator } from '../core/status.js'
import { runNowButton } from '../core/run-now.js'
import { approvalPanel } from './approval-panel.js'
import { ownerValue } from './owner-picker.js'
import { workflowValue } from './task-workflow.js'
import { workspacePanel } from './task-workspace.js'
import { download } from './bot-chat.js'
import { operatorControls } from './operator-controls.js'

let dialog
let body
let currentId = null
let focusApproval = false

export function initTaskDetail() {
  dialog = area('task-detail')
  body = area('task-body')
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  on('open-workflow-run', () => dialog.close())
  on('open-task', openTask)
  // The Review button on an approval alert or in the must-check list: open the task at its approval panel.
  on('review-approval', (id) => {
    focusApproval = true
    openTask(id)
  })
  on('refresh', () => {
    if (dialog.open && currentId) fill(currentId)
  })
}

async function openTask(id) {
  currentId = id
  if (!dialog.open) dialog.showModal()
  await fill(id)
}

async function fill(id) {
  try {
    const task = await api.get(`/tasks/${id}`)
    if (id !== currentId) return
    const refill = () => { if (dialog.open && currentId === task.id) fill(task.id) }
    const aside = workspacePanel(task, refill)
    clear(body).append(el('div', { class: aside ? 'task-detail-grid' : '' },
      el('div', { class: 'task-main' }, ...sections(task).filter(Boolean)), aside))
    dialog.classList.toggle('wide', Boolean(aside))
    if (focusApproval) {
      focusApproval = false
      scrollToApproval()
    }
  } catch (error) {
    if (id === currentId) clear(body).append(el('p', { class: 'error', text: error.message }))
  }
}

function scrollToApproval() {
  const panel = body.querySelector('[data-area="approval-panel"]')
  if (!panel) return
  panel.scrollIntoView({ block: 'start' })
  panel.focus({ preventScroll: true })
}

function sections(task) {
  const data = task.data
  const refill = () => { if (dialog.open && currentId === task.id) fill(task.id) }
  return [
    el('h2', { text: data.title ?? data.intent }),
    el('dl', { class: 'facts' },
      el('dt', { text: 'Status' }), el('dd', {}, statusIndicator(task.status)),
      el('dt', { text: 'Owner' }), ownerValue(task, refill),
      el('dt', { text: 'Workflow' }), workflowValue(task, refill),
      el('dt', { text: 'Updated' }), el('dd', { text: fmtDateTime(task.updated_at) }),
    ),
    actionButtons(task),
    operatorControls(task, refill),
    task.pending_approval ? approvalPanel(task, task.pending_approval) : null,
    el('h3', { text: 'Intent' }),
    el('p', { class: 'pre', text: data.intent }),
    ...(data.attachments?.length ? [el('h3', { text: 'Files' }), el('div', { class: 'msg-files' }, ...data.attachments.map((path) => el('button', {
      type: 'button', class: 'file-chip', text: path.split('/').pop(), title: path, onclick: () => download(path),
    })))] : []),
    el('h3', { text: 'Runs' }),
    runList(task.runs ?? []),
    ...(task.alerts?.length ? [el('h3', { text: 'Alerts' }), el('ul', {}, ...task.alerts.map((a) => el('li', { class: `sev-${a.severity}` },
      el('strong', { text: `${label(a.severity)} · ${label(a.kind)}` }), ` ${a.message}`)))] : []),
  ]
}

// Each transition is enabled only in the status that the server accepts it from.
function actionButtons(task) {
  const make = (name, text, ok) => el('button', {
    type: 'button',
    disabled: task.status !== ACTION_STATUS[name],
    text,
    onclick: () => mutate(() => api.post(`/tasks/${task.id}/${name}`, {}), ok),
  })
  return el('div', { class: 'actions' },
    runNowButton(task, { primary: true }),
    make('resume', 'Resume', 'Resumed'),
    make('done', 'Done', 'Marked done'),
    task.status === 'done'
      ? el('button', {
        type: 'button', text: 'Save as workflow', title: 'Make a workflow draft from this task, its last run and the commands it used',
        onclick: async () => {
          const saved = await mutate(() => api.post(`/tasks/${task.id}/save-workflow`, {}), 'Saved as a workflow draft')
          if (saved) emit('open-workflow', saved.id)
        },
      })
      : null,
    el('button', {
      type: 'button',
      disabled: task.status !== 'draft',
      text: 'Make ready',
      onclick: () => mutate(() => api.patch(`/tasks/${task.id}`, { status: 'ready' }), 'Task is ready'),
    }),
  )
}

function runList(runs) {
  if (runs.length === 0) return el('p', { class: 'meta', text: 'No runs yet.' })
  return el('ul', { class: 'runs' }, ...runs.map((run) => el('li', {},
    statusIndicator(outcomeOf(run)),
    ` ${fmtDateTime(run.started_at)} `,
    el('span', { class: 'meta', text: run.summary ?? '' }),
    el('button', { type: 'button', text: 'Open run', onclick: () => emit('open-run', run.id) }))))
}
