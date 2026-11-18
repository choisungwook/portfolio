// The Bots list in the sidebar, laid out like a chat list: avatar, name, the latest message, its time, and a dot for
// messages the bot sent the user that are still unread. Agent messages do not write task events, so the SSE stream
// does not cover them; the list polls every few seconds.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { currentView, show } from '../core/nav.js'
import { botAvatar, setRoster, userAvatar } from './avatar.js'

const POLL_MS = 5000

let list
let state
let latest = null

export function initBotsSidebar() {
  list = area('bot-list')
  state = area('bots-state')
  area('me-avatar').append(userAvatar(56))
  on('refresh', load)
  on('bots-changed', load)
  load()
  setInterval(load, POLL_MS)
}

export function botsSnapshot() {
  return latest
}

async function load() {
  try {
    latest = await api.get('/bots')
    setRoster(latest.agents.map((a) => a.name))
    render(latest)
    emit('bots-loaded', latest)
  } catch (error) {
    clear(state).append(el('span', { class: 'error', text: error.message }))
  }
}

function render(team) {
  const label = !team.enabled ? 'Off' : team.paused ? 'Paused' : 'Running'
  const toggle = !team.enabled ? null : team.paused
    ? el('button', { type: 'button', class: 'quiet', text: 'Resume', onclick: () => mutate(() => api.post('/bots/resume'), 'Bots resumed').then(load) })
    : el('button', { type: 'button', class: 'quiet', text: 'Pause', onclick: () => mutate(() => api.post('/bots/pause'), 'Bots paused').then(load) })
  clear(state).append(el('span', {
    class: 'bots-state-label', dataset: { state: label.toLowerCase() },
    title: !team.enabled ? 'Set bots.enabled to true in taskq.config.json and restart' : team.pause_reason ?? '',
    text: label,
  }), ...(toggle ? [toggle] : []))
  const selected = currentView().view === 'bot' ? currentView().bot : null
  clear(list).append(...team.agents.map((a) => el('li', {},
    el('button', {
      type: 'button', class: 'side-item side-bot', dataset: { bot: a.name, busy: String(a.busy), enabled: String(a.enabled) },
      'aria-current': a.name === selected ? 'page' : null,
      onclick: () => show('bot', a.name),
    },
    botAvatar(a.name, 44),
    el('span', { class: 'side-bot-text' },
      el('span', { class: 'side-bot-top' },
        el('strong', { text: a.name }),
        el('time', { class: 'meta', text: a.last_message ? shortTime(a.last_message.created_at) : '' })),
      el('span', { class: 'side-bot-preview', text: preview(a) })),
    a.unread > 0 ? el('span', { class: 'unread-dot', 'aria-label': `${a.unread} unread` }) : null))))
}

function preview(agent) {
  if (!agent.enabled) return 'Disabled'
  if (agent.busy) return 'Working…'
  const m = agent.last_message
  if (!m) return agent.role
  const who = m.sender === agent.name ? (m.recipient === 'user' ? '' : `→ ${m.recipient}: `) : `${m.sender}: `
  return `${who}${m.body.replaceAll('\n', ' ')}`
}

// Today: the time. Yesterday: "Yesterday". Older: the date.
export function shortTime(epoch) {
  const date = new Date(epoch * 1000)
  const now = new Date()
  const day = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diff = Math.round((day(now) - day(date)) / 86_400_000)
  if (diff === 0) return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  if (diff === 1) return 'Yesterday'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
