// The row under a bot's input, as in Claude Desktop: a refresh button on the left (reload the bot's skills and plugins,
// then read its model list and slash commands again) and, on the right, the model, effort and permission menus. A
// change is saved on the bot at once and applies from its next turn. Typing "/" opens the bot's slash commands; typing
// "@" anywhere offers other bots (the message goes to them too) and files of the shared folder (attached to the message).
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { currentLanguage, t } from '../core/i18n.js'
import { contextLabel, contextRing } from './context-ring.js'
import { icon } from '../core/icons.js'
import { botsSnapshot } from './bots-sidebar.js'

const MODE_LABEL = {
  auto: ['perm.auto', 'Auto'], acceptEdits: ['perm.acceptEdits', 'Accept edits'], default: ['perm.default', 'Ask (refuse)'],
  dontAsk: ['perm.dontAsk', 'Allowed tools only'], plan: ['perm.plan', 'Plan (read only)'], bypassPermissions: ['perm.bypass', 'Bypass permissions'],
}

let nodes
let bot = null
let shown = null
let catalog = null
let popup = { items: [], index: 0 }
let onFile = () => {}
let sharedFiles = null
let sharedAt = 0

export function initComposeMenus(input, { onPickFile } = {}) {
  if (onPickFile) onFile = onPickFile
  nodes = { row: area('bot-tools'), slash: area('bot-slash'), input }
  // Registered before the chat's own keydown handler, so an open command list takes Enter, Tab, arrows and Esc first.
  input.addEventListener('keydown', onKey)
  input.addEventListener('input', renderSlash)
  input.addEventListener('click', renderSlash)
  input.addEventListener('blur', () => setTimeout(closeSlash, 150))
}

export async function showComposeMenus(agent, refresh = false) {
  if (!agent) return
  const changed = bot !== agent.name
  bot = agent.name
  shown = agent
  if (changed) catalog = null
  render(agent)
  if (catalog && !refresh) return
  try {
    catalog = await api.get(`/bots/${agent.name}/catalog${refresh ? '?refresh=1' : ''}`)
  } catch (error) {
    notify(error.message, true)
    return
  }
  if (bot === agent.name) render(agent)
}

function select(labelText, value, options, onchange) {
  return el('select', { 'aria-label': labelText, title: labelText, onchange: (event) => onchange(event.target.value) },
    ...options.map(([v, text]) => el('option', { value: v, text, selected: v === value })))
}

async function save(change) {
  const ok = await mutate(() => api.put(`/bots/${bot}`, change), `${bot}: ${t('compose.saved', 'saved, applies from the next turn')}`)
  if (ok) emit('bots-changed')
  else if (shown) {
    // The select still shows the value that was not saved.
    drawn = null
    render(shown)
  }
}

// The chat redraws its head on every poll (5 s). Rebuilding the row closes a menu the user has open, so it is rebuilt
// only when what it shows changed.
let drawn = null
function render(agent) {
  const key = JSON.stringify([currentLanguage(), agent.name, agent.model, agent.effort, agent.permission_mode, contextLabel(agent), catalog])
  if (key === drawn) return
  drawn = key
  const models = catalog?.models ?? []
  const current = models.find((m) => m.id === agent.model)
  const modelOptions = [['', t('compose.model_default', 'Default model')], ...models.map((m) => [m.id, m.name])]
  if (agent.model && !current) modelOptions.push([agent.model, agent.model])
  const efforts = (current ?? models[0])?.efforts ?? []
  const effortOptions = [['', t('compose.effort_default', 'Default effort')], ...efforts.map((e) => [e, e])]
  if (agent.effort && !efforts.includes(agent.effort)) effortOptions.push([agent.effort, agent.effort])
  const modes = catalog?.permission_modes ?? [agent.permission_mode]
  const modeOptions = modes.map((m) => [m, t(...(MODE_LABEL[m] ?? [m, m]))])
  const source = catalog?.fallback ? t('compose.fallback', 'built-in list') : ''
  clear(nodes.row).append(...[
    el('button', {
      type: 'button', class: 'icon-button', title: t('compose.refresh', 'Reload skills and plugins, then the model and command lists'),
      'aria-label': t('compose.refresh', 'Reload skills and plugins, then the model and command lists'), onclick: refresh,
    }, icon('refresh', 16)),
    catalog?.commands?.length ? el('span', { class: 'meta', text: `/ ${catalog.commands.length} ${t('compose.commands', 'commands')}` }) : null,
    el('span', { class: 'compose-spacer' }),
    source ? el('span', { class: 'meta', title: catalog.error ?? '', text: source }) : null,
    select(t('compose.model', 'Model'), agent.model ?? '', modelOptions, (v) => save({ model: v || null })),
    efforts.length || agent.effort ? select(t('compose.effort', 'Effort'), agent.effort ?? '', effortOptions, (v) => save({ effort: v || null })) : null,
    select(t('compose.permission', 'Permissions'), agent.permission_mode, modeOptions, (v) => save({ permission_mode: v })),
    // The context ring sits last on the right, as in Claude Desktop; the number is in its tooltip.
    el('span', { class: 'compose-context', title: `${t('ctx.title', 'How full the context is after the last turn')}: ${contextLabel(agent)}` }, contextRing(agent, 20)),
  ].filter(Boolean))
}

async function refresh() {
  if (!bot) return
  const result = await mutate(() => api.post(`/bots/${bot}/reload`, {}))
  if (!result) return
  emit('bots-changed')
  try {
    catalog = await api.get(`/bots/${bot}/catalog?refresh=1`)
    notify(`${bot}: ${result.note || t('compose.reloaded', 'reloaded')}`)
  } catch (error) {
    notify(error.message, true)
  }
  if (shown) render(shown)
}

// One popup under the input. "/word" alone lists slash commands; "@word" just before the caret lists bots, then files.
function renderSlash() {
  const value = nodes.input.value
  const slash = /^\/([\w:.-]*)$/.exec(value)
  if (slash && catalog?.commands?.length) {
    const query = slash[1].toLowerCase()
    show(catalog.commands.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 12).map((c) => ({
      label: `/${c.name}`, hint: c.hint, desc: c.description, apply: () => replace(0, value.length, `/${c.name} `),
    })))
    return
  }
  const caret = nodes.input.selectionStart ?? value.length
  const mention = /(^|\s)@([^\s@]*)$/.exec(value.slice(0, caret))
  if (!mention) {
    closeSlash()
    return
  }
  const query = mention[2].toLowerCase()
  const from = caret - mention[2].length - 1
  const bots = (botsSnapshot()?.agents ?? []).filter((a) => a.enabled && a.name !== bot && a.name.toLowerCase().includes(query)).slice(0, 6)
    .map((a) => ({ label: `@${a.name}`, hint: t('compose.mention_bot', 'also send to this bot'), desc: a.description, apply: () => replace(from, caret, `@${a.name} `) }))
  if (sharedFiles === null || Date.now() - sharedAt > 30_000) loadSharedFiles()
  const files = (sharedFiles ?? []).filter((path) => path.toLowerCase().includes(query)).slice(0, 10)
    .map((path) => ({ label: path.split('/').pop(), hint: path, apply: () => { replace(from, caret, `@${path} `); onFile(path) } }))
  show([...bots, ...files])
}

function show(items) {
  if (items.length === 0) {
    closeSlash()
    return
  }
  popup = { items, index: Math.min(popup.index, items.length - 1) }
  clear(nodes.slash).append(...items.map((item, i) => el('li', {
    role: 'option', 'aria-selected': String(i === popup.index), class: i === popup.index ? 'active' : '',
    onmousedown: (event) => { event.preventDefault(); choose(i) },
  }, el('strong', { text: item.label }), item.hint ? el('span', { class: 'meta', text: ` ${item.hint}` }) : null,
  item.desc ? el('span', { class: 'slash-desc', text: item.desc }) : null)))
  nodes.slash.hidden = false
}

// Replaces the text between from and to, keeps the caret after it.
function replace(from, to, text) {
  const value = nodes.input.value
  nodes.input.value = value.slice(0, from) + text + value.slice(to)
  const at = from + text.length
  nodes.input.setSelectionRange(at, at)
}

// The shared folder's files, read folder by folder (at most 40 folders, 400 files), cached for 30 s.
// ponytail: client-side walk; a server-side search endpoint if the shared folder grows past this.
let loading = false
async function loadSharedFiles() {
  if (loading) return
  loading = true
  const found = []
  const queue = ['']
  let folders = 0
  try {
    while (queue.length && folders < 40 && found.length < 400) {
      const dir = queue.shift()
      folders += 1
      const { entries } = await api.get(`/shared?dir=${encodeURIComponent(dir)}`)
      for (const entry of entries) {
        if (entry.dir) {
          // outputs/ (what bots hand over) before attachments/ (one folder per day), so the folder limit hits uploads first.
          if (entry.name === 'outputs') queue.unshift(entry.path)
          else if (entry.name !== '.git' && entry.name !== 'node_modules') queue.push(entry.path)
        } else found.push(entry.path)
      }
    }
  } catch {
    // Bots still complete; a failed walk is not cached, so the next "@" reads again.
    loading = false
    sharedFiles = found
    return
  }
  loading = false
  sharedFiles = found
  sharedAt = Date.now()
  if (!nodes.slash.hidden || /(^|\s)@[^\s@]*$/.test(nodes.input.value.slice(0, nodes.input.selectionStart ?? 0))) renderSlash()
}

function closeSlash() {
  if (!nodes) return
  nodes.slash.hidden = true
  popup = { items: [], index: 0 }
}

function choose(i) {
  const item = popup.items[i]
  if (!item) return
  item.apply()
  closeSlash()
  nodes.input.dispatchEvent(new Event('input'))
  closeSlash()
  nodes.input.focus()
}

function onKey(event) {
  if (nodes.slash.hidden || event.isComposing) return
  const keys = { ArrowDown: 1, ArrowUp: -1 }
  if (event.key in keys) {
    popup.index = (popup.index + keys[event.key] + popup.items.length) % popup.items.length
    show(popup.items)
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    choose(popup.index)
  } else if (event.key === 'Escape') {
    closeSlash()
  } else {
    return
  }
  event.preventDefault()
  event.stopImmediatePropagation()
}
