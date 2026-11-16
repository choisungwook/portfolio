// Task detail dialog: intent, cautions, status, the pending approval, runs, event log, dependencies and state buttons.
import { api, mutate, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { fmtClock, fmtDateTime } from '../core/time.js'
import { ACTION_STATUS, label, outcomeOf, parseField, TYPE_MARK } from '../core/vocab.js'
import { statusIndicator } from '../core/status.js'
import { approvalPanel } from './approval-panel.js'
import { operatorControls } from './operator-controls.js'

let dialog
let body
let currentId = null
let focusApproval = false

export function initTaskDetail() {
  dialog = area('task-detail')
  body = area('task-body')
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
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
    const [task, events, graph, settings] = await Promise.all([
      api.get(`/tasks/${id}`),
      api.get(`/events${qs({ task_id: id, order: 'desc', limit: 200 })}`),
      api.get('/graph'),
      api.get('/settings'),
    ])
    if (id !== currentId) return
    const titles = new Map(graph.tasks.map((t) => [t.id, t.title]))
    clear(body).append(...sections(task, events, graph, titles, settings).filter(Boolean))
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

function sections(task, events, graph, titles, settings) {
  const data = task.data
  const title = data.title ?? data.intent
  return [
    el('h2', { text: title }),
    el('p', { class: 'meta', text: `${TYPE_MARK[task.type] ?? label(task.type)} · ${task.lock_key ?? 'no account or repo'} · priority ${task.priority}` }),
    el('p', { class: 'status' }, 'Status: ', statusIndicator(task.status)),
    el('dl', { class: 'facts' },
      el('dt', { text: 'Created' }), el('dd', { text: fmtDateTime(task.created_at) }),
      el('dt', { text: 'Updated' }), el('dd', { text: fmtDateTime(task.updated_at) }),
      el('dt', { text: 'Claimed by' }), el('dd', { text: task.claimed_by ?? 'none' }),
      el('dt', { text: 'Session' }), el('dd', { text: task.session_id ?? 'none' }),
      el('dt', { text: 'Access skill' }), el('dd', {}, accessSkillValue(data, settings)),
    ),
    actionButtons(task),
    operatorControls(task, () => {
      if (dialog.open && currentId === task.id) fill(task.id)
    }),
    task.pending_approval ? approvalPanel(task, task.pending_approval) : null,
    el('h3', { text: 'Intent' }),
    el('p', { class: 'pre', text: data.intent }),
    el('h3', { text: 'Cautions' }),
    el('p', { class: 'pre', text: data.cautions ?? 'None.' }),
    el('h3', { text: 'Runs' }),
    runList(task.runs ?? []),
    el('h3', { text: 'Dependencies' }),
    depList(task, graph, titles),
    el('h3', { text: 'Event log (latest 200, newest first)' }),
    eventList(events),
    el('h3', { text: 'Alerts' }),
    el('ul', {}, ...(task.alerts ?? []).map((a) => el('li', { class: `sev-${a.severity}` },
      el('strong', { text: `${label(a.severity)} · ${label(a.kind)}` }), ` ${a.message}`))),
  ]
}

// The access skill's name and registered folder. A name that is no longer registered says so.
function accessSkillValue(data, settings) {
  if (!data.access_skill) return 'none'
  const skill = settings.access_skills.find((row) => row.name === data.access_skill)
  if (!skill) return `${data.access_skill} (not registered)`
  return [data.access_skill, ' ', el('code', { class: 'skill-path', text: skill.path })]
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
    make('resume', 'Resume', 'Resumed'),
    make('done', 'Done', 'Marked done'),
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

// Predecessors and dependents, both read from the graph endpoint, which lists every dep.
function depList(task, graph, titles) {
  const rows = [
    ...graph.deps.filter((d) => d.task_id === task.id).map((d) => ({ id: d.depends_on, kind: d.kind, direction: 'depends on' })),
    ...graph.deps.filter((d) => d.depends_on === task.id).map((d) => ({ id: d.task_id, kind: d.kind, direction: 'is a dependency of' })),
  ]
  if (rows.length === 0) return el('p', { class: 'meta', text: 'No dependencies.' })
  return el('ul', {}, ...rows.map((r) => el('li', {}, `${label(r.kind)}: ${r.direction} ${titles.get(r.id) ?? r.id}`)))
}

function eventList(events) {
  if (events.length === 0) return el('p', { class: 'meta', text: 'No events.' })
  return el('ol', { class: 'events' }, ...events.map((e) => {
    const text = JSON.stringify(parseField(e.payload, {}))
    return el('li', {}, el('span', { class: 'time', text: fmtClock(e.ts) }), el('strong', { text: label(e.kind) }),
      el('pre', { text: text.length > 300 ? `${text.slice(0, 300)}…` : text }))
  }))
}
