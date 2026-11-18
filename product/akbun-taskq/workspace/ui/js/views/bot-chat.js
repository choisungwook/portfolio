// One bot's conversation. The bot's own messages sit on the left with its avatar, the user's on the right, and what
// others sent the bot (taskq results, other bots, discussion turns) on the left with the sender's avatar and name.
// The header shows the bot's role, whether it is working, and the unfinished tasks it owns.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { currentView } from '../core/nav.js'
import { label } from '../core/vocab.js'
import { botAvatar, senderAvatar } from './avatar.js'
import { botsSnapshot, shortTime } from './bots-sidebar.js'

const POLL_MS = 5000

let nodes
let bot = null
let timer
let lastId = null

export function initBotChat() {
  nodes = { head: area('bot-head'), log: area('bot-log'), form: area('bot-compose'), input: area('bot-input') }
  nodes.form.addEventListener('submit', send)
  nodes.input.addEventListener('keydown', (event) => {
    // Enter sends, Shift+Enter breaks the line, as in chat apps. IME composition (Korean) must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      nodes.form.requestSubmit()
    }
  })
  on('bot', (name) => {
    bot = name
    lastId = null
    clear(nodes.log)
    renderHead()
    load()
  })
  on('tab', (name) => {
    clearInterval(timer)
    if (name === 'bot') timer = setInterval(load, POLL_MS)
  })
  on('bots-loaded', () => {
    if (currentView().view === 'bot') renderHead()
  })
}

function renderHead() {
  const team = botsSnapshot()
  const agent = team?.agents.find((a) => a.name === bot)
  if (!agent) {
    clear(nodes.head).append(el('h2', { text: bot ?? '' }))
    return
  }
  const owned = team.tasks.filter((t) => t.owner === bot)
  clear(nodes.head).append(
    botAvatar(bot, 64),
    el('div', { class: 'chat-who' },
      el('h2', { text: agent.name }),
      el('p', { class: 'meta', text: `${agent.role}${agent.enabled ? '' : ' · disabled'}${agent.busy ? ' · working now' : ''}${agent.session_id ? '' : ' · no session yet'}` }),
      el('p', { class: 'chat-desc', text: agent.description }),
      owned.length === 0 ? null : el('ul', { class: 'chat-tasks', 'aria-label': `Tasks ${agent.name} owns` },
        ...owned.map((t) => el('li', {},
          el('button', { type: 'button', class: 'chip-button', onclick: () => emit('open-task', t.id) },
            el('span', { text: t.task_title }), el('span', { class: 'meta', text: ` · ${label(t.status)}` }))))),
    ),
  )
  nodes.input.placeholder = `Message ${agent.name}`
  nodes.input.disabled = !agent.enabled
}

async function load() {
  if (!bot) return
  const name = bot
  try {
    const messages = (await api.get(`/bots/messages?agent=${encodeURIComponent(name)}&limit=200`)).reverse()
    if (bot !== name) return
    const newest = messages.at(-1)?.id ?? null
    if (newest === lastId && nodes.log.childElementCount > 0) return
    const atBottom = nodes.log.scrollHeight - nodes.log.scrollTop - nodes.log.clientHeight < 40
    lastId = newest
    clear(nodes.log).append(...(messages.length === 0
      ? [el('p', { class: 'empty chat-empty', text: `No messages with ${name} yet.` })]
      : messages.map((m) => bubble(m, name))))
    if (atBottom || nodes.log.dataset.first !== name) nodes.log.scrollTop = nodes.log.scrollHeight
    nodes.log.dataset.first = name
    if (messages.some((m) => m.sender === name && m.recipient === 'user' && !m.read_at)) {
      await api.post('/bots/messages/read', { agent: name })
      emit('bots-changed')
    }
  } catch (error) {
    clear(nodes.log).append(el('p', { class: 'error', text: error.message }))
  }
}

function bubble(m, name) {
  const side = m.sender === 'user' ? 'me' : m.sender === name ? 'bot' : 'other'
  const notes = []
  if (m.sender === name && m.recipient !== 'user') notes.push(`to ${m.recipient}`)
  if (m.thread_id) notes.push(`discussion #${m.thread_id}`)
  if (m.deliver_at > m.created_at) notes.push(`scheduled for ${shortTime(m.deliver_at)}`)
  return el('div', { class: 'msg', dataset: { side } },
    side === 'me' ? null : senderAvatar(m.sender, 32),
    el('div', { class: 'msg-body' },
      side === 'other' ? el('span', { class: 'msg-sender', text: m.sender }) : null,
      el('div', { class: 'bubble', text: m.body }),
      el('span', { class: 'msg-meta' },
        `${shortTime(m.created_at)}${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
        m.task_id ? el('button', { type: 'button', class: 'link', text: ` · task ${m.task_id}`, onclick: () => emit('open-task', m.task_id) }) : null)))
}

async function send(event) {
  event.preventDefault()
  const body = nodes.input.value.trim()
  if (!body || !bot) return
  const ok = await mutate(() => api.post('/bots/messages', { to: bot, body }))
  if (ok) {
    nodes.input.value = ''
    lastId = null
    await load()
    nodes.log.scrollTop = nodes.log.scrollHeight
    emit('bots-changed')
  }
}
