// Board tab in three panes: drafts on the left as an inbox, the statuses a task moves through in the middle in two rows,
// and failed (cancelled folded under it) above done on the right. Each column scrolls on its own. Cards move by drag and
// drop where the API has that move (pure/board-drop.js); a card whose last run failed shows an error icon.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { BOARD_PANES, COLLAPSED_COLUMNS, ERROR_OUTCOMES, label, TYPE_MARK } from '../core/vocab.js'
import { icon } from '../core/icons.js'
import { t } from '../core/i18n.js'
import { statusIndicator } from '../core/status.js'
import { runNowButton, RUNNABLE } from '../core/run-now.js'
import { dropRequest } from '../pure/board-drop.js'

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
    byId = new Map(tasks.map((t) => [t.id, t]))
    const col = (status) => column(status, of(status), COLLAPSED_COLUMNS.includes(status))
    const arrow = () => el('span', { class: 'board-arrow', 'aria-hidden': 'true' }, icon('chevron-right', 18))
    // The middle pane reads as the flow: an arrow between steps, three on the first row and two on the second.
    const [a, b, c, d, e] = BOARD_PANES.flow
    const body = {
      inbox: BOARD_PANES.inbox.map(col),
      flow: [col(a), arrow(), col(b), arrow(), col(c), col(d), arrow(), col(e)],
      ends: BOARD_PANES.ends.map(col),
    }
    const pane = (name, title) => el('section', { class: `board-pane board-${name}`, 'aria-label': title },
      el('h2', { class: 'board-pane-title', text: title }), el('div', { class: 'board-pane-body' }, ...body[name]))
    clear(columns).append(pane('inbox', t('board.inbox', 'Inbox')), pane('flow', t('board.flow', 'In progress')), pane('ends', t('board.ends', 'Ended')))
  } catch (error) {
    clear(columns).append(el('p', { class: 'error', text: error.message }))
  }
}

let byId = new Map()
let dragged = null

function column(status, tasks, collapsed) {
  const list = el('ul', { class: 'cards' }, ...tasks.map(card))
  const errors = tasks.filter(failedLast).length
  const heading = el('span', { class: 'col-head' }, statusIndicator(status, `${label(status)} (${tasks.length})`),
    errors ? el('span', { class: 'col-errors', title: `${errors} with a failed last run` }, icon('alert', 14), String(errors)) : null)
  const body = tasks.length === 0 ? el('p', { class: 'empty', text: 'None.' }) : list
  const node = collapsed
    ? el('details', { class: 'board-col collapsed', dataset: { column: status } }, el('summary', {}, heading), body)
    : el('section', { class: 'board-col', dataset: { column: status }, 'aria-label': `${label(status)} (${tasks.length})` }, el('h3', {}, heading), body)
  acceptDrops(node, status)
  return node
}

function failedLast(task) {
  return ERROR_OUTCOMES.includes(task.last_outcome)
}

// A column takes a card only when dropping it there is a move the server has; otherwise the cursor says no.
function acceptDrops(node, status) {
  node.addEventListener('dragover', (event) => {
    const task = dragged && byId.get(dragged)
    if (!task || !dropRequest(task, status)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    node.classList.add('drop-target')
  })
  node.addEventListener('dragleave', (event) => {
    if (!node.contains(event.relatedTarget)) node.classList.remove('drop-target')
  })
  node.addEventListener('drop', (event) => {
    event.preventDefault()
    node.classList.remove('drop-target')
    const task = dragged && byId.get(dragged)
    const request = task && dropRequest(task, status)
    if (request) mutate(() => api[request.method](request.path, request.body), `Moved to ${label(status)}`)
  })
}

function card(task) {
  const title = task.data.title ?? task.data.intent
  const failed = failedLast(task)
  return el('li', {
    class: 'card-item', draggable: 'true',
    ondragstart: (event) => {
      dragged = task.id
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', task.id)
      event.currentTarget.classList.add('dragging')
    },
    ondragend: (event) => {
      dragged = null
      event.currentTarget.classList.remove('dragging')
      for (const col of columns.querySelectorAll('.drop-target')) col.classList.remove('drop-target')
    },
  },
    el('button', { type: 'button', class: `card status-${task.status}`, onclick: () => emit('open-task', task.id) },
      el('span', { class: 'card-title' },
        failed ? el('span', { class: 'card-error', title: `Last run ${label(task.last_outcome)}`, 'aria-label': `Last run ${label(task.last_outcome)}` }, icon('alert', 16)) : null,
        title),
      el('span', { class: 'meta', text: `${TYPE_MARK[task.type] ?? label(task.type)} · ${task.lock_key ?? 'no account or repo'}` }),
      task.owner ? el('span', { class: 'badge owner', text: `@${task.owner}`, title: `Owned by team agent ${task.owner}` }) : null,
      task.blocked ? el('span', { class: 'badge blocked', text: 'blocked' }) : null),
    RUNNABLE.includes(task.status) ? runNowButton(task) : null)
}
