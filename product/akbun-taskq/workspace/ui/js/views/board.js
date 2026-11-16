// Board tab: one column per live status, with draft and failed collapsed at the end.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { BOARD_COLUMNS, COLLAPSED_COLUMNS, label, TYPE_MARK } from '../core/vocab.js'
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
    clear(columns).append(
      ...BOARD_COLUMNS.map((status) => column(status, tasks.filter((t) => t.status === status), false)),
      ...COLLAPSED_COLUMNS.map((status) => column(status, tasks.filter((t) => t.status === status), true)),
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
      task.blocked ? el('span', { class: 'badge blocked', text: 'blocked' }) : null),
    RUNNABLE.includes(task.status) ? runNowButton(task) : null)
}
