// Search as a dialog over the page, opened from the sidebar or Cmd/Ctrl+K, like a command palette. Tabs narrow it to
// conversations, tasks or bots. With nothing typed it lists what needs me, recent conversations and actions; typed, it
// asks the server once per pause (conversations from the trigram index, past runs from FTS) and filters tasks and bots
// it already has. Arrow keys move, Enter opens.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { show } from '../core/nav.js'
import { t } from '../core/i18n.js'
import { icon } from '../core/icons.js'
import { senderAvatar } from './avatar.js'
import { botsSnapshot, shortTime } from './bots-sidebar.js'

// Bots covers a bot by name and what was said in its conversations; there is no separate conversations tab.
const TABS = [['all', 'search.all', 'All'], ['tasks', 'search.tasks', 'Tasks'], ['bots', 'nav.bots', 'Bots']]
const NEEDS_ME = new Set(['needs_approval', 'needs_auth'])

let dialog
let input
let body
let tabs
let tab = 'all'
let timer
let seq = 0
let allTasks = []

export function initSearchView() {
  dialog = area('search-dialog')
  input = area('msg-query')
  body = area('msg-hits')
  tabs = area('search-tabs')
  area('search-open').addEventListener('click', open)
  area('search-close-dialog').addEventListener('click', () => dialog.close())
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close()
  })
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(run, 200)
  })
  dialog.addEventListener('keydown', onKey)
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      open()
    }
  })
  renderTabs()
}

// Tasks come from the full list (bot-owned and queue tasks); the bots snapshot only has bot-owned ones.
async function open() {
  if (!dialog.open) dialog.showModal()
  input.value = ''
  input.focus()
  run()
  allTasks = (await api.get('/tasks').catch(() => []))
    .filter((task) => !['done', 'failed', 'cancelled'].includes(task.status))
    .map((task) => ({ id: task.id, status: task.status, owner: task.owner, task_title: task.data?.title ?? task.data?.intent ?? task.id }))
  if (dialog.open && !input.value.trim()) run()
}

function renderTabs() {
  clear(tabs).append(...TABS.map(([id, key, english]) => el('button', {
    type: 'button', role: 'tab', 'aria-selected': String(id === tab), text: t(key, english),
    onclick: () => {
      tab = id
      renderTabs()
      run()
      input.focus()
    },
  })))
}

function onKey(event) {
  const items = [...body.querySelectorAll('.sd-item')]
  if (items.length === 0) return
  const index = items.findIndex((item) => item.dataset.active === 'true')
  let next = index
  if (event.key === 'ArrowDown') next = (index + 1) % items.length
  else if (event.key === 'ArrowUp') next = (index - 1 + items.length) % items.length
  else if (event.key === 'Enter' && !event.isComposing && document.activeElement === input) {
    event.preventDefault()
    items[Math.max(0, index)].click()
    return
  } else return
  event.preventDefault()
  activate(items, next)
}

function activate(items, index) {
  items.forEach((item, i) => { item.dataset.active = String(i === index) })
  items[index]?.scrollIntoView({ block: 'nearest' })
}

// One row: icon or avatar, the text, and a note on the right. Choosing it closes the dialog first.
function item(lead, text, note, onchoose) {
  return el('button', { type: 'button', class: 'sd-item', onclick: () => {
    dialog.close()
    onchoose()
  }, onmousemove: (event) => activate([...body.querySelectorAll('.sd-item')], [...body.querySelectorAll('.sd-item')].indexOf(event.currentTarget)) },
  el('span', { class: 'sd-lead' }, lead), el('span', { class: 'sd-text' }, text), note ? el('span', { class: 'sd-note', text: note }) : null)
}

function section(title, rows) {
  if (rows.length === 0) return null
  return el('section', { class: 'sd-section' }, el('h3', { text: title }), ...rows)
}

const taskRow = (task) => item(icon('board', 20), task.task_title ?? task.id, task.owner ?? task.status, () => emit('open-task', task.id))
const botRow = (agent) => item(senderAvatar(agent.name, 22), agent.name, agent.last_message ? shortTime(agent.last_message.created_at) : '', () => show('bot', agent.name))

function draw(...sections) {
  const shown = sections.filter(Boolean)
  clear(body).append(...(shown.length || draw.pending ? shown : [el('p', { class: 'empty sd-empty', text: t('search.none', 'Nothing matches.') })]))
  activate([...body.querySelectorAll('.sd-item')], 0)
}

async function run() {
  const query = input.value.trim()
  const id = ++seq
  const team = botsSnapshot() ?? { agents: [] }
  const wants = (kind) => tab === 'all' || tab === kind
  if (!query) {
    const needs = [
      ...team.agents.filter((a) => a.unread > 0).map((a) => item(senderAvatar(a.name, 22), a.name, `${a.unread} ${t('search.unread', 'unread')}`, () => show('bot', a.name))),
      ...allTasks.filter((task) => NEEDS_ME.has(task.status)).map(taskRow),
    ]
    const recent = [...team.agents].filter((a) => a.last_message).sort((a, b) => b.last_message.created_at - a.last_message.created_at).slice(0, 6)
    draw(
      tab === 'all' ? section(t('search.needs_me', 'Needs attention'), needs) : null,
      wants('bots') ? section(t('search.recent', 'Recent'), recent.map(botRow)) : null,
      wants('tasks') ? section(t('search.open_tasks', 'Open tasks'), tab === 'tasks' ? allTasks.slice(0, 20).map(taskRow) : []) : null,
      tab === 'all' ? section(t('search.actions', 'Actions'), [
        item(icon('plus', 20), t('header.new_task', 'New task'), '', () => area('new-task-button').click()),
        item(icon('plus', 20), t('bots.add', 'Add a bot'), '', () => area('bot-add').click()),
      ]) : null,
    )
    return
  }
  const lower = query.toLowerCase()
  const bots = wants('bots') ? team.agents.filter((a) => `${a.name} ${a.description ?? ''}`.toLowerCase().includes(lower)).map(botRow) : []
  const tasks = wants('tasks') ? allTasks.filter((task) => (task.task_title ?? '').toLowerCase().includes(lower)).map(taskRow) : []
  draw.pending = true
  draw(section(t('nav.bots', 'Bots'), bots), section(t('search.tasks', 'Tasks'), tasks))
  draw.pending = false
  try {
    const [hits, runs] = await Promise.all([
      wants('bots') ? api.get(`/bots/search?q=${encodeURIComponent(query)}`).catch(() => []) : [],
      wants('tasks') ? api.get(`/search?q=${encodeURIComponent(query)}`).catch(() => []) : [],
    ])
    if (id !== seq) return
    const bot = (hit) => (hit.sender === 'user' || hit.sender === 'queue' ? hit.recipient : hit.sender)
    draw(
      section(t('nav.bots', 'Bots'), bots),
      section(t('search.messages', 'Conversations'), hits.map((hit) => item(senderAvatar(hit.sender, 22), highlight(hit.snippet, query), `${bot(hit)} · ${shortTime(hit.created_at)}`, () => {
        show('bot', bot(hit))
        emit('focus-message', hit.id)
      }))),
      section(t('search.tasks', 'Tasks'), [...tasks, ...runs.slice(0, 10).map((row) => item(icon('list', 20), row.task_title ?? row.task_id, t('search.run', 'past run'), () => emit('open-run', row.run_id)))]),
    )
  } catch (error) {
    if (id === seq) clear(body).append(el('p', { class: 'error sd-empty', text: error.message }))
  }
}

function highlight(snippet, query) {
  const node = el('span', { class: 'search-snippet' })
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2)
  const lower = snippet.toLowerCase()
  let from = 0
  while (from < snippet.length) {
    let next = -1
    let term = ''
    for (const candidate of terms) {
      const at = lower.indexOf(candidate, from)
      if (at >= 0 && (next < 0 || at < next)) {
        next = at
        term = candidate
      }
    }
    if (next < 0) break
    node.append(snippet.slice(from, next), el('mark', { text: snippet.slice(next, next + term.length) }))
    from = next + term.length
  }
  node.append(snippet.slice(from))
  return node
}
