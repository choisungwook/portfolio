// One bot's conversation. The bot's own messages sit on the left with its avatar, the user's on the right, and what
// others sent the bot (queue results, other bots, discussion turns) on the left with the sender's name.
// While the bot works, a bar above the input says so with the elapsed time; Esc or Stop cancels the turn, as in
// Claude Code. Cmd/Ctrl+F finds text in the conversation. Files can be dropped, pasted or picked as attachments.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { currentView } from '../core/nav.js'
import { label } from '../core/vocab.js'
import { t } from '../core/i18n.js'
import { autosize } from '../core/autosize.js'
import { attachments } from '../core/attach.js'
import { botAvatar, senderAvatar } from './avatar.js'
import { botsSnapshot, shortTime } from './bots-sidebar.js'
import { openBotSettings } from './bot-settings.js'
import { initChatFind, refreshFind } from './chat-find.js'
import { initComposeMenus, showComposeMenus } from './compose-menus.js'
import { renderBotConnection } from './connections.js'

const POLL_MS = 5000

let nodes
let bot = null
let timer
let tick
let lastKey = null
let files
let fit
let lastEsc = 0
let pendingMessage = null

export function initBotChat() {
  nodes = {
    head: area('bot-head'), log: area('bot-log'), form: area('bot-compose'), input: area('bot-input'), working: area('chat-working'),
  }
  fit = autosize(nodes.input, 240)
  files = attachments({ zone: area('bot-chat'), button: area('bot-attach'), chips: area('bot-attachments'), pasteTarget: nodes.input })
  initChatFind(nodes.log)
  initComposeMenus(nodes.input)
  nodes.form.addEventListener('submit', send)
  nodes.input.addEventListener('keydown', (event) => {
    // Enter sends, Shift+Enter breaks the line. IME composition (Korean) must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      nodes.form.requestSubmit()
    }
    // Esc interrupts a working bot; when it is idle, Esc twice clears the input.
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault()
      if (agentNow()?.busy) {
        cancel()
      } else if (Date.now() - lastEsc < 600) {
        nodes.input.value = ''
        fit()
      }
      lastEsc = Date.now()
    }
  })
  on('bot', (name) => {
    bot = name
    lastKey = null
    clear(nodes.log)
    files.clear()
    renderHead()
    renderWorking()
    load()
    showConnection()
  })
  on('tab', (name) => {
    clearInterval(timer)
    if (name === 'bot') timer = setInterval(load, POLL_MS)
  })
  on('bots-loaded', () => {
    if (currentView().view === 'bot') {
      renderHead()
      renderWorking()
      // The panel follows turns as they end, at most every 30 s (the server caches the checks for a minute).
      if (Date.now() - connectionShownAt > 30_000) showConnection()
    }
  })
  // Search results open the conversation at a message; it is scrolled to and flashed once the log is drawn.
  on('focus-message', (id) => {
    pendingMessage = id
    focusPending()
  })
}

let connectionShownAt = 0
function showConnection() {
  connectionShownAt = Date.now()
  if (bot) renderBotConnection(area('bot-side'), bot)
}

function agentNow() {
  return botsSnapshot()?.agents.find((a) => a.name === bot)
}

function renderHead() {
  const team = botsSnapshot()
  const agent = agentNow()
  if (!agent) {
    clear(nodes.head).append(el('h2', { text: bot ?? '' }))
    return
  }
  const owned = team.tasks.filter((task) => task.owner === bot)
  const facts = [agent.role, `${agent.permission_mode} mode`]
  if (agent.sandbox) facts.push('sandboxed')
  if (agent.blocked_commands.length) facts.push(`${agent.blocked_commands.length} blocked command${agent.blocked_commands.length === 1 ? '' : 's'}`)
  if (!agent.enabled) facts.push(t('bots.disabled', 'disabled'))
  if (!agent.session_id) facts.push('no session yet')
  clear(nodes.head).append(
    botAvatar(bot, 64, agent.sdk),
    el('div', { class: 'chat-who' },
      el('h2', { text: agent.name }),
      el('p', { class: 'meta', text: facts.join(' · ') }),
      el('p', { class: 'chat-desc', text: agent.description }),
      owned.length === 0 ? null : el('ul', { class: 'chat-tasks', 'aria-label': `Tasks ${agent.name} owns` },
        ...owned.map((task) => el('li', {},
          el('button', { type: 'button', class: 'chip-button', dataset: { status: task.status }, onclick: () => emit('open-task', task.id) },
            el('span', { text: task.task_title }), el('span', { class: 'meta', text: ` · ${label(task.status)}` }))))),
    ),
    el('button', {
      type: 'button', class: 'chat-gear', 'aria-label': `${agent.name} ${t('bots.settings', 'settings')}`, title: t('bots.settings', 'Settings'),
      text: '⚙', onclick: () => openBotSettings(agent.name),
    }),
  )
  showComposeMenus(agent)
  nodes.input.placeholder = `${t('chat.message', 'Message')} ${agent.name}`
  nodes.input.disabled = !agent.enabled
}

// The working bar: a pulsing dot, the elapsed time, the task being worked on, and how to stop.
function renderWorking() {
  clearInterval(tick)
  const agent = agentNow()
  const queued = agent?.queued ? ` · ${agent.queued} ${t('chat.queued', 'waiting')}` : ''
  if (agent && !agent.busy && agent.queued) {
    // Mail is waiting but every turn slot is taken (or the bots are paused): say so instead of looking idle.
    clear(nodes.working).append(el('span', { class: 'meta', text: `${agent.queued} ${t('chat.queued_idle', 'messages waiting for a free turn slot')}` }))
    nodes.working.hidden = false
    return
  }
  if (!agent?.busy || !agent.working_since) {
    nodes.working.hidden = true
    return
  }
  const draw = () => {
    const seconds = Math.max(0, Math.floor(Date.now() / 1000) - agent.working_since)
    const time = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    const task = agent.running_tasks?.length ? ` · task ${agent.running_tasks.join(', ')}` : ''
    clear(nodes.working).append(
      el('span', { class: 'pulse', 'aria-hidden': 'true' }),
      el('span', { text: `${t('chat.working', 'Working')}… ${time}${task}${queued}` }),
      el('span', { class: 'meta', text: ` · ${t('chat.esc', 'esc to interrupt')}` }),
      el('button', { type: 'button', class: 'danger-quiet', text: t('chat.stop', 'Stop'), onclick: cancel }),
    )
  }
  draw()
  tick = setInterval(draw, 1000)
  nodes.working.hidden = false
}

async function cancel() {
  if (!bot) return
  const ok = await mutate(() => api.post(`/bots/${bot}/cancel`), `${bot}: ${t('chat.cancelled', 'cancelled')}`)
  if (ok) emit('bots-changed')
}

async function load() {
  if (!bot) return
  const name = bot
  try {
    const messages = (await api.get(`/bots/messages?agent=${encodeURIComponent(name)}&limit=200`)).reverse()
    if (bot !== name) return
    const key = `${messages.at(-1)?.id ?? 0}:${messages.length}`
    if (key === lastKey && nodes.log.childElementCount > 0) return
    const atBottom = nodes.log.scrollHeight - nodes.log.scrollTop - nodes.log.clientHeight < 40
    lastKey = key
    clear(nodes.log).append(...(messages.length === 0
      ? [el('p', { class: 'empty chat-empty', text: t('chat.empty', 'No messages yet.') })]
      : messages.map((m) => bubble(m, name))))
    if (atBottom || nodes.log.dataset.first !== name) nodes.log.scrollTop = nodes.log.scrollHeight
    nodes.log.dataset.first = name
    refreshFind()
    focusPending()
    if (messages.some((m) => m.sender === name && m.recipient === 'user' && !m.read_at)) {
      await api.post('/bots/messages/read', { agent: name })
      emit('bots-changed')
    }
  } catch (error) {
    clear(nodes.log).append(el('p', { class: 'error', text: error.message }))
  }
}

function focusPending() {
  if (pendingMessage === null) return
  const node = nodes.log.querySelector(`[data-id="${pendingMessage}"]`)
  if (!node) return
  pendingMessage = null
  node.scrollIntoView({ block: 'center' })
  node.classList.add('flash')
  setTimeout(() => node.classList.remove('flash'), 1600)
}

function parseFiles(value) {
  if (Array.isArray(value)) return value
  try {
    return JSON.parse(value ?? '[]')
  } catch {
    return []
  }
}

function bubble(m, name) {
  const side = m.sender === 'user' ? 'me' : m.sender === name ? 'bot' : 'other'
  const notes = []
  if (m.sender === name && m.recipient !== 'user') notes.push(`→ ${m.recipient}`)
  if (m.thread_id) notes.push(`discussion #${m.thread_id}`)
  if (m.deliver_at > m.created_at) notes.push(`${t('chat.scheduled', 'scheduled')} ${shortTime(m.deliver_at)}`)
  const cancelled = m.sender === 'queue' && m.body === 'The user cancelled this turn.'
  const attached = parseFiles(m.attachments)
  return el('div', { class: 'msg', dataset: { side, id: String(m.id), cancelled: String(cancelled) } },
    side === 'me' ? null : senderAvatar(m.sender, 32),
    el('div', { class: 'msg-body' },
      side === 'other' ? el('span', { class: 'msg-sender', text: m.sender }) : null,
      el('div', { class: 'bubble', text: cancelled ? t('chat.cancelled', 'Cancelled') : m.body }),
      attached.length === 0 ? null : el('div', { class: 'msg-files' }, ...attached.map((path) => el('button', {
        type: 'button', class: 'file-chip', text: path.split('/').pop(), title: path, onclick: () => download(path),
      }))),
      el('span', { class: 'msg-meta' },
        `${shortTime(m.created_at)}${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
        m.task_id ? el('button', { type: 'button', class: 'link', text: ` · task ${m.task_id}`, onclick: () => emit('open-task', m.task_id) }) : null)))
}

// Downloads go through fetch, because the API needs the token header that a plain link cannot send.
export async function download(path) {
  try {
    const blob = await api.blob(`/shared/file?path=${encodeURIComponent(path)}`)
    const url = URL.createObjectURL(blob)
    const link = el('a', { href: url, download: path.split('/').pop() })
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  } catch (error) {
    notify(error.message, true)
  }
}

async function send(event) {
  event.preventDefault()
  const body = nodes.input.value.trim()
  const attached = files.files()
  if ((!body && attached.length === 0) || !bot) return
  if (files.busy()) {
    notify('Wait for the attachments to finish uploading', true)
    return
  }
  const ok = await mutate(() => api.post('/bots/messages', { to: bot, body, attachments: attached }))
  if (ok) {
    nodes.input.value = ''
    fit()
    files.clear()
    lastKey = null
    await load()
    nodes.log.scrollTop = nodes.log.scrollHeight
    emit('bots-changed')
  }
}
