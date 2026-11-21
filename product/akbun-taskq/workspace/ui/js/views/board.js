// Board tab: one column per status in the order a task moves, draft first, with an arrow between steps. Columns wrap
// to the next row by window width only. Failed and cancelled are not steps; they sit collapsed at the end.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { BOARD_COLUMNS, COLLAPSED_COLUMNS, label, TYPE_MARK } from '../core/vocab.js'
import { icon } from '../core/icons.js'
import { statusIndicator } from '../core/status.js'
import { runNowButton, RUNNABLE } from '../core/run-now.js'

let columns
let active = false

export function initBoard() {
  columns = area('board-columns')
  on('tab', (name) => {
    active = name === 'board'
    if (active) load()
  })
  on('refresh', () => {
    if (active) load()
  })
}

async function load() {
  try {
    const tasks = await api.get('/tasks')
    const of = (status) => tasks.filter((t) => t.status === status)
    // Every step keeps an arrow slot so all columns are the same width; only the first and collapsed ones leave it empty.
    const step = (col, arrow) => el('div', { class: 'board-step' },
      arrow ? el('span', { class: 'board-arrow', 'aria-hidden': 'true' }, icon('chevron-right', 18)) : el('span', { class: 'board-arrow' }), col)
    clear(columns).append(
      ...BOARD_COLUMNS.map((status, i) => step(column(status, of(status), false), i > 0)),
      ...COLLAPSED_COLUMNS.map((status) => step(column(status, of(status), true), false)),
    )
  } catch (error) {
    clear(columns).append(el('p', { class: 'error', text: error.message }))
  }
}

function column(status, tasks, collapsed) {
  const list = el('ul', { class: 'cards' }, ...tasks.map(card))
  const heading = `${label(status)} (${tasks.length})`
  if (collapsed) {
    return el('details', { class: 'board-col collapsed', dataset: { column: status } },
      el('summary', {}, statusIndicator(status, heading)),
      tasks.length === 0 ? el('p', { class: 'empty', text: 'None.' }) : list)
  }
  return el('section', { class: 'board-col', dataset: { column: status }, 'aria-label': heading },
    el('h3', {}, statusIndicator(status, heading)),
    tasks.length === 0 ? el('p', { class: 'empty', text: 'None.' }) : list)
}

function card(task) {
  const title = task.data.title ?? task.data.intent
  return el('li', { class: 'card-item' },
    el('button', { type: 'button', class: `card status-${task.status}`, onclick: () => emit('open-task', task.id) },
      el('span', { class: 'card-title', text: title }),
      el('span', { class: 'meta', text: `${TYPE_MARK[task.type] ?? label(task.type)} · ${task.lock_key ?? 'no account or repo'}` }),
      task.owner ? el('span', { class: 'badge owner', text: `@${task.owner}`, title: `Owned by team agent ${task.owner}` }) : null,
      task.blocked ? el('span', { class: 'badge blocked', text: 'blocked' }) : null),
    RUNNABLE.includes(task.status) ? runNowButton(task) : null)
}
