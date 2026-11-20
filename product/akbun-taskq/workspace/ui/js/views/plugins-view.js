// The Plugins view: the skills, plugins and MCP servers every bot shares (view, update, remove, register by path) and
// the official marketplace, installed from with one button. The bots that load an entry are shown next to it, so
// removing one is not a surprise.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el, fill } from '../core/dom.js'
import { askConfirm } from '../core/ask.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'

let catalog = null
let installed = new Set()   // plugin names already registered, so the marketplace says Installed

export function initPluginsView() {
  for (const kind of ['skill', 'plugin']) {
    area(`registry-${kind}-form`).addEventListener('submit', async (event) => {
      event.preventDefault()
      const input = event.currentTarget.elements.path
      if (await mutate(() => api.post(`/bot-${kind}s`, { path: input.value.trim() }), `${kind === 'skill' ? 'Skill' : 'Plugin'} added`)) {
        input.value = ''
        load()
      }
    })
  }
  area('registry-mcp-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    const f = form.elements
    const body = { name: f.name.value.trim(), command: f.command.value.trim(), args: f.args.value.trim().split(/\s+/).filter(Boolean), description: f.description.value.trim() }
    if (await mutate(() => api.post('/bot-mcp-servers', body), 'MCP server added')) {
      form.reset()
      load()
    }
  })
  for (const tab of document.querySelectorAll('[data-sdk-tab]')) tab.addEventListener('click', () => showSdk(tab.dataset.sdkTab))
  area('official-anthropic').addEventListener('change', renderCatalog)
  area('official-filter').addEventListener('input', renderCatalog)
  on('tab', (name) => {
    if (name === 'plugins') load()
  })
}

async function load() {
  try {
    const [settings, bots] = await Promise.all([api.get('/settings'), api.get('/bots')])
    const listOf = { skill: 'skills', plugin: 'plugins', mcp: 'mcp_servers' }
    const users = (kind, name) => bots.agents.filter((a) => (a[listOf[kind]] ?? []).includes(name)).map((a) => `${a.name}${a.sdk === 'openai' ? ' ◎' : a.sdk === 'kiro' ? ' K' : ''}`)
    renderRegistry('skill', settings.bot_skills, users)
    renderRegistry('plugin', settings.bot_plugins, users)
    installed = new Set(settings.bot_plugins.map((p) => p.name))
    renderMcp(settings.bot_mcp_servers ?? [], users)
  } catch (error) {
    notify(error.message, true)
  }
  if (!catalog) {
    clear(area('official-list')).append(el('li', { class: 'meta', text: '…' }))
    try {
      catalog = (await api.get('/plugins/catalog')).plugins
    } catch (error) {
      clear(area('official-list')).append(el('li', { class: 'error', text: error.message }))
      return
    }
  }
  renderCatalog()
}

function renderRegistry(kind, entries, users) {
  const list = area(`registry-${kind}`)
  if (entries.length === 0) {
    fill(list, el('li', { class: 'meta', text: `No ${kind}s registered.` }))
    return
  }
  fill(list, ...entries.map((entry) => {
    const usedBy = users(kind, entry.name)
    return el('li', { class: 'skill-row' },
      el('span', { class: 'entry-icon', 'aria-hidden': 'true', text: entry.name[0].toUpperCase() }),
      el('div', { class: 'entry-text' },
        el('div', { class: 'entry-name' }, el('strong', { text: entry.name }), entry.ok ? null : el('span', { class: 'badge', text: 'missing' })),
        entry.description ? el('p', { class: 'meta', text: entry.description }) : null,
        el('p', { class: 'meta', text: usedBy.length ? `${t('plugins.used_by', 'Used by')} ${usedBy.join(', ')}` : t('plugins.unused', 'No bot uses it') }),
        el('code', { class: 'skill-path', text: entry.path })),
      el('div', { class: 'row-actions' },
        el('button', {
          type: 'button', text: t('settings.update', 'Update'), title: 'git pull when it is a git checkout, then reload every bot that uses it',
          onclick: async () => {
            const result = await mutate(() => api.post(`/bot-${kind}s/${entry.name}/update`))
            if (result) notify(`${entry.name}: ${result.output.split('\n').pop()}${result.reloaded.length ? ` · reloaded ${result.reloaded.join(', ')}` : ''}`)
            load()
          },
        }),
        el('button', {
          type: 'button', class: 'danger-quiet', text: t('plugins.remove', 'Remove'),
          onclick: (event) => {
            const button = event.currentTarget
            if (button.dataset.confirm !== 'true') {
              button.dataset.confirm = 'true'
              button.textContent = usedBy.length ? `Remove from ${usedBy.length} bot${usedBy.length === 1 ? '' : 's'}?` : 'Remove?'
              return
            }
            mutate(() => api.del(`/bot-${kind}s/${entry.name}`), `${entry.name} removed`).then(load)
          },
        })))
  }))
}

function renderCatalog() {
  if (!catalog) return
  const anthropicOnly = area('official-anthropic').checked
  const filter = area('official-filter').value.trim().toLowerCase()
  const shown = catalog.filter((p) => (!anthropicOnly || p.anthropic) && (!filter || `${p.name} ${p.description}`.toLowerCase().includes(filter)))
  area('official-count').textContent = `${shown.length} / ${catalog.length}`
  clear(area('official-list')).append(...shown.map((p) => el('li', { class: 'official-item' },
    el('span', { class: 'entry-icon', 'aria-hidden': 'true', text: p.name[0].toUpperCase() }),
    el('div', { class: 'entry-text' },
      el('div', { class: 'entry-name' }, el('strong', { text: p.name }), p.anthropic ? el('span', { class: 'badge owner', text: 'Anthropic' }) : null),
      el('p', { class: 'meta clamp', text: p.description, title: p.description }),
      el('code', { class: 'skill-path', text: p.source })),
    installButton(p))))
}

// Installed shows as a label; an entry without a git source taskq can fetch says so instead of offering a button.
function installButton(plugin) {
  if (installed.has(plugin.name)) return el('span', { class: 'meta installed', text: t('plugins.installed', 'Installed') })
  if (!plugin.install) return el('span', { class: 'meta', title: plugin.source, text: t('plugins.no_source', 'Not installable') })
  return el('button', {
    type: 'button', class: 'install', text: t('plugins.install', 'Install'),
    onclick: async (event) => {
      const button = event.currentTarget
      button.disabled = true
      button.textContent = t('plugins.installing', 'Installing…')
      const done = await mutate(() => api.post('/plugins/install', { name: plugin.name }), `${plugin.name} ${t('plugins.installed_toast', 'installed. Every Claude bot uses it from its next turn.')}`)
      if (done) load()
      else {
        button.disabled = false
        button.textContent = t('plugins.install', 'Install')
      }
    },
  })
}

// Claude shows skills, plugins, MCP servers and the official marketplace; OpenAI and Kiro show what their bots use.
function showSdk(sdk) {
  for (const tab of document.querySelectorAll('[data-sdk-tab]')) tab.setAttribute('aria-selected', String(tab.dataset.sdkTab === sdk))
  for (const section of document.querySelectorAll('[data-view-panel="plugins"] [data-sdk]')) {
    section.hidden = !(section.dataset.sdk === 'both' || section.dataset.sdk === sdk)
  }
}

function renderMcp(entries, users) {
  const list = area('registry-mcp')
  if (entries.length === 0) {
    fill(list, el('li', { class: 'meta', text: 'No MCP servers registered.' }))
    return
  }
  fill(list, ...entries.map((entry) => {
    const usedBy = users('mcp', entry.name)
    return el('li', { class: 'skill-row' },
      el('span', { class: 'entry-icon', 'aria-hidden': 'true', text: entry.name[0].toUpperCase() }),
      el('div', { class: 'entry-text' },
        el('strong', { text: entry.name }),
        el('p', { class: 'meta mono', text: [entry.command, ...entry.args].join(' ') }),
        entry.description ? el('p', { class: 'meta', text: entry.description }) : null,
        el('p', { class: 'meta', text: usedBy.length ? `${t('plugins.used_by', 'Used by')} ${usedBy.join(', ')}` : t('plugins.unused', 'No bot uses it') })),
      el('button', { type: 'button', class: 'danger-quiet', text: t('plugins.remove', 'Remove'), onclick: async () => {
        if (!(await askConfirm(`${t('plugins.remove', 'Remove')} ${entry.name}${usedBy.length ? ` (${usedBy.join(', ')})` : ''}?`))) return
        if (await mutate(() => api.del(`/bot-mcp-servers/${entry.name}`), 'Removed')) load()
      } }))
  }))
}
