// The Plugins view: the skills and plugins registered for bots (view, update, remove, register by path) and the
// official marketplace listed for reference. Which bots use an entry is shown next to it, so removing one is not a
// surprise.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'

let catalog = null

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
  area('official-anthropic').addEventListener('change', renderCatalog)
  area('official-filter').addEventListener('input', renderCatalog)
  on('tab', (name) => {
    if (name === 'plugins') load()
  })
}

async function load() {
  try {
    const [settings, bots] = await Promise.all([api.get('/settings'), api.get('/bots')])
    const users = (kind, name) => bots.agents.filter((a) => (kind === 'skill' ? a.skills : a.plugins).includes(name)).map((a) => a.name)
    renderRegistry('skill', settings.bot_skills, users)
    renderRegistry('plugin', settings.bot_plugins, users)
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
    clear(list).append(el('li', { class: 'meta', text: `No ${kind}s registered.` }))
    return
  }
  clear(list).append(...entries.map((entry) => {
    const usedBy = users(kind, entry.name)
    return el('li', { class: 'skill-row' },
      el('div', {},
        el('strong', { text: entry.name }), entry.ok ? null : el('span', { class: 'badge', text: 'missing' }),
        entry.description ? el('p', { class: 'meta', text: entry.description }) : null,
        el('code', { class: 'skill-path', text: entry.path }),
        el('p', { class: 'meta', text: usedBy.length ? `Used by ${usedBy.join(', ')}` : 'No bot uses it' })),
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
  clear(area('official-list')).append(
    el('li', { class: 'meta', text: `${shown.length} / ${catalog.length}` }),
    ...shown.map((p) => el('li', { class: 'official-item' },
      el('div', {},
        el('strong', { text: p.name }), p.anthropic ? el('span', { class: 'badge owner', text: 'Anthropic' }) : null,
        el('p', { class: 'meta', text: p.description })),
      el('code', { class: 'skill-path', text: p.source }))))
}
