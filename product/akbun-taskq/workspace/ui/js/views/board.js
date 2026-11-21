// Board tab in three panes: drafts on the left as an inbox, running and one waiting column in the middle,
// and failed (cancelled folded under it) above done on the right. Each column scrolls on its own. Cards move by drag and
// drop where the API has that move (pure/board-drop.js); a card whose last run failed shows an error icon.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { BOARD_PANES, BOARD_WAITING, COLLAPSED_COLUMNS, ERROR_OUTCOMES, label, TYPE_MARK } from '../core/vocab.js'
import { icon } from '../core/icons.js'
import { t } from '../core/i18n.js'
import { statusIndicator } from '../core/status.js'
import { runNowButton, RUNNABLE } from '../core/run-now.js'
import { dropRequest } from '../pure/board-drop.js'
import { askConfirm } from '../core/ask.js'

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
    // Waiting holds queued, approval, login and review tasks in one column; each card names which wait it is.
    const waiting = tasks.filter((t) => BOARD_WAITING.includes(t.status))
    const body = {
      inbox: BOARD_PANES.inbox.map(col),
      flow: [col('running'), column('ready', waiting, false, t('board.waiting', 'Waiting'))],
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

function column(status, tasks, collapsed, title = label(status)) {
  const list = el('ul', { class: 'cards' }, ...tasks.map(card))
  const errors = tasks.filter(failedLast).length
  const heading = el('span', { class: 'col-head' }, statusIndicator(status, `${title} (${tasks.length})`),
    errors ? el('span', { class: 'col-errors', title: `${errors} with a failed last run` }, icon('alert', 14), String(errors)) : null)
  const body = tasks.length === 0 ? el('p', { class: 'empty', text: 'None.' }) : list
  const node = collapsed
    ? el('details', { class: 'board-col collapsed', dataset: { column: status } }, el('summary', {}, heading), body)
    : el('section', { class: 'board-col', dataset: { column: status }, 'aria-label': `${title} (${tasks.length})` }, el('h3', {}, heading), body)
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
  // The drag starts from the card button itself: WebKit (Safari, the desktop app's webview) does not start a drag from a
  // button inside a draggable parent, so the button is draggable too and the li hears the events as they bubble.
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
    el('button', { type: 'button', class: 'card', draggable: 'true', onclick: () => emit('open-task', task.id) },
      el('span', { class: 'card-title' },
        failed ? el('span', { class: 'card-error', title: `Last run ${label(task.last_outcome)}`, 'aria-label': `Last run ${label(task.last_outcome)}` }, icon('alert', 16)) : null,
        title),
      el('span', { class: 'meta', text: `${TYPE_MARK[task.type] ?? label(task.type)} · ${task.lock_key ?? 'no account or repo'}` }),
      BOARD_WAITING.includes(task.status) && task.status !== 'ready' ? statusIndicator(task.status) : null,
      task.owner ? el('span', { class: 'badge owner', text: `@${task.owner}`, title: `Owned by team agent ${task.owner}` }) : null,
      task.blocked ? el('span', { class: 'badge blocked', text: 'blocked' }) : null),
    cardActions(task))
}


// The card's buttons: Run now when it can start (off without an owner bot), Cancel while a run holds it, Delete when no
// run does. Cancel and Delete ask first; the board redraws from the server's answer, so the card moves to its new column.
const CANCELLABLE = ['running', 'needs_approval', 'needs_auth']
const UNDELETABLE = ['running', 'needs_approval']

function cardActions(task) {
  const title = task.data.title ?? task.data.intent
  const stop = (fn) => (event) => { event.stopPropagation(); fn() }
  return el('div', { class: 'card-actions' },
    RUNNABLE.includes(task.status) ? runNowButton(task) : null,
    CANCELLABLE.includes(task.status) ? el('button', {
      type: 'button', class: 'card-cancel', text: t('task.cancel', 'Cancel'),
      onclick: stop(async () => {
        if (await askConfirm(t('task.cancel_ask', 'Cancel this task? A running run is stopped.'))) mutate(() => api.post(`/tasks/${task.id}/cancel`, {}), t('task.cancelled', 'Cancelled'))
      }),
    }) : null,
    UNDELETABLE.includes(task.status) ? null : el('button', {
      type: 'button', class: 'card-delete', title: t('task.delete', 'Delete'), 'aria-label': `${t('task.delete', 'Delete')}: ${title}`,
      onclick: stop(async () => {
        if (await askConfirm(t('task.delete_ask', 'Delete this task and its runs? This cannot be undone.'))) mutate(() => api.del(`/tasks/${task.id}`), t('task.deleted', 'Deleted'))
      }),
    }, icon('close', 14), t('task.delete', 'Delete')))
}
