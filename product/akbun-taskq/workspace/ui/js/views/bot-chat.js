// One bot's conversation. The bot's own messages sit on the left with its avatar, the user's on the right, and what
// others sent the bot (queue results, other bots, discussion turns) on the left with the sender's name.
// While the bot works, a bar above the input says so with the elapsed time; Esc or Stop cancels the turn, as in
// Claude Code. Cmd/Ctrl+F finds text in the conversation. Files can be dropped, pasted or picked as attachments.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el, fill } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { currentView, show } from '../core/nav.js'
import { label } from '../core/vocab.js'
import { t } from '../core/i18n.js'
import { autosize } from '../core/autosize.js'
import { attachments } from '../core/attach.js'
import { botAvatar, senderAvatar } from './avatar.js'
import { botsSnapshot, shortTime } from './bots-sidebar.js'
import { openBotSettings } from './bot-settings.js'
import { initChatFind, refreshFind } from './chat-find.js'
import { initComposeMenus, showComposeMenus } from './compose-menus.js'
import { botConnection } from './connections.js'
import { download, showFile } from './file-viewer.js'
import { icon } from '../core/icons.js'

export { download }

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
let conversationFiles = []

export function initBotChat() {
  nodes = {
    head: area('bot-head'), log: area('bot-log'), form: area('bot-compose'), input: area('bot-input'), working: area('chat-working'),
  }
  fit = autosize(nodes.input, 240)
  files = attachments({ zone: area('bot-chat'), chips: area('bot-attachments'), pasteTarget: nodes.input })
  initAttachMenu()
  area('bot-stop').addEventListener('click', cancel)
  initChatFind(nodes.log)
  initComposeMenus(nodes.input)
  nodes.form.addEventListener('submit', send)
  nodes.input.addEventListener('keydown', (event) => {
    // Enter sends, Shift+Enter breaks the line. IME composition (Korean) must not send.
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault()
      nodes.form.requestSubmit()
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'u') {
      event.preventDefault()
      files.pick()
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
    conversationFiles = []
    setPane(null)
    sendError = null
    blocker = null
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
let blocker = null
function showConnection() {
  connectionShownAt = Date.now()
  const name = bot
  if (!name) return
  botConnection(name).then((info) => {
    if (bot !== name || (info?.blocker ?? null) === blocker) return
    blocker = info?.blocker ?? null
    lastKey = null
    load()
  })
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
    el('div', { class: 'chat-tools' },
      el('button', { type: 'button', class: 'chat-gear', dataset: { pane: 'files' }, 'aria-pressed': String(paneMode === 'files'), 'aria-label': t('chat.files', 'Files in this conversation'), title: t('chat.files', 'Files in this conversation'), onclick: () => togglePane('files') }, icon('files', 20)),
      el('button', { type: 'button', class: 'chat-gear', dataset: { pane: 'browser' }, 'aria-pressed': String(paneMode === 'browser'), 'aria-label': t('chat.browser', 'Browser'), title: t('chat.browser', 'Browser'), onclick: () => togglePane('browser') }, icon('globe', 20)),
    el('button', {
      type: 'button', class: 'chat-gear', 'aria-label': `${agent.name} ${t('bots.settings', 'settings')}`, title: t('bots.settings', 'Settings'),
      onclick: () => openBotSettings(agent.name),
    }, icon('settings', 20))),
  )
  showComposeMenus(agent)
  nodes.input.placeholder = `${t('chat.message', 'Message')} ${agent.name}`
  nodes.input.disabled = !agent.enabled
}

// The working bar: a pulsing dot, the elapsed time, the task being worked on, and how to stop.
function renderWorking() {
  clearInterval(tick)
  const agent = agentNow()
  area('bot-stop').hidden = !agent?.busy
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

// The conversation: the bot's messages, its failed turns (why a message went unanswered) and a message of mine the
// server refused, in time order.
let sendError = null

async function load() {
  if (!bot) return
  const name = bot
  try {
    const [list, errors] = await Promise.all([
      api.get(`/bots/messages?agent=${encodeURIComponent(name)}&limit=200`),
      api.get(`/bots/${encodeURIComponent(name)}/turn-errors?limit=50`).catch(() => []),
    ])
    const messages = list.reverse()
    if (bot !== name) return
    conversationFiles = [...new Set(messages.flatMap((m) => parseFiles(m.attachments)))].reverse()
    if (paneMode === 'files') showFiles()
    const oldest = messages[0]?.created_at ?? 0
    const failures = errors.filter((turn) => turn.ended_at >= oldest).map((turn) => ({ at: turn.ended_at, node: () => turnError(turn) }))
    const items = [...messages.map((m) => ({ at: m.created_at, node: () => bubble(m, name) })), ...failures]
      .sort((a, b) => a.at - b.at)
    if (sendError && sendError.bot === name) items.push({ at: sendError.at, node: () => refused(sendError) })
    // My last message is still unanswered and the bot cannot answer now: say why under it.
    else if (blocker && messages.at(-1)?.sender === 'user') items.push({ at: Infinity, node: () => wontAnswer(blocker) })
    const key = `${messages.at(-1)?.id ?? 0}:${messages.length}:${errors[0]?.id ?? 0}:${sendError?.at ?? 0}:${blocker ?? ''}`
    if (key === lastKey && nodes.log.childElementCount > 0) return
    const atBottom = nodes.log.scrollHeight - nodes.log.scrollTop - nodes.log.clientHeight < 40
    lastKey = key
    clear(nodes.log).append(...(items.length === 0
      ? [el('p', { class: 'empty chat-empty', text: t('chat.empty', 'No messages yet.') })]
      : items.map((item) => item.node())))
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

// A failed turn: the bot did not answer the messages it was given, and this says why.
function turnError(turn) {
  return el('div', { class: 'msg', dataset: { side: 'error', turn: String(turn.id) }, role: 'note' },
    el('div', { class: 'msg-body' },
      el('div', { class: 'bubble' }, el('strong', { text: `${t('chat.turn_failed', 'The turn failed')}: ` }), turn.error ?? t('chat.no_reason', 'no reason given')),
      el('span', { class: 'msg-meta', text: shortTime(turn.ended_at) })))
}

function wontAnswer(reason) {
  return el('div', { class: 'msg', dataset: { side: 'error' }, role: 'status' },
    el('div', { class: 'msg-body' }, el('div', { class: 'bubble' }, el('strong', { text: `${t('chat.wont_answer', 'Will not answer yet')}: ` }), reason)))
}

// A message of mine the server refused; the text stays in the input to send again.
function refused(failure) {
  return el('div', { class: 'msg', dataset: { side: 'error' }, role: 'alert' },
    el('div', { class: 'msg-body' },
      el('div', { class: 'bubble' }, el('strong', { text: `${t('chat.send_failed', 'Not sent')}: ` }), failure.message),
      el('span', { class: 'msg-meta', text: `${shortTime(failure.at)} · ${failure.body.slice(0, 80)}` })))
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
      attached.length === 0 ? null : el('div', { class: 'msg-files' }, ...attached.map(fileCard)),
      el('span', { class: 'msg-meta' },
        `${shortTime(m.created_at)}${notes.length ? ` · ${notes.join(' · ')}` : ''}`,
        m.task_id ? el('button', { type: 'button', class: 'link', text: ` · task ${m.task_id}`, onclick: () => emit('open-task', m.task_id) }) : null)))
}

// The + in the input opens a menu, as in Claude Desktop: files or photos (Cmd/Ctrl+U), a folder, slash commands, plugins.
function initAttachMenu() {
  const button = area('bot-attach')
  const menu = area('bot-attach-menu')
  const close = (focus = false) => {
    menu.hidden = true
    button.setAttribute('aria-expanded', 'false')
    if (focus) button.focus()
  }
  const item = (name, text, run, extra = null) => el('li', { role: 'none' },
    el('button', { type: 'button', role: 'menuitem', onclick: () => { close(); run() } }, icon(name, 20), el('span', { text }), extra))
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform)
  menu.append(
    item('clip', t('chat.add_files', 'Add files or photos'), () => files.pick(), el('kbd', { text: isMac ? '⌘U' : 'Ctrl+U' })),
    item('folder', t('chat.add_folder', 'Add a folder'), () => files.pickFolder()),
    item('slash', t('chat.slash', 'Slash commands'), () => {
      nodes.input.value = '/'
      nodes.input.focus()
      nodes.input.dispatchEvent(new Event('input'))
    }),
    item('plug', t('nav.plugins', 'Plugins'), () => show('plugins'), icon('chevron-right', 16)),
  )
  button.addEventListener('click', () => {
    const open = menu.hidden
    menu.hidden = !open
    button.setAttribute('aria-expanded', String(open))
    if (open) menu.querySelector('button')?.focus()
  })
  menu.addEventListener('keydown', (event) => {
    const items = [...menu.querySelectorAll('button')]
    const index = items.indexOf(document.activeElement)
    if (event.key === 'Escape') close(true)
    else if (event.key === 'ArrowDown') items[(index + 1) % items.length].focus()
    else if (event.key === 'ArrowUp') items[(index - 1 + items.length) % items.length].focus()
    else return
    event.preventDefault()
  })
  document.addEventListener('click', (event) => {
    if (!menu.hidden && !menu.contains(event.target) && !button.contains(event.target)) close()
  })
}

// A file in a message is a card wide enough to notice: icon, name, folder. It opens in the pane beside the conversation.
function fileCard(path) {
  const dir = path.split('/').slice(0, -1).join('/')
  return el('button', { type: 'button', class: 'file-card', title: path, onclick: () => openFile(path) },
    icon('file', 20),
    el('span', { class: 'file-card-name', text: path.split('/').pop() }),
    el('span', { class: 'file-card-dir', text: dir || t('nav.shared', 'Shared folder') }))
}

// The right pane shows one of: a file, every file in this conversation, or a browser. The header buttons toggle it.
let paneMode = null
let browserUrl = ''

function setPane(mode) {
  paneMode = mode
  const pane = area('bot-file')
  pane.hidden = mode === null
  for (const button of nodes.head.querySelectorAll('[data-pane]')) button.setAttribute('aria-pressed', String(button.dataset.pane === mode))
  return pane
}

function togglePane(mode) {
  if (paneMode === mode) setPane(null)
  else if (mode === 'files') showFiles()
  else showBrowser()
}

function openFile(path) {
  showFile(setPane('file'), path, { onClose: () => setPane(null) })
}

function paneHead(title) {
  return el('div', { class: 'file-head' }, el('strong', { class: 'file-name', text: title }),
    el('button', { type: 'button', class: 'quiet file-close', 'aria-label': t('file.close', 'Close'), onclick: () => setPane(null) }, icon('close', 18)))
}

function showFiles() {
  const pane = setPane('files')
  fill(pane, paneHead(t('chat.files', 'Files in this conversation')),
    el('div', { class: 'file-body' }, conversationFiles.length === 0
      ? el('p', { class: 'meta', text: t('chat.no_files', 'No files in this conversation yet.') })
      : el('div', { class: 'file-list' }, ...conversationFiles.map(fileCard))))
}

// Any page a bot built (a local dev server, a report) without leaving the conversation. Sites that forbid framing stay blank;
// "Open in a new tab" covers them.
function showBrowser() {
  const pane = setPane('browser')
  const input = el('input', { type: 'url', value: browserUrl, placeholder: 'http://localhost:3000', 'aria-label': 'URL' })
  const frame = el('iframe', { class: 'file-frame', sandbox: 'allow-scripts allow-forms allow-same-origin allow-popups', referrerpolicy: 'no-referrer', title: t('chat.browser', 'Browser'), src: browserUrl || 'about:blank' })
  const go = (event) => {
    event.preventDefault()
    let url = input.value.trim()
    if (!url) return
    if (!/^https?:\/\//i.test(url)) url = `http://${url}`
    // taskq's own origin never loads here: with allow-same-origin it could read the access token.
    if (URL.canParse(url) && new URL(url).origin === location.origin) {
      notify(t('chat.own_origin', 'taskq itself does not open in this pane'), true)
      return
    }
    browserUrl = input.value = url
    frame.src = url
  }
  fill(pane,
    el('form', { class: 'file-head browser-bar', onsubmit: go }, input,
      el('button', { type: 'submit', text: t('chat.go', 'Go') }),
      el('button', { type: 'button', class: 'quiet', text: t('chat.new_tab', 'New tab'), onclick: () => browserUrl && window.open(browserUrl, '_blank', 'noopener') }),
      el('button', { type: 'button', class: 'quiet file-close', 'aria-label': t('file.close', 'Close'), onclick: () => setPane(null) }, icon('close', 18))),
    el('div', { class: 'file-body' }, frame))
  if (!browserUrl) input.focus()
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
  let ok = false
  try {
    ok = await api.post('/bots/messages', { to: bot, body, attachments: attached })
  } catch (error) {
    sendError = { bot, body, message: error.message, at: Math.floor(Date.now() / 1000) }
    lastKey = null
    await load()
    nodes.log.scrollTop = nodes.log.scrollHeight
    return
  }
  if (ok) {
    sendError = null
    showConnection()
    nodes.input.value = ''
    fit()
    files.clear()
    lastKey = null
    await load()
    nodes.log.scrollTop = nodes.log.scrollHeight
    emit('bots-changed')
  }
}
