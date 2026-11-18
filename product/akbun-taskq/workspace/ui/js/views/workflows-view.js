// The Workflows view. Three screens in one panel:
// - the list of workflows (register, edit, run with a bot, delete),
// - the editor: steps as a graph like n8n (left to right by dependency) with a form per step,
// - the run history like Argo: every run with the bot that executed it, its status, and whether the workflow was
//   deleted since; a run opens as its graph colored by step status, with outputs, evidence and approval buttons.
import { api, mutate, notify, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { show } from '../core/nav.js'
import { t } from '../core/i18n.js'
import { fmtDateTime } from '../core/time.js'
import { botAvatar } from './avatar.js'

const KINDS = {
  do: ['wf.kind.do', 'Do'], check: ['wf.kind.check', 'Check (needs evidence)'],
  handoff: ['wf.kind.handoff', 'Hand off to a bot'], approval: ['wf.kind.approval', 'User approval'],
}
const POLL_MS = 5000
const SVG = 'http://www.w3.org/2000/svg'

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
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(screen === 'list' || screen === 'edit'), text: t('wf.list', 'Workflows'), onclick: () => go('list') }),
      el('button', { type: 'button', role: 'tab', 'aria-selected': String(screen === 'runs' || screen === 'run'), text: t('wf.runs', 'Run history'), onclick: () => go('runs') })),
    el('span', { class: 'compose-spacer' }),
    ...actions)
}

function statusChip(status) {
  return el('span', { class: 'wf-status', dataset: { status }, text: t(`wf.status.${status}`, status) })
}

// ---- list ----

async function renderList() {
  const workflows = await api.get('/workflows')
  clear(root).append(
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
  if (!confirm(`${t('wf.delete_confirm', 'Delete workflow')} "${w.name}"? ${t('wf.delete_note', 'Runs stay in the history marked deleted; a bot running it is told.')}`)) return
  const result = await mutate(() => api.del(`/workflows/${w.id}`), t('wf.deleted', 'Deleted'))
  if (result?.told?.length) notify(`${t('wf.told', 'Told')}: ${result.told.join(', ')}`)
  render()
}

// ---- editor ----

function edit(w) {
  editing = w
    ? { id: w.id, name: w.name, description: w.description, steps: structuredClone(w.definition.steps) }
    : { id: null, name: '', description: '', steps: [{ id: 'step-1', name: '', kind: 'do', instructions: '', needs: [] }] }
  go('edit')
}

function renderEditor() {
  const form = el('form', { class: 'wf-editor', onsubmit: save },
    el('div', { class: 'wf-meta' },
      el('label', {}, t('wf.name', 'Name'), el('input', { name: 'name', required: true, maxlength: 80, value: editing.name, oninput: (e) => { editing.name = e.target.value } })),
      el('label', {}, t('wf.description', 'Description'), el('input', { name: 'description', maxlength: 1000, value: editing.description, oninput: (e) => { editing.description = e.target.value } }))),
    el('div', { class: 'wf-canvas', 'data-area': 'wf-canvas' }, graph(editing.steps, null, (id) => document.getElementById(`wf-step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))),
    el('ol', { class: 'wf-steps' }, ...editing.steps.map((step, i) => stepForm(step, i))),
    el('div', { class: 'wf-actions' },
      el('button', { type: 'button', text: `+ ${t('wf.add_step', 'Add step')}`, onclick: addStep }),
      el('span', { class: 'compose-spacer' }),
      el('button', { type: 'button', text: t('wf.cancel', 'Cancel'), onclick: () => go('list') }),
      el('button', { type: 'submit', class: 'primary', text: t('wf.save', 'Save') })),
  )
  clear(root).append(header(editing.id ? editing.name || t('wf.edit', 'Edit') : t('wf.new', 'New workflow')), form)
}

function redrawGraph() {
  const canvas = area('wf-canvas', root)
  if (canvas) clear(canvas).append(graph(editing.steps, null, (id) => document.getElementById(`wf-step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })))
}

function stepForm(step, index) {
  const others = editing.steps.filter((s) => s !== step)
  const field = (key, node) => { node.addEventListener('input', () => { step[key] = node.value; redrawGraph() }); return node }
  const kind = el('select', { 'aria-label': t('wf.kind', 'Kind') }, ...Object.entries(KINDS).map(([k, label]) => el('option', { value: k, text: t(...label), selected: step.kind === k })))
  kind.addEventListener('change', () => { step.kind = kind.value; renderEditor() })
  return el('li', { class: 'wf-step', id: `wf-step-${step.id}` },
    el('div', { class: 'wf-step-row' },
      el('span', { class: 'wf-index', text: String(index + 1) }),
      el('label', {}, 'id', field('id', el('input', { value: step.id, required: true, pattern: '[a-z0-9][a-z0-9\\-]{0,31}', maxlength: 32, class: 'mono' }))),
      el('label', { class: 'grow' }, t('wf.step_name', 'Step'), field('name', el('input', { value: step.name, required: true, maxlength: 120 }))),
      el('label', {}, t('wf.kind', 'Kind'), kind),
      step.kind === 'handoff' ? el('label', {}, t('wf.to', 'To bot'), field('to', el('select', {},
        el('option', { value: '', text: '—' }), ...bots.map((b) => el('option', { value: b.name, text: b.name, selected: step.to === b.name }))))) : null,
      el('button', { type: 'button', class: 'danger-quiet', 'aria-label': t('wf.remove_step', 'Remove step'), text: '✕', onclick: () => removeStep(step) })),
    el('label', { class: 'wide' }, t('wf.instructions', 'Instructions for the bot'),
      field('instructions', el('textarea', { rows: 2, maxlength: 4000, text: step.instructions }))),
    others.length === 0 ? null : el('fieldset', { class: 'wf-needs' }, el('legend', { text: t('wf.needs', 'Runs after') }),
      ...others.map((o) => el('label', { class: 'check' }, el('input', {
        type: 'checkbox', checked: step.needs.includes(o.id),
        onchange: (e) => { step.needs = e.target.checked ? [...step.needs, o.id] : step.needs.filter((n) => n !== o.id); redrawGraph() },
      }), o.name || o.id))),
  )
}

function addStep() {
  let n = editing.steps.length + 1
  while (editing.steps.some((s) => s.id === `step-${n}`)) n += 1
  const last = editing.steps.at(-1)
  editing.steps.push({ id: `step-${n}`, name: '', kind: 'do', instructions: '', needs: last ? [last.id] : [] })
  renderEditor()
}

function removeStep(step) {
  editing.steps = editing.steps.filter((s) => s !== step)
  for (const s of editing.steps) s.needs = s.needs.filter((n) => n !== step.id)
  renderEditor()
}

async function save(event) {
  event.preventDefault()
  const body = { name: editing.name.trim(), description: editing.description, definition: { steps: editing.steps } }
  const saved = await mutate(() => (editing.id ? api.put(`/workflows/${editing.id}`, body) : api.post('/workflows', body)), t('wf.saved', 'Saved'))
  if (saved) go('list')
}

// ---- graph ----

// Steps laid out left to right by depth (the longest chain of needs before them), like n8n's canvas. Clicking a node
// calls onPick with its id. `states` colors nodes by run status.
function graph(steps, states, onPick) {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const depth = new Map()
  const depthOf = (id, seen = new Set()) => {
    if (depth.has(id)) return depth.get(id)
    if (seen.has(id) || !byId.has(id)) return 0
    seen.add(id)
    const d = Math.max(-1, ...byId.get(id).needs.map((n) => depthOf(n, seen))) + 1
    depth.set(id, d)
    return d
  }
  for (const s of steps) depthOf(s.id)
  const columns = []
  for (const s of steps) {
    const d = depth.get(s.id)
    if (!columns[d]) columns[d] = []
    columns[d].push(s)
  }
  const W = 184, H = 52, GX = 56, GY = 20
  const pos = new Map()
  columns.forEach((col, x) => {
    col.forEach((s, y) => {
      pos.set(s.id, { x: 12 + x * (W + GX), y: 12 + y * (H + GY) })
    })
  })
  const width = 24 + columns.length * (W + GX) - GX
  const height = 24 + Math.max(1, ...columns.map((c) => c.length)) * (H + GY) - GY
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`)
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  svg.setAttribute('role', 'img')
  svg.setAttribute('aria-label', steps.map((s) => s.name || s.id).join(', '))
  const node = (tag, attrs, text) => {
    const n = document.createElementNS(SVG, tag)
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v))
    if (text !== undefined) n.textContent = text
    return n
  }
  for (const s of steps) {
    for (const need of s.needs) {
      const a = pos.get(need), b = pos.get(s.id)
      if (!a || !b) continue
      const x1 = a.x + W, y1 = a.y + H / 2, x2 = b.x, y2 = b.y + H / 2
      svg.append(node('path', { class: 'wf-edge', d: `M${x1},${y1} C${x1 + GX / 2},${y1} ${x2 - GX / 2},${y2} ${x2},${y2}` }))
    }
  }
  for (const s of steps) {
    const p = pos.get(s.id)
    const state = states?.get(s.id)
    const g = node('g', { class: 'wf-node', 'data-kind': s.kind, 'data-status': state ?? 'none', tabindex: 0, transform: `translate(${p.x},${p.y})` })
    g.append(node('rect', { width: W, height: H, rx: 12 }))
    g.append(node('text', { x: 12, y: 21, class: 'wf-node-name' }, (s.name || s.id).slice(0, 20)))
    // A run shows each step's status; the editor shows its kind.
    const second = state ? t(`wf.status.${state}`, state) : `${t(...KINDS[s.kind])}${s.to ? ` → ${s.to}` : ''}`
    g.append(node('text', { x: 12, y: 39, class: 'wf-node-kind' }, second.length > 24 ? `${second.slice(0, 23)}…` : second))
    const pick = () => onPick?.(s.id)
    g.addEventListener('click', pick)
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter') pick() })
    svg.append(g)
  }
  return svg
}

// ---- runs ----

async function renderRuns() {
  const runs = await api.get(`/workflow-runs${qs({ limit: 100 })}`)
  clear(root).append(
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
  clear(root).append(
    header(`${run.workflow_name} · ${run.id.slice(0, 8)}`,
      run.status === 'running' ? el('button', { type: 'button', class: 'danger-quiet', text: t('wf.cancel_run', 'Cancel run'), onclick: async () => {
        if (await mutate(() => api.post(`/workflow-runs/${run.id}/cancel`), t('wf.cancelled', 'Cancelled'))) render()
      } }) : null),
    el('p', { class: 'wf-run-facts' }, statusChip(run.status), ' ', botAvatar(run.bot, 22), ` ${run.bot}`,
      run.task_id ? el('button', { type: 'button', class: 'link', text: ` · task ${run.task_id}`, onclick: () => emit('open-task', run.task_id) }) : null,
      el('span', { class: 'meta', text: ` · ${fmtDateTime(run.started_at)} · ${duration(run.started_at, run.ended_at)}` }),
      run.workflow_deleted ? el('span', { class: 'badge', text: t('wf.deleted_since', 'workflow deleted; this run used its copy') }) : null),
    run.summary ? el('p', { class: 'meta', text: run.summary }) : null,
    el('div', { class: 'wf-canvas' }, graph(run.snapshot.steps, states, (id) => document.getElementById(`wf-run-step-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))),
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
  const note = prompt(approved ? t('wf.approve_note', 'Note for the bot (optional)') : t('wf.reject_note', 'Why reject? (sent to the bot)')) ?? ''
  if (await mutate(() => api.post(`/workflow-runs/${runId}/steps/${stepId}/approve`, { approved, note }))) render()
}
