// The row under a bot's input, as in Claude Desktop: a refresh button on the left (reload the bot's skills and plugins,
// then read its model list and slash commands again) and, on the right, the model, effort and permission menus. A
// change is saved on the bot at once and applies from its next turn. Typing "/" opens the bot's slash commands.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { t } from '../core/i18n.js'
import { contextLabel, contextRing } from './context-ring.js'
import { icon } from '../core/icons.js'

const MODE_LABEL = {
  auto: ['perm.auto', 'Auto'], acceptEdits: ['perm.acceptEdits', 'Accept edits'], default: ['perm.default', 'Ask (refuse)'],
  dontAsk: ['perm.dontAsk', 'Allowed tools only'], plan: ['perm.plan', 'Plan (read only)'], bypassPermissions: ['perm.bypass', 'Bypass permissions'],
}

let nodes
let bot = null
let shown = null
let catalog = null
let popup = { items: [], index: 0 }

export function initComposeMenus(input) {
  nodes = { row: area('bot-tools'), slash: area('bot-slash'), input }
  // Registered before the chat's own keydown handler, so an open command list takes Enter, Tab, arrows and Esc first.
  input.addEventListener('keydown', onKey)
  input.addEventListener('input', renderSlash)
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
}

function render(agent) {
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

// The command list shows while the input is a single "/word" with no space yet.
function renderSlash() {
  const value = nodes.input.value
  const match = /^\/([\w:.-]*)$/.exec(value)
  if (!match || !catalog?.commands?.length) {
    closeSlash()
    return
  }
  const query = match[1].toLowerCase()
  const items = catalog.commands.filter((c) => c.name.toLowerCase().includes(query)).slice(0, 12)
  if (items.length === 0) {
    closeSlash()
    return
  }
  popup = { items, index: Math.min(popup.index, items.length - 1) }
  clear(nodes.slash).append(...items.map((c, i) => el('li', {
    role: 'option', 'aria-selected': String(i === popup.index), class: i === popup.index ? 'active' : '',
    onmousedown: (event) => { event.preventDefault(); choose(i) },
  }, el('strong', { text: `/${c.name}` }), c.hint ? el('span', { class: 'meta', text: ` ${c.hint}` }) : null,
  c.description ? el('span', { class: 'slash-desc', text: c.description }) : null)))
  nodes.slash.hidden = false
}

function closeSlash() {
  if (!nodes) return
  nodes.slash.hidden = true
  popup = { items: [], index: 0 }
}

function choose(i) {
  const item = popup.items[i]
  if (!item) return
  nodes.input.value = `/${item.name} `
  nodes.input.dispatchEvent(new Event('input'))
  closeSlash()
  nodes.input.focus()
}

function onKey(event) {
  if (nodes.slash.hidden || event.isComposing) return
  const keys = { ArrowDown: 1, ArrowUp: -1 }
  if (event.key in keys) {
    popup.index = (popup.index + keys[event.key] + popup.items.length) % popup.items.length
    renderSlash()
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
