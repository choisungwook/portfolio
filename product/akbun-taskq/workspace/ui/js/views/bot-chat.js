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
import { fmtExact } from '../core/time.js'
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
  initComposeMenus(nodes.input, { onPickFile: (path) => files.addExisting(path) })
  nodes.form.addEventListener('submit', send)
  document.addEventListener('keydown', onShortcut)
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
    // Esc closes an open right pane first; only with nothing open does it interrupt the bot or clear the input.
    if (event.key === 'Escape' && !event.isComposing && !event.defaultPrevented && paneMode !== null) {
      event.preventDefault()
      setPane(null)
      return
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
    // A new bot's column must not show the old bot's PRs; reopening reads it again at once instead of waiting 15 s.
    if (bot !== name) area('bot-side').hidden = true
    bot = name
    sideAt = { bot: null, at: 0 }
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
  on('connections-changed', showConnection)
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
      // Only the name is shown; role, mode and description stay in its tooltip and in the bot's settings.
      el('h2', { text: agent.name, title: [facts.join(' · '), agent.description].filter(Boolean).join('\n') }),
      owned.length === 0 ? null : el('ul', { class: 'chat-tasks', 'aria-label': `Tasks ${agent.name} owns` },
        ...owned.map((task) => el('li', {},
          el('button', { type: 'button', class: 'chip-button', dataset: { status: task.status }, onclick: () => emit('open-task', task.id) },
            el('span', { text: task.task_title }), el('span', { class: 'meta', text: ` · ${label(task.status)}` }))))),
    ),
    el('div', { class: 'chat-tools' },
      headButton({ pane: 'files', label: t('chat.files_short', 'Files'), keys: 'F', iconName: 'folder', onclick: () => togglePane('files') }),
      headButton({ pane: 'browser', label: t('chat.browser', 'Browser'), keys: 'B', iconName: 'globe', onclick: () => togglePane('browser') }),
      headButton({ label: t('bots.settings', 'Settings'), keys: ',', iconName: 'settings', aria: `${agent.name} ${t('bots.settings', 'settings')}`, onclick: () => openBotSettings(agent.name) })),
  )
  showComposeMenus(agent)
  nodes.input.placeholder = `${t('chat.message', 'Message')} ${agent.name} · ${t('chat.at_hint', '@ for bots and files')}`
  nodes.input.disabled = !agent.enabled
}

// A round header button with a dark tooltip under it: what it does and its shortcut (Shift+Cmd, or Shift+Ctrl off a Mac).
const MAC = /Mac|iPhone|iPad/.test(navigator.platform)
const SHORTCUTS = { F: () => togglePane('files'), B: () => togglePane('browser'), ',': () => bot && openBotSettings(bot) }

function headButton({ pane, label: text, keys, iconName, aria, onclick }) {
  return el('button', {
    type: 'button', class: 'chat-gear', onclick,
    dataset: { ...(pane ? { pane } : {}), tip: text, keys: MAC ? `⇧⌘${keys}` : `Shift+Ctrl+${keys}` },
    'aria-pressed': pane ? String(paneMode === pane) : undefined,
    'aria-label': aria ?? text,
    'aria-keyshortcuts': `${MAC ? 'Meta' : 'Control'}+Shift+${keys === ',' ? 'Comma' : keys}`,
  }, icon(iconName, 20))
}

function onShortcut(event) {
  if (!event.shiftKey || !(MAC ? event.metaKey : event.ctrlKey) || currentView().view !== 'bot' || !bot) return
  // With Shift held, a comma arrives as "<" on many layouts; event.code names the key itself.
  const key = event.code === 'Comma' ? ',' : event.code.startsWith('Key') ? event.code.slice(3) : null
  if (!key || !SHORTCUTS[key] || document.querySelector('dialog[open]')) return
  event.preventDefault()
  SHORTCUTS[key]()
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
    for (const node of nodes.log.querySelectorAll('.step-time[data-since]')) node.textContent = elapsed(Number(node.dataset.since))
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
    loadSide(name)
    const steps = await api.get(`/bots/${encodeURIComponent(name)}/steps?since=${messages[0]?.created_at ?? 0}`).catch(() => [])
    if (bot !== name) return
    conversationFiles = [...new Set(messages.flatMap((m) => parseFiles(m.attachments)))].reverse()
    if (paneMode === 'files') showFiles()
    const oldest = messages[0]?.created_at ?? 0
    const failures = errors.filter((turn) => turn.ended_at >= oldest).map((turn) => ({ at: turn.ended_at, node: () => turnError(turn) }))
    const items = groupSteps([...messages.map((m) => ({ at: m.created_at, node: () => bubble(m, name) })), ...failures,
      ...steps.map((step) => ({ at: step.at, step }))].sort((a, b) => a.at - b.at))
    if (sendError && sendError.bot === name) items.push({ at: sendError.at, node: () => refused(sendError) })
    // My last message is still unanswered and the bot cannot answer now: say why under it.
    else if (blocker && messages.at(-1)?.sender === 'user') items.push({ at: Infinity, node: () => wontAnswer(blocker) })
    const running = Boolean(agentNow()?.busy)
    const key = `${messages.at(-1)?.id ?? 0}:${messages.length}:${errors[0]?.id ?? 0}:${steps.at(-1)?.id ?? 0}:${running}:${sendError?.at ?? 0}:${blocker ?? ''}`
    if (key === lastKey && nodes.log.childElementCount > 0) return
    const atBottom = nodes.log.scrollHeight - nodes.log.scrollTop - nodes.log.clientHeight < 40
    lastKey = key
    clear(nodes.log).append(...(items.length === 0
      ? [el('p', { class: 'empty chat-empty', text: t('chat.empty', 'No messages yet.') })]
      : items.map((item, i) => item.node(running && i === items.length - 1))))
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

// The right column, as in Claude Desktop: the bot's open pull requests, to review them straight away, and its background
// work (bots working on what it sent, its unfinished tasks, how many finished today). Read every 15 s at most, since a PR
// state is a gh call; hidden while it has nothing to show or the file pane takes the column.
const SIDE_MS = 15000
let sideAt = { bot: null, at: 0 }

async function loadSide(name) {
  if (sideAt.bot === name && Date.now() - sideAt.at < SIDE_MS) return
  sideAt = { bot: name, at: Date.now() }
  const side = area('bot-side')
  const a = await api.get(`/bots/${encodeURIComponent(name)}/activity`).catch(() => null)
  if (bot !== name) return
  if (!a || (!a.pull_requests.length && !a.background.length && !a.sub_sessions.length && !a.finished)) {
    side.hidden = true
    return
  }
  const row = (iconName, title, meta, props) => el(props.href ? 'a' : 'button', { class: 'side-row', ...(props.href ? {} : { type: 'button' }), ...props },
    icon(iconName, 18), el('span', { class: 'side-text' }, el('span', { class: 'side-title', text: title }), meta ? el('span', { class: 'side-meta', text: meta }) : null))
  const section = (title, rows) => rows.length ? el('section', {}, el('h2', { class: 'side-head', text: title }), ...rows) : null
  clear(side).append(...[
    section(t('side.changes', 'Changes'), a.pull_requests.map((pr) => row('pull-request', pr.title ?? pr.url.replace('https://github.com/', ''), `#${pr.number}`,
      { href: pr.url, target: '_blank', rel: 'noopener noreferrer', title: pr.url }))),
    section(t('side.background', 'Background work'), [
      ...a.sub_sessions.map((s) => row('terminal', s.agent, `${t('chat.working', 'Working')} ${elapsed(s.started_at)}`, { onclick: () => show('bot', s.agent) })),
      ...a.background.map((task) => row('terminal', task.task_title, label(task.status), { onclick: () => emit('open-task', task.id) })),
      ...(a.finished ? [el('p', { class: 'side-row side-done' }, icon('done', 18), el('span', { text: t('side.finished', '{n} finished').replace('{n}', a.finished) }))] : []),
    ]),
  ].filter(Boolean))
  side.hidden = false
}

// Tool calls in a row, with nothing said between them, fold into one line as in Claude Code: "Ran Bash git fetch…"
// for one call, "Ran 6 tools" for more. The line opens into the list. While the bot is still on the last group, the line
// shows the call it is making now with spinning dots and how long it has been at it.
const openSteps = new Set()

function groupSteps(items) {
  const out = []
  for (const item of items) {
    const last = out.at(-1)
    if (item.step && last?.steps) last.steps.push(item.step)
    else if (item.step) out.push({ at: item.at, steps: [item.step] })
    else out.push(item)
  }
  return out.map((item) => item.steps ? { at: item.at, node: (live) => stepGroup(item.steps, live) } : item)
}

function stepGroup(steps, live) {
  const first = steps[0].id
  const now = steps.at(-1)
  const summary = live
    ? [el('span', { class: 'step-spinner', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'), el('i')),
        el('span', { class: 'step-tool', text: now.tool }), el('span', { class: 'step-detail', text: now.detail }),
        el('span', { class: 'step-time', dataset: { since: String(now.at) }, text: elapsed(now.at) })]
    : steps.length === 1
      ? [el('span', { class: 'step-verb', text: t('chat.ran', 'Ran') }), el('span', { class: 'step-tool', text: now.tool }), el('span', { class: 'step-detail', text: now.detail })]
      : [el('span', { class: 'step-verb', text: t('chat.ran_tools', 'Ran {n} tools').replace('{n}', steps.length) })]
  const details = el('details', { class: 'steps', dataset: { live: String(live) }, open: openSteps.has(first) || undefined },
    el('summary', {}, ...summary, icon('chevron-right', 16)),
    el('ol', { class: 'step-list' }, ...steps.map((step) => el('li', {},
      el('span', { class: 'step-tool', text: step.tool }), el('span', { class: 'step-detail', text: step.detail })))))
  details.addEventListener('toggle', () => (details.open ? openSteps.add(first) : openSteps.delete(first)))
  return details
}

function elapsed(at) {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - at)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

// A failed turn: the bot did not answer the messages it was given, and this says why.
function turnError(turn) {
  return el('div', { class: 'msg', dataset: { side: 'error', turn: String(turn.id) }, role: 'note' },
    el('div', { class: 'msg-body' },
      el('div', { class: 'bubble' }, el('strong', { text: `${t('chat.turn_failed', 'The turn failed')}: ` }), turn.error ?? t('chat.no_reason', 'no reason given')),
      el('span', { class: 'msg-meta' }, when(turn.ended_at))))
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
      el('span', { class: 'msg-meta' }, when(failure.at), ` · ${failure.body.slice(0, 80)}`)))
}

// A message's short time; hovering it shows the exact moment.
function when(sec) {
  return el('time', { datetime: new Date(sec * 1000).toISOString(), title: fmtExact(sec), text: shortTime(sec) })
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
        when(m.created_at), notes.length ? ` · ${notes.join(' · ')}` : '',
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
  // Esc anywhere on the page closes what is on top: the + menu, else the right pane. A dialog's own Esc stays its own.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || document.querySelector('dialog[open]')) return
    if (!menu.hidden) close(true)
    else if (paneMode !== null && currentView().view === 'bot') setPane(null)
    else return
    event.preventDefault()
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
  if (mode !== 'browser') stopScreen()
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

// The bot's own browser (src/browser/), as Claude Desktop shows the browser its session drives: a picture of what the
// bot's headless Chrome shows, refreshed every second while the pane is open. The address bar opens a page in that same
// browser and a click on the picture clicks the page there, so the user and the bot take turns in one browser.
const SCREEN_MS = 1000
let screenTimer = null

function stopScreen() {
  clearTimeout(screenTimer)
  screenTimer = null
}

function showBrowser() {
  const pane = setPane('browser')
  const name = bot
  const input = el('input', { type: 'text', value: browserUrl, placeholder: 'https://example.com', 'aria-label': 'URL', spellcheck: 'false' })
  const status = el('p', { class: 'meta browser-status', role: 'status' })
  // Sites where the user let this bot click and type; × takes one back.
  const sites = el('div', { class: 'browser-sites' })
  let sitesKey = null
  const drawSites = (list) => {
    const key = list.join(' ')
    if (key === sitesKey) return
    sitesKey = key
    fill(sites, ...(list.length ? [el('span', { class: 'meta', text: t('chat.browser_sites', 'Allowed to click and type on') })] : []),
      ...list.map((host) => el('span', { class: 'browser-site' }, host,
        el('button', { type: 'button', class: 'quiet', 'aria-label': `${t('chat.browser_forget', 'Take back')} ${host}`, onclick: async () => {
          const done = await mutate(() => api.del(`/bots/${encodeURIComponent(name)}/browser/sites/${encodeURIComponent(host)}`))
          if (done) drawSites(done.sites)
        } }, icon('close', 14)))))
  }
  const img = el('img', { class: 'browser-screen', alt: t('chat.browser_alt', "The bot's browser"), hidden: true })
  let url = null
  const open = async (event) => {
    event.preventDefault()
    const target = input.value.trim()
    if (!target) return
    status.textContent = t('chat.browser_opening', 'Opening…')
    const done = await mutate(() => api.post(`/bots/${encodeURIComponent(name)}/browser/open`, { url: target }))
    if (done) browserUrl = input.value = done.url
    refresh()
  }
  // The picture is the page at 1280 CSS pixels wide, shown scaled; a click is mapped back to page pixels.
  img.addEventListener('click', async (event) => {
    const box = img.getBoundingClientRect()
    const scale = img.naturalWidth / box.width
    await mutate(() => api.post(`/bots/${encodeURIComponent(name)}/browser/click`, { x: (event.clientX - box.left) * scale, y: (event.clientY - box.top) * scale }))
    refresh()
  })
  const refresh = async () => {
    stopScreen()
    if (paneMode !== 'browser' || bot !== name) return
    try {
      const state = await api.get(`/bots/${encodeURIComponent(name)}/browser`)
      drawSites(state.sites ?? [])
      if (state.running) {
        const blob = await api.blob(`/bots/${encodeURIComponent(name)}/browser/screen`)
        if (paneMode !== 'browser' || bot !== name) return
        if (url) URL.revokeObjectURL(url)
        url = URL.createObjectURL(blob)
        img.src = url
        img.hidden = false
        status.textContent = state.title || state.url
        if (document.activeElement !== input) browserUrl = input.value = state.url
      } else {
        img.hidden = true
        status.textContent = t('chat.browser_none', 'No browser yet. Open an address here, or ask the bot to use its browser.')
      }
    } catch (error) {
      status.textContent = error.message
    }
    screenTimer = setTimeout(refresh, SCREEN_MS)
  }
  fill(pane,
    el('form', { class: 'file-head browser-bar', onsubmit: open }, input,
      el('button', { type: 'submit', text: t('chat.go', 'Go') }),
      el('button', { type: 'button', class: 'quiet', text: t('chat.new_tab', 'New tab'), onclick: () => browserUrl && window.open(browserUrl, '_blank', 'noopener') }),
      el('button', { type: 'button', class: 'quiet file-close', 'aria-label': t('file.close', 'Close'), onclick: () => setPane(null) }, icon('close', 18))),
    el('div', { class: 'file-body browser-body' }, status, sites, img))
  refresh()
}

// Enabled bots named with @ in the text, other than the one this conversation is with.
function mentionedBots(body) {
  const names = new Set((botsSnapshot()?.agents ?? []).filter((a) => a.enabled && a.name !== bot).map((a) => a.name))
  return [...new Set([...body.matchAll(/(?:^|\s)@([a-z][a-z0-9-]*)(?=[\s,!?]|\.(?:\s|$)|$)/g)].map((m) => m[1]))].filter((name) => names.has(name))
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
    // "@coder" in the message asks that bot too: it gets the same message and files in its own conversation. The
    // message to this bot is already sent, so a failed copy is reported and not retried by sending again.
    const others = mentionedBots(body)
    const results = await Promise.allSettled(others.map((name) => api.post('/bots/messages', { to: name, body, attachments: attached })))
    const sent = others.filter((_, i) => results[i].status === 'fulfilled')
    const failed = others.filter((_, i) => results[i].status === 'rejected')
    if (sent.length) notify(`${t('chat.also_sent', 'Also sent to')} ${sent.map((name) => `@${name}`).join(', ')}`)
    if (failed.length) notify(`${t('chat.not_sent_to', 'Not sent to')} ${failed.map((name) => `@${name}`).join(', ')}: ${results.find((r) => r.status === 'rejected').reason.message}`, true)
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
