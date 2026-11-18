// The Bots list in the sidebar, laid out like a chat list: avatar, name, the latest message, its time, and a dot for
// messages the bot sent the user that are still unread. Agent messages do not write task events, so the SSE stream
// does not cover them; the list polls every few seconds.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { currentView, show } from '../core/nav.js'
import { botAvatar, setRoster } from './avatar.js'
import { openBotMenu } from './bot-menu.js'
import { openBotSettings } from './bot-settings.js'
import { t } from '../core/i18n.js'

const POLL_MS = 5000

let list
let state
let latest = null

export function initBotsSidebar() {
  list = area('bot-list')
  state = area('bots-state')
  area('bot-add').addEventListener('click', () => openBotSettings(null))
  on('refresh', load)
  on('bots-changed', load)
  load()
  setInterval(load, POLL_MS)
  setInterval(() => {
    for (const node of list.querySelectorAll('.side-bot-working')) {
      node.querySelector('.working-text').textContent = workingText(Number(node.dataset.since) || 0)
    }
  }, 1000)
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
  const label = !team.enabled ? t('bots.off', 'Off') : team.paused ? t('bots.paused', 'Paused') : t('bots.running', 'Running')
  const mode = !team.enabled ? 'off' : team.paused ? 'paused' : 'running'
  const toggle = !team.enabled ? null : team.paused
    ? el('button', { type: 'button', class: 'quiet', text: t('bots.resume', 'Resume'), onclick: () => mutate(() => api.post('/bots/resume'), 'Bots resumed').then(load) })
    : el('button', { type: 'button', class: 'quiet', text: t('bots.pause', 'Pause'), onclick: () => mutate(() => api.post('/bots/pause'), 'Bots paused').then(load) })
  clear(state).append(el('span', {
    class: 'bots-state-label', dataset: { state: mode },
    title: !team.enabled ? 'Set bots.enabled to true in taskq.config.json and restart' : team.pause_reason ?? '',
    text: label,
  }), ...(toggle ? [toggle] : []))
  const selected = currentView().view === 'bot' ? currentView().bot : null
  // The orchestrator comes first from the API (system bots sort first) and is marked so CSS can set it apart.
  clear(list).append(...team.agents.map((a) => el('li', { class: 'side-bot-row', dataset: { system: String(a.system) } },
    el('button', {
      type: 'button', class: 'side-item side-bot', dataset: { bot: a.name, busy: String(a.busy), enabled: String(a.enabled) },
      'aria-current': a.name === selected ? 'page' : null, 'aria-haspopup': 'menu',
      title: 'Right-click for more',
      onclick: () => show('bot', a.name),
      oncontextmenu: (event) => {
        event.preventDefault()
        openBotMenu(a, event.clientX, event.clientY)
      },
      onkeydown: (event) => {
        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
          event.preventDefault()
          const box = event.currentTarget.getBoundingClientRect()
          openBotMenu(a, box.left + 40, box.bottom)
        }
      },
    },
    el('span', { class: 'side-avatar', dataset: { busy: String(a.busy) } }, botAvatar(a.name, 44, a.sdk)),
    el('span', { class: 'side-bot-text' },
      el('span', { class: 'side-bot-top' },
        el('strong', { text: a.name }),
        el('time', { class: 'meta', text: a.last_message ? shortTime(a.last_message.created_at) : '' })),
      a.busy
        ? el('span', { class: 'side-bot-working', dataset: { since: String(a.working_since ?? '') } }, el('span', { class: 'pulse', 'aria-hidden': 'true' }), el('span', { class: 'working-text', text: workingText(a.working_since) }))
        : el('span', { class: 'side-bot-preview', text: preview(a) })),
    a.unread > 0 ? el('span', { class: 'unread-dot', 'aria-label': `${a.unread} unread` }) : null),
    el('button', {
      type: 'button', class: 'side-bot-gear', 'aria-label': `${a.name} settings`, title: 'Settings', text: '⚙',
      onclick: () => openBotSettings(a.name),
    }))))
}

// The elapsed time of a working bot, redrawn every second by the ticker in initBotsSidebar.
function workingText(since) {
  const seconds = since ? Math.max(0, Math.floor(Date.now() / 1000) - since) : 0
  return `${t('chat.working', 'Working')} ${seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`}`
}

function preview(agent) {
  if (!agent.enabled) return t('bots.disabled', 'Disabled')
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
