// The Workflows view. Three screens in one panel:
// - the list of workflows (register, edit, run with a bot, delete),
// - the editor: steps as a graph like n8n (left to right by dependency) with a form per step,
// - the run history like Argo: every run with the bot that executed it, its status, and whether the workflow was
//   deleted since; a run opens as its graph colored by step status, with outputs, evidence and approval buttons.
import { api, mutate, notify, qs } from '../core/api.js'
import { area, el, fill } from '../core/dom.js'
import { askConfirm, askText } from '../core/ask.js'
import { emit, on } from '../core/bus.js'
import { show } from '../core/nav.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { botAvatar } from './avatar.js'
import { createCanvas, KIND_LABEL } from './workflow-canvas.js'

const KINDS = KIND_LABEL
const POLL_MS = 5000

let root
let screen = 'list'      // list | edit | runs | run
let editing = null       // { id|null, name, description, steps }
let openRun = null
let bots = []
let timer

export function initWorkflowsView() {
  root = area('workflows-view')
  on('tab', (name) => {
    clearInterval(timer)
    if (name !== 'workflows') return
    timer = setInterval(() => {
      if (screen === 'runs' || screen === 'run') render()
    }, POLL_MS)
    render()
  })
  // A workflow saved from a task opens in the editor.
  on('open-workflow', async (id) => {
    try {
      const w = await api.get(`/workflows/${id}`)
      show('workflows')
      edit(w)
    } catch (error) {
      notify(error.message, true)
    }
  })
  document.addEventListener('keydown', editorKeys)
  on('open-workflow-run', (id) => {
    openRun = id
    screen = 'run'
    show('workflows')
  })
}

async function render() {
  try {
    bots = (await api.get('/bots')).agents.filter((a) => a.enabled)
    if (screen === 'list') await renderList()
    else if (screen === 'edit') renderEditor()
    else if (screen === 'runs') await renderRuns()
    else await renderRun()
  } catch (error) {
    notify(error.message, true)
  }
}

function go(next) {
  screen = next
  render()
}

function header(title, ...actions) {
  return el('div', { class: 'wf-head' },
    el('h2', { class: 'view-title', text: title }),
    el('div', { class: 'wf-tabs', role: 'tablist' },
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(screen === 'list' || screen === 'edit'), text: t('wf.list', 'Workflows'), onclick: () => leave('list') }),
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(screen === 'runs' || screen === 'run'), text: t('wf.runs', 'Run history'), onclick: () => leave('runs') })),
    el('span', { class: 'compose-spacer' }),
    ...actions)
}

function statusChip(status) {
  return el('span', { class: 'wf-status', dataset: { status }, text: t(`wf.status.${status}`, status) })
}

// ---- list ----

async function renderList() {
  const workflows = await api.get('/workflows')
  fill(root, 
    header(t('nav.workflows', 'Workflows'), el('button', { type: 'button', class: 'primary', text: `+ ${t('wf.new', 'New workflow')}`, onclick: () => edit(null) })),
    workflows.length === 0
      ? el('p', { class: 'meta', text: t('wf.empty', 'No workflows yet. A workflow is a list of steps a bot runs in order; assign it to a task and give the task to a bot.') })
      : el('ul', { class: 'wf-list' }, ...workflows.map((w) => el('li', { class: 'wf-card' },
        el('div', { class: 'wf-card-main' },
          el('strong', { text: w.name }),
          el('p', { class: 'meta', text: w.description || `${w.definition.steps.length} ${t('wf.steps', 'steps')}` }),
          el('p', { class: 'wf-chain', text: w.definition.steps.map((s) => s.name).join(' → ') })),
        el('div', { class: 'wf-card-side' },
          w.last_status ? statusChip(w.last_status) : el('span', { class: 'meta', text: t('wf.never', 'never run') }),
          el('span', { class: 'meta', text: `${w.runs} ${t('wf.run_count', 'runs')}` }),
          runButton(w),
          el('button', { type: 'button', text: t('wf.edit', 'Edit'), onclick: () => edit(w) }),
          el('button', { type: 'button', class: 'danger-quiet', text: t('wf.delete', 'Delete'), onclick: () => remove(w) }))))),
  )
}

function runButton(w) {
  const select = el('select', { 'aria-label': t('wf.run_with', 'Run with bot') },
    el('option', { value: '', text: `▶ ${t('wf.run_with', 'Run with bot')}` }), ...bots.map((b) => el('option', { value: b.name, text: b.name })))
  select.addEventListener('change', async () => {
    const bot = select.value
    if (!bot) return
    const run = await mutate(() => api.post(`/workflows/${w.id}/run`, { bot }), `${w.name}: ${bot}`)
    select.value = ''
    if (run) emit('open-workflow-run', run.id)
  })
  return select
}

async function remove(w) {
  if (!(await askConfirm(`${t('wf.delete_confirm', 'Delete workflow')} "${w.name}"? ${t('wf.delete_note', 'Runs stay in the history marked deleted; a bot running it is told.')}`))) return
  const result = await mutate(() => api.del(`/workflows/${w.id}`), t('wf.deleted', 'Deleted'))
  if (result?.told?.length) notify(`${t('wf.told', 'Told')}: ${result.told.join(', ')}`)
  render()
}

// ---- editor ----

function edit(w) {
  editing = w
    ? { id: w.id, name: w.name, description: w.description, steps: structuredClone(w.definition.steps) }
    : { id: null, name: '', description: '', steps: [] }
  dirty = false
  go('edit')
}

let canvas = null
let inspector = null
let dirty = false
let editorForm = null

// Leaving the editor asks first when there are unsaved changes; the header tabs and Cancel both come through here.
async function leave(next) {
  if (screen === 'edit' && dirty && !(await askConfirm(t('wf.discard', 'Discard the changes?')))) return
  dirty = false
  go(next)
}

// Editor shortcuts: Cmd/Ctrl+S or Cmd/Ctrl+Enter saves, Esc leaves a field and then the editor, Alt+1..4 adds a step of
// the palette's kind in order. Only while the editor is on screen and no dialog is open.
function editorKeys(event) {
  if (screen !== 'edit' || !editorForm?.isConnected || root.hidden || document.querySelector('dialog[open]') || event.isComposing) return
  const mod = event.metaKey || event.ctrlKey
  const field = event.target instanceof HTMLElement && event.target.matches('input, textarea, select')
  if (mod && (event.key.toLowerCase() === 's' || event.key === 'Enter')) {
    editorForm.requestSubmit()
  } else if (event.key === 'Escape' && !event.defaultPrevented && (root.contains(document.activeElement) || document.activeElement === document.body)) {
    if (field) event.target.blur()
    else leave('list')
  } else if (event.altKey && !mod && /^Digit[1-9]$/.test(event.code) && !field) {
    const kind = Object.keys(KINDS)[Number(event.code.slice(5)) - 1]
    if (!kind) return
    canvas.add(newStep(kind))
  } else return
  event.preventDefault()
}

// The editor: a palette of step kinds on the left, the canvas in the middle, the selected step's fields on the right.
function renderEditor() {
  inspector = el('aside', { class: 'wf-inspector', 'aria-label': t('wf.inspector', 'Step') })
  const count = el('span', { class: 'meta', text: `${editing.steps.length} ${t('wf.steps', 'steps')}` })
  canvas = createCanvas({
    steps: editing.steps, editable: true, notify,
    onChange: () => {
      dirty = true
      count.textContent = `${editing.steps.length} ${t('wf.steps', 'steps')}`
    },
    onSelect: (selection) => renderInspector(selection),
  })
  const palette = el('div', { class: 'wf-palette', 'aria-label': t('wf.add_step', 'Add step') },
    el('p', { class: 'meta', text: t('wf.add_step', 'Add step') }),
    ...Object.entries(KINDS).map(([kind, label]) => el('button', {
      type: 'button', class: 'wf-palette-item', dataset: { kind }, text: t(...label),
      onclick: () => canvas.add(newStep(kind)),
    })),
  )
  const help = el('p', { class: 'meta wf-help', text: t('wf.help', 'Drag a node to move it. Drag from its right dot to another node to make that one run after it. Click a link and press Delete to remove it.') })
  const form = el('form', { class: 'wf-editor', onsubmit: save },
    el('div', { class: 'wf-meta' },
      el('label', {}, t('wf.name', 'Name'), el('input', { name: 'name', required: true, maxlength: 80, value: editing.name, oninput: (e) => { editing.name = e.target.value; dirty = true } })),
      el('label', {}, t('wf.description', 'Description'), el('input', { name: 'description', maxlength: 1000, value: editing.description, oninput: (e) => { editing.description = e.target.value; dirty = true } }))),
    el('div', { class: 'wf-studio' }, palette, canvas.element, inspector, help),
    el('div', { class: 'wf-actions' },
      count,
      el('span', { class: 'compose-spacer' }),
      el('span', { class: 'meta', text: t('wf.keys', 'Save ⌘S · Cancel Esc · Add step Alt+1–4') }),
      el('button', { type: 'button', text: t('wf.cancel', 'Cancel'), onclick: () => leave('list') }),
      el('button', { type: 'submit', class: 'primary', text: t('wf.save', 'Save') })),
  )
  editorForm = form
  // Cancel and Save also sit at the top, next to the title, so a new workflow can be left without scrolling.
  fill(root, header(editing.id ? editing.name || t('wf.edit', 'Edit') : t('wf.new', 'New workflow'),
    el('button', { type: 'button', text: t('wf.cancel', 'Cancel'), title: 'Esc', onclick: () => leave('list') }),
    el('button', { type: 'button', class: 'primary', text: t('wf.save', 'Save'), title: '⌘S / Ctrl+S', onclick: () => form.requestSubmit() })), form)
  renderInspector(null)
  if (editing.steps.length === 0) canvas.add(newStep('do'))
}

function newStep(kind) {
  let n = editing.steps.length + 1
  while (editing.steps.some((s) => s.id === `step-${n}`)) n += 1
  return { id: `step-${n}`, name: t(...KINDS[kind]), kind, instructions: '', needs: [] }
}

function renderInspector(selection) {
  if (!inspector) return
  const step = selection?.type === 'node' ? editing.steps.find((s) => s.id === selection.id) : null
  if (!step) {
    fill(inspector, el('p', { class: 'meta', text: selection?.type === 'edge'
      ? t('wf.edge_selected', 'Link selected. Press Delete to remove it.')
      : t('wf.pick_node', 'Select a step to edit it.') }))
    return
  }
  const changed = (key, value, redraw = true) => {
    step[key] = value
    dirty = true
    if (redraw) canvas.render()
  }
  const kind = el('select', { name: 'kind', onchange: (e) => { changed('kind', e.target.value); renderInspector(selection) } },
    ...Object.entries(KINDS).map(([k, label]) => el('option', { value: k, text: t(...label), selected: step.kind === k })))
  const idInput = el('input', { value: step.id, maxlength: 32, pattern: '[a-z0-9][a-z0-9\\-]{0,31}', class: 'mono',
    onchange: (e) => {
      const next = e.target.value.trim()
      if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(next) || editing.steps.some((s) => s !== step && s.id === next)) {
        notify(t('wf.bad_id', 'The id must be unique: lowercase letters, digits and hyphens'), true)
        e.target.value = step.id
        return
      }
      for (const s of editing.steps) s.needs = s.needs.map((n) => (n === step.id ? next : n))
      step.id = next
      dirty = true
      canvas.select({ type: 'node', id: next })
    } })
  fill(inspector,
    el('h3', { text: step.name || step.id }),
    el('label', {}, t('wf.step_name', 'Step'), el('input', { value: step.name, maxlength: 120, oninput: (e) => changed('name', e.target.value) })),
    el('label', {}, 'id', idInput),
    el('label', {}, t('wf.kind', 'Kind'), kind),
    step.kind === 'handoff' ? el('label', {}, t('wf.to', 'To bot'), el('select', { onchange: (e) => changed('to', e.target.value) },
      el('option', { value: '', text: '—' }), ...bots.map((b) => el('option', { value: b.name, text: b.name, selected: step.to === b.name })))) : null,
    el('label', {}, t('wf.instructions', 'Instructions for the bot'),
      el('textarea', { rows: 6, maxlength: 4000, text: step.instructions, oninput: (e) => changed('instructions', e.target.value, false) })),
    el('p', { class: 'meta', text: step.needs.length ? `${t('wf.needs', 'Runs after')}: ${step.needs.join(', ')}` : t('wf.first', 'Runs first') }),
    el('button', { type: 'button', class: 'danger-quiet', text: t('wf.remove_step', 'Remove step'), onclick: () => canvas.removeSelected() }),
  )
}

async function save(event) {
  event.preventDefault()
  const body = { name: editing.name.trim(), description: editing.description, definition: { steps: editing.steps } }
  const saved = await mutate(() => (editing.id ? api.put(`/workflows/${editing.id}`, body) : api.post('/workflows', body)), t('wf.saved', 'Saved'))
  if (saved) {
    dirty = false
    go('list')
  }
}

// ---- runs ----

async function renderRuns() {
  const runs = await api.get(`/workflow-runs${qs({ limit: 100 })}`)
  fill(root, 
    header(t('wf.runs', 'Run history')),
    runs.length === 0 ? el('p', { class: 'meta', text: t('wf.no_runs', 'No runs yet.') }) : el('table', { class: 'wf-runs' },
      el('thead', {}, el('tr', {}, ...[t('wf.col.status', 'Status'), t('wf.col.workflow', 'Workflow'), t('wf.col.bot', 'Bot'), t('wf.col.task', 'Task'), t('wf.col.started', 'Started'), t('wf.col.duration', 'Duration')].map((h) => el('th', { text: h })))),
      el('tbody', {}, ...runs.map((r) => el('tr', { tabindex: 0, onclick: () => { openRun = r.id; go('run') }, onkeydown: (e) => { if (e.key === 'Enter') { openRun = r.id; go('run') } } },
        el('td', {}, statusChip(r.status)),
        el('td', {}, el('span', { text: r.workflow_name }), r.workflow_deleted ? el('span', { class: 'badge', text: t('wf.deleted_badge', 'deleted') }) : null),
        el('td', { class: 'wf-bot' }, el('span', {}, botAvatar(r.bot, 22), el('span', { text: r.bot }))),
        el('td', { class: 'mono', text: r.task_id ?? '—' }),
        el('td', { text: fmtDateTime(r.started_at) }),
        el('td', { text: duration(r.started_at, r.ended_at) }))))),
  )
}

function duration(start, end) {
  const s = Math.max(0, (end ?? Math.floor(Date.now() / 1000)) - start)
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`
}

async function renderRun() {
  const run = await api.get(`/workflow-runs/${openRun}`)
  const states = new Map(run.steps.map((s) => [s.step_id, s.status]))
  const byId = new Map(run.steps.map((s) => [s.step_id, s]))
  fill(root, 
    header(`${run.workflow_name} · ${run.id.slice(0, 8)}`,
      run.status === 'running' ? el('button', { type: 'button', class: 'danger-quiet', text: t('wf.cancel_run', 'Cancel run'), onclick: async () => {
        if (await mutate(() => api.post(`/workflow-runs/${run.id}/cancel`), t('wf.cancelled', 'Cancelled'))) render()
      } }) : null),
    el('p', { class: 'wf-run-facts' }, statusChip(run.status), ' ', botAvatar(run.bot, 22), ` ${run.bot}`,
      run.task_id ? el('button', { type: 'button', class: 'link', text: ` · task ${run.task_id}`, onclick: () => emit('open-task', run.task_id) }) : null,
      el('span', { class: 'meta', text: ` · ${fmtDateTime(run.started_at)} · ${duration(run.started_at, run.ended_at)}` }),
      run.workflow_deleted ? el('span', { class: 'badge', text: t('wf.deleted_since', 'workflow deleted; this run used its copy') }) : null),
    run.summary ? el('p', { class: 'meta', text: run.summary }) : null,
    createCanvas({
      steps: structuredClone(run.snapshot.steps), editable: false, states,
      onSelect: (selection) => { if (selection?.type === 'node') document.getElementById(`wf-run-step-${selection.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) },
    }).element,
    el('ol', { class: 'wf-steps' }, ...run.snapshot.steps.map((step) => {
      const s = byId.get(step.id)
      return el('li', { class: 'wf-step', id: `wf-run-step-${step.id}` },
        el('div', { class: 'wf-step-row' }, statusChip(s.status), el('strong', { text: step.name }), el('span', { class: 'meta', text: `${step.id} · ${t(...KINDS[step.kind])}${step.to ? ` → ${step.to}` : ''}` }),
          s.started_at ? el('span', { class: 'meta', text: duration(s.started_at, s.ended_at) }) : null),
        s.output ? el('p', { class: 'pre', text: s.output }) : null,
        s.evidence ? el('details', {}, el('summary', { text: t('wf.evidence', 'Evidence') }), el('pre', { text: s.evidence })) : null,
        step.kind === 'approval' && run.status === 'running' && (s.status === 'running' || s.status === 'pending') ? el('div', { class: 'wf-actions' },
          el('button', { type: 'button', class: 'primary', text: t('wf.approve', 'Approve'), onclick: () => answer(run.id, step.id, true) }),
          el('button', { type: 'button', class: 'danger-quiet', text: t('wf.reject', 'Reject'), onclick: () => answer(run.id, step.id, false) })) : null)
    })),
  )
}

async function answer(runId, stepId, approved) {
  const note = await askText(approved ? t('wf.approve_note', 'Note for the bot (optional)') : t('wf.reject_note', 'Why reject? (sent to the bot)'))
  if (note === null) return
  if (await mutate(() => api.post(`/workflow-runs/${runId}/steps/${stepId}/approve`, { approved, note }))) render()
}
