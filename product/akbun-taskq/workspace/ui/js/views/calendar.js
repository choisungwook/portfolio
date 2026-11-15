// Calendar tab: Today, Prev and Next, the Day / Week / Month switch, the filters, the legend and the keyboard shortcuts.
import { api, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { hasAccess } from '../core/token.js'
import { addDays, addMonths, dayKey, fmtDay, startOfDay, startOfWeek, toEpoch } from '../core/time.js'
import { label, OUTCOMES, TASK_TYPES } from '../core/vocab.js'
import { renderTimeGrid, revealTime } from './calendar-grid.js'
import { monthGridRange, renderMonth } from './calendar-month.js'

const state = { mode: 'day', anchor: startOfDay(new Date()), filters: {}, active: false, token: 0, reveal: false }
const RUNNING_TICK_MS = 30000
const FILTER_NAMES = { type: 'type', lock_key: 'account or repo', outcome: 'result' }

let root
let body
let heading
let summary
let filters
let legend
let lockSelect
let lockSignature = null

export function initCalendar() {
  root = area('calendar')
  body = area('calendar-body')
  heading = area('calendar-label')
  summary = area('day-summary')
  filters = area('calendar-filters')
  legend = area('calendar-legend')
  lockSelect = area('lock-key-filter', filters)

  area('calendar-today').addEventListener('click', goToday)
  for (const [name, dir] of [['calendar-prev', -1], ['calendar-next', 1]]) {
    const button = area(name)
    button.addEventListener('click', () => step(dir))
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      step(event.key === 'ArrowLeft' ? -1 : 1)
    })
  }
  for (const button of root.querySelectorAll('[data-mode]')) button.addEventListener('click', () => setMode(button.dataset.mode))

  fillFilterOptions()
  fillLegend()
  filters.addEventListener('change', () => {
    const form = new FormData(filters)
    state.filters = {
      type: form.get('type') || undefined,
      lock_key: String(form.get('lock_key') || '') || undefined,
      outcome: form.get('outcome') || undefined,
    }
    load()
  })
  filters.addEventListener('submit', (event) => event.preventDefault())
  document.addEventListener('keydown', onShortcut)

  // Clicking the tab goes to today, also when it is already the active tab (app.js emits on every click).
  on('tab', (name) => {
    state.active = name === 'calendar'
    if (state.active) goToday()
  })
  on('refresh', () => {
    if (state.active) load()
  })
  // Running blocks extend to now, so the grid is redrawn on a timer while the tab is open.
  setInterval(() => {
    if (state.active && hasAccess()) load()
  }, RUNNING_TICK_MS)
  syncButtons()
}

function goToday() {
  state.anchor = startOfDay(new Date())
  state.reveal = true
  load()
}

function step(dir) {
  state.anchor = state.mode === 'month' ? addMonths(state.anchor, dir) : addDays(state.anchor, dir * (state.mode === 'week' ? 7 : 1))
  state.reveal = true
  load()
}

function setMode(mode) {
  state.mode = mode
  state.reveal = true
  syncButtons()
  load()
}

function syncButtons() {
  root.querySelectorAll('[data-mode]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode))
  })
}

// Opens the Day view for a date, used by the day headers and the month grid.
function openDay(date) {
  state.mode = 'day'
  state.anchor = startOfDay(date)
  state.reveal = true
  syncButtons()
  load()
}

// t = today, d / w / m = Day / Week / Month. Only when focus is in the calendar and not in a form control.
function onShortcut(event) {
  if (!state.active || event.ctrlKey || event.metaKey || event.altKey) return
  if (!root.contains(document.activeElement) || event.target.closest('input, select, textarea, [contenteditable]')) return
  const action = { t: goToday, d: () => setMode('day'), w: () => setMode('week'), m: () => setMode('month') }[event.key.toLowerCase()]
  if (!action) return
  event.preventDefault()
  action()
}

// Day and Week columns, in order.
function visibleDays() {
  if (state.mode === 'week') {
    const first = startOfWeek(state.anchor)
    return Array.from({ length: 7 }, (_, i) => addDays(first, i))
  }
  return [startOfDay(state.anchor)]
}

async function load() {
  const token = ++state.token
  heading.textContent = headingText()
  summary.hidden = state.mode !== 'day'
  try {
    if (state.mode === 'month') return await loadMonth(token)
    const days = visibleDays()
    const from = toEpoch(days[0])
    const to = toEpoch(addDays(days[days.length - 1], 1))
    const [list, lockKeys] = await Promise.all([
      api.get(`/runs${qs({ from, to, ...state.filters })}`),
      api.get('/lock-keys'),
      state.mode === 'day' ? loadSummary(days[0], token) : null,
    ])
    if (token !== state.token) return
    fillLockKeys(lockKeys)
    paint(days, list.runs, list.truncated, Date.now() / 1000)
  } catch (error) {
    if (token === state.token) clear(body).append(el('p', { class: 'empty', text: error.message }))
  }
}

async function loadMonth(token) {
  const { from, to } = monthGridRange(state.anchor)
  const [stats, list, lockKeys] = await Promise.all([
    api.get(`/stats/daily${qs({ from: dayKey(from), to: dayKey(addDays(to, -1)), ...state.filters })}`),
    api.get(`/runs${qs({ from: toEpoch(from), to: toEpoch(to), ...state.filters })}`),
    api.get('/lock-keys'),
  ])
  if (token !== state.token) return
  fillLockKeys(lockKeys)
  state.reveal = false
  const children = [renderMonth({ month: state.anchor, stats, runs: list.runs, onDay: openDay, onOpen: openRun })]
  if (list.truncated) children.unshift(truncatedNote(list.runs.length))
  clear(body).append(...children)
}

// Redraws the grid. A range change scrolls to the current time; a refresh keeps the scroll position and the focused block.
function paint(days, runs, truncated, now) {
  const previous = body.querySelector('.time-grid')
  const keepTop = previous?.scrollTop ?? 0
  const focused = body.contains(document.activeElement) ? document.activeElement.dataset.runId : undefined
  const grid = renderTimeGrid({ days, runs, now, onDay: openDay, onOpen: openRun })
  clear(body).append(...(truncated ? [truncatedNote(runs.length)] : []), grid)
  if (state.reveal) {
    revealTime(grid, days, now)
    state.reveal = false
  } else {
    grid.scrollTop = keepTop
  }
  if (focused !== undefined) {
    const block = [...body.querySelectorAll('[data-run-id]')].find((node) => node.dataset.runId === focused)
    block?.focus({ preventScroll: true })
  }
}

function truncatedNote(shown) {
  return el('p', {
    class: 'meta',
    role: 'status',
    text: `Showing first ${shown} runs. Narrow the range or the filters to see the rest.`,
  })
}

function openRun(id) {
  emit('open-run', id)
}

// Options are built from the shared labels, so the page never shows an identifier. Values stay the identifiers.
function fillFilterOptions() {
  area('type-filter', filters).append(...TASK_TYPES.map((value) => el('option', { value, text: label(value) })))
  area('outcome-filter', filters).append(...OUTCOMES.map((value) => el('option', { value, text: label(value) })))
}

function fillLegend() {
  clear(legend).append(
    ...[...OUTCOMES, 'running'].map((outcome) => el('span', { class: `swatch outcome-${outcome}`, text: label(outcome) })),
    el('span', { class: 'swatch wait-sample', text: 'Waiting for you' }),
  )
}

// Rebuilds the lock_key options only when the set changes, so an open dropdown is not closed by a refresh.
function fillLockKeys(keys) {
  const signature = keys.join('\u0000')
  if (signature === lockSignature) return
  lockSignature = signature
  const options = [...keys]
  const current = state.filters.lock_key
  if (current && !keys.includes(current)) options.push(current)
  clear(lockSelect).append(
    el('option', { value: '', text: 'All' }),
    ...options.map((key) => el('option', { value: key, text: key })),
  )
  lockSelect.value = current ?? ''
}

// Day strip: totals for the whole day with the same filters as the list. Top summaries sit behind a disclosure.
async function loadSummary(day, token) {
  const key = dayKey(day)
  const stats = await api.get(`/stats/daily${qs({ from: key, to: key, ...state.filters })}`)
  if (token !== state.token) return
  const s = stats[0] ?? { runs: 0, done: 0, failed: 0, critical: 0, cost_usd: 0, top: [] }
  const open = summary.querySelector('details')?.open ?? false
  const active = Object.entries(state.filters).filter(([, value]) => value)
  const scope = active.length === 0
    ? 'all runs'
    : active.map(([k, v]) => `${FILTER_NAMES[k]} ${k === 'lock_key' ? v : label(v)}`).join(', ')
  const fact = (name, value) => el('div', {}, el('dt', { text: name }), el('dd', { text: value }))
  clear(summary).append(
    el('div', { class: 'summary-strip' },
      el('span', { class: 'meta', text: `${fmtDay(day)} · ${scope}` }),
      el('dl', { class: 'facts-inline' },
        fact('Done', String(s.done)),
        fact('Failed', String(s.failed)),
        fact('Critical alerts', String(s.critical)),
        fact('Cost', `$${Number(s.cost_usd).toFixed(2)}`),
      )),
    el('details', { class: 'summary-more', open },
      el('summary', { text: 'Summary' }),
      s.top.length === 0 ? el('p', { class: 'empty', text: 'No summaries.' }) : el('ol', {}, ...s.top.map((t) => el('li', { text: t }))),
    ),
  )
}

function headingText() {
  if (state.mode === 'month') return state.anchor.toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
  if (state.mode === 'week') return weekRangeText(startOfWeek(state.anchor))
  return state.anchor.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

// "Nov 9 – 15, 2026", or "Oct 26 – Nov 1, 2026" across a month boundary.
function weekRangeText(first) {
  const last = addDays(first, 6)
  const month = (d) => d.toLocaleDateString(undefined, { month: 'short' })
  const head = `${month(first)} ${first.getDate()}${first.getFullYear() === last.getFullYear() ? '' : `, ${first.getFullYear()}`}`
  const tail = first.getMonth() === last.getMonth() ? `${last.getDate()}` : `${month(last)} ${last.getDate()}`
  return `${head} – ${tail}, ${last.getFullYear()}`
}
