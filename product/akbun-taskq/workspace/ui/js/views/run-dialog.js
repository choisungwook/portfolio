// Run dialog: summary, outcome, times, stats, event timeline, related alerts, output path and the resume command.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { fmtClock, fmtDateTime, fmtDuration } from '../core/time.js'
import { label, outcomeOf, parseField, SEVERITY_RANK, TYPE_MARK } from '../core/vocab.js'

let dialog
let body
let currentId = null

export function initRunDialog() {
  dialog = area('run-dialog')
  body = area('run-body')
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  on('open-run', openRun)
  on('refresh', () => {
    if (dialog.open && currentId) fill(currentId)
  })
}

async function openRun(id) {
  currentId = id
  if (!dialog.open) dialog.showModal()
  await fill(id)
}

async function fill(id) {
  try {
    const run = await api.get(`/runs/${id}`)
    if (id !== currentId) return
    clear(body).append(...sections(run))
  } catch (error) {
    if (id === currentId) clear(body).append(el('p', { class: 'error', text: error.message }))
  }
}

function sections(run) {
  const task = parseField(run.task_data, {})
  const stats = parseField(run.stats, {})
  const outcome = outcomeOf(run)
  const duration = (run.ended_at ?? Date.now() / 1000) - run.started_at
  const title = run.task_title ?? task.title ?? task.intent ?? run.lock_key ?? run.task_type

  return [
    el('h2', { text: title }),
    el('p', { class: 'meta', text: `${TYPE_MARK[run.task_type] ?? label(run.task_type)} · ${run.lock_key ?? 'no account or repo'}` }),
    el('p', { class: `outcome-text outcome-${outcome}`, text: `Result: ${label(outcome)}` }),
    el('dl', { class: 'facts' },
      el('dt', { text: 'Start' }), el('dd', { text: fmtDateTime(run.started_at) }),
      el('dt', { text: 'End' }), el('dd', { text: run.ended_at === null ? 'still running' : fmtDateTime(run.ended_at) }),
      el('dt', { text: 'Duration' }), el('dd', { text: fmtDuration(duration) }),
      el('dt', { text: 'Turns' }), el('dd', { text: String(stats.turns ?? '-') }),
      el('dt', { text: 'Tokens in / out' }), el('dd', { text: `${stats.input_tokens ?? '-'} / ${stats.output_tokens ?? '-'}` }),
      el('dt', { text: 'Tool calls' }), el('dd', { text: String(stats.tool_calls ?? '-') }),
      el('dt', { text: 'Cost' }), el('dd', { text: stats.cost_usd === undefined ? '-' : `$${Number(stats.cost_usd).toFixed(2)}` }),
    ),
    el('h3', { text: 'Summary' }),
    el('p', { class: 'pre', text: run.summary ?? 'No summary.' }),
    el('h3', { text: 'Output' }),
    el('p', { text: task.output_path ? task.output_path : 'No output file.' }),
    resumeBlock(run.session_id),
    el('h3', { text: 'Waits' }),
    waitList(run.waits ?? []),
    el('h3', { text: 'Event timeline' }),
    eventList(run.events ?? []),
    el('h3', { text: 'Related alerts' }),
    alertList(run.alerts ?? []),
    el('div', { class: 'actions' },
      el('button', { type: 'button', text: 'Open task', onclick: () => emit('open-task', run.task_id) })),
  ]
}

function resumeBlock(sessionId) {
  if (!sessionId) return el('p', { class: 'meta', text: 'No session id recorded for this run.' })
  const command = `claude --resume ${sessionId}`
  const status = el('span', { class: 'meta', role: 'status' })
  const copy = el('button', {
    type: 'button',
    text: 'Copy resume command',
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(command)
        status.textContent = 'Copied.'
      } catch {
        status.textContent = 'Clipboard blocked. Copy the command above by hand.'
      }
    },
  })
  return el('div', { class: 'resume' }, el('code', { text: command }), copy, status)
}

function waitList(waits) {
  if (waits.length === 0) return el('p', { class: 'meta', text: 'No waits.' })
  return el('ul', {}, ...waits.map((w) => el('li', {
    text: `${label(w.kind)} wait: ${fmtClock(w.from)} to ${w.to === null ? 'open' : fmtClock(w.to)}`,
  })))
}

function eventList(events) {
  if (events.length === 0) return el('p', { class: 'meta', text: 'No events.' })
  return el('ol', { class: 'events' }, ...events.map((e) => {
    const text = JSON.stringify(parseField(e.payload, {}))
    return el('li', {},
      el('span', { class: 'time', text: fmtClock(e.ts) }),
      el('strong', { text: label(e.kind) }),
      el('pre', { text: text.length > 300 ? `${text.slice(0, 300)}…` : text }))
  }))
}

function alertList(alerts) {
  if (alerts.length === 0) return el('p', { class: 'meta', text: 'No alerts for this run.' })
  const sorted = [...alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
  return el('ul', {}, ...sorted.map((a) => el('li', { class: `sev-${a.severity}` },
    el('strong', { text: `${label(a.severity)} · ${label(a.kind)}` }), ` ${a.message}`)))
}
