// Team tab: the resident agents, their message log, a box to message one of them, and the shared wiki.
// Agent messages do not write task events, so the SSE stream does not cover them; the tab polls while it is open.
import { api, mutate, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'

const POLL_MS = 5000

let nodes
let active = false
let timer
let openSlug = null

export function initTeam() {
  nodes = {
    status: area('team-status'),
    agents: area('team-agents'),
    form: area('team-compose'),
    to: area('team-to'),
    body: area('team-body'),
    messages: area('team-messages'),
    wiki: area('team-wiki'),
    page: area('team-page'),
  }
  nodes.form.addEventListener('submit', send)
  on('tab', (name) => {
    active = name === 'team'
    clearInterval(timer)
    if (!active) return
    load()
    timer = setInterval(load, POLL_MS)
  })
  on('refresh', () => {
    if (active) load()
  })
}

async function load() {
  try {
    const [team, messages, pages] = await Promise.all([api.get('/team'), api.get('/team/messages?limit=100'), api.get('/team/wiki')])
    renderStatus(team)
    renderAgents(team.agents)
    renderMessages(messages)
    renderWiki(pages)
    // Seeing a message here counts as reading it, as `taskq team inbox` does.
    if (messages.some((m) => m.recipient === 'user' && !m.read_at)) await api.post('/team/messages/read')
  } catch (error) {
    clear(nodes.status).append(el('p', { class: 'error', text: error.message }))
  }
}

function renderStatus(team) {
  const text = !team.enabled
    ? 'Team is off. Set team.enabled to true in taskq.config.json and restart; messages wait until then.'
    : team.paused ? `Team paused: ${team.pause_reason ?? ''}` : 'Team running'
  const toggle = !team.enabled ? null : team.paused
    ? el('button', { type: 'button', text: 'Resume team', onclick: () => mutate(() => api.post('/team/resume'), 'Team resumed').then(load) })
    : el('button', { type: 'button', text: 'Pause team', onclick: () => mutate(() => api.post('/team/pause'), 'Team paused').then(load) })
  clear(nodes.status).append(el('p', { 'aria-live': 'polite', text }), ...(toggle ? [toggle] : []))
  nodes.status.dataset.state = !team.enabled ? 'off' : team.paused ? 'paused' : 'running'
}

function renderAgents(agents) {
  const selected = nodes.to.value
  clear(nodes.to).append(...agents.filter((a) => a.enabled).map((a) => el('option', { value: a.name, text: a.name })))
  if (selected) nodes.to.value = selected
  clear(nodes.agents).append(...agents.map((a) => el('li', { class: 'team-agent', dataset: { busy: String(a.busy) } },
    el('strong', { text: a.name }),
    el('span', { class: 'meta', text: ` ${a.role}${a.enabled ? '' : ' · disabled'}${a.busy ? ' · working' : ''}${a.session_id ? '' : ' · no session yet'}` }),
    el('p', { class: 'meta', text: a.description }))))
}

function renderMessages(messages) {
  if (messages.length === 0) {
    clear(nodes.messages).append(el('p', { class: 'empty', text: 'No messages yet.' }))
    return
  }
  clear(nodes.messages).append(...messages.map((m) => el('article', { class: 'team-message', dataset: { from: m.sender === 'user' ? 'user' : m.recipient === 'user' ? 'to-user' : 'agent' } },
    el('p', { class: 'meta', text: `#${m.id} ${m.sender} → ${m.recipient} · ${fmtDateTime(m.created_at)}${m.task_id ? ` · task ${m.task_id}` : ''}${m.read_at ? '' : ' · unread'}` }),
    el('pre', { text: m.body }))))
}

function renderWiki(pages) {
  if (pages.length === 0) {
    clear(nodes.wiki).append(el('li', { class: 'empty', text: 'The wiki is empty.' }))
    return
  }
  clear(nodes.wiki).append(...pages.map((p) => el('li', {},
    el('button', { type: 'button', class: 'link', text: p.slug, 'aria-pressed': String(p.slug === openSlug), onclick: () => showPage(p.slug) }),
    el('span', { class: 'meta', text: ` r${p.revision} · ${p.updated_by} · ${p.title}` }))))
}

async function showPage(slug) {
  openSlug = slug
  try {
    const page = await api.get(`/team/wiki/page${qs({ slug })}`)
    clear(nodes.page).append(
      el('h3', { text: page.title }),
      el('p', { class: 'meta', text: `${page.slug} · revision ${page.revision} by ${page.updated_by} · ${fmtDateTime(page.updated_at)}` }),
      el('pre', { text: page.body }))
    nodes.page.hidden = false
  } catch (error) {
    clear(nodes.page).append(el('p', { class: 'error', text: error.message }))
  }
}

async function send(event) {
  event.preventDefault()
  const body = nodes.body.value.trim()
  if (!body) return
  const ok = await mutate(() => api.post('/team/messages', { to: nodes.to.value, body }), `Sent to ${nodes.to.value}`)
  if (ok) {
    nodes.body.value = ''
    load()
  }
}
