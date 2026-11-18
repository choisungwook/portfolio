// The menu a right-click (or the context-menu key) opens on a bot in the sidebar. Every item calls the API at once;
// Delete asks a second time in the same place, like the other destructive buttons.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { show } from '../core/nav.js'
import { openBotSettings } from './bot-settings.js'
import { openMemory } from './memory-dialog.js'
import { t } from '../core/i18n.js'

let menu

function close() {
  menu.hidden = true
  document.removeEventListener('pointerdown', outside, true)
  document.removeEventListener('keydown', onKey, true)
}

function outside(event) {
  if (!menu.contains(event.target)) close()
}

function onKey(event) {
  if (event.key === 'Escape') {
    close()
    return
  }
  const items = [...menu.querySelectorAll('button')]
  const at = items.indexOf(document.activeElement)
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus()
  }
}

function item(text, action, extra = {}) {
  return el('li', { role: 'none' }, el('button', { type: 'button', role: 'menuitem', text, ...extra, onclick: async () => {
    close()
    await action()
  } }))
}

async function reload(bot, kind, label) {
  const result = await mutate(() => api.post(`/bots/${bot.name}/reload`, { kind }))
  if (result) {
    emit('bots-changed')
    // The note is already in the bot's conversation; a toast confirms what was loaded.
    notify(`${bot.name}: ${result.note || `${label} reloaded`}`)
  }
}

export function openBotMenu(bot, x, y) {
  menu ??= area('bot-menu')
  const items = [
    item(t('menu.open', 'Open conversation'), () => show('bot', bot.name)),
    item(t('menu.settings', 'Settings…'), () => openBotSettings(bot.name)),
    item(t('menu.memory', 'Memory…'), () => openMemory(bot.name)),
    el('li', { role: 'separator' }, el('hr')),
    item(t('menu.reload_skills', 'Reload skills'), () => reload(bot, 'skill', 'Skills')),
    item(t('menu.reload_plugins', 'Reload plugins'), () => reload(bot, 'plugin', 'Plugins')),
    item(t('menu.new_session', 'Start a new session'), () => mutate(() => api.post(`/bots/${bot.name}/reset`), `${bot.name} starts a new session on its next turn`)),
    item(t('menu.session_folder', 'Open session folder'), () => mutate(() => api.post('/open-folder', { target: 'bot', bot: bot.name }))),
  ]
  if (bot.busy) {
    items.unshift(item(t('menu.cancel', 'Cancel the running work'), () => mutate(() => api.post(`/bots/${bot.name}/cancel`), `${bot.name}: ${t('chat.cancelled', 'cancelled')}`).then(() => emit('bots-changed')), { class: 'danger' }))
  }
  if (!bot.system) {
    items.push(item(bot.enabled ? t('menu.disable', 'Disable') : t('menu.enable', 'Enable'), () => mutate(() => api.put(`/bots/${bot.name}`, { enabled: !bot.enabled }),
      `${bot.name} ${bot.enabled ? 'disabled' : 'enabled'}`).then(() => emit('bots-changed'))))
    items.push(el('li', { role: 'separator' }, el('hr')))
    const remove = el('button', { type: 'button', role: 'menuitem', class: 'danger', text: t('menu.delete', 'Delete…') })
    remove.addEventListener('click', async () => {
      if (remove.dataset.confirm !== 'true') {
        remove.dataset.confirm = 'true'
        remove.textContent = `Delete ${bot.name}? Click again`
        return
      }
      close()
      if (await mutate(() => api.del(`/bots/${bot.name}`), `${bot.name} deleted; its open tasks are yours again`)) {
        show('calendar')
        emit('bots-changed')
      }
    })
    items.push(el('li', { role: 'none' }, remove))
  }
  clear(menu).append(...items)
  menu.setAttribute('aria-label', `${bot.name} actions`)
  menu.hidden = false
  const box = menu.getBoundingClientRect()
  menu.style.left = `${Math.min(x, window.innerWidth - box.width - 8)}px`
  menu.style.top = `${Math.min(y, window.innerHeight - box.height - 8)}px`
  menu.querySelector('button')?.focus()
  document.addEventListener('pointerdown', outside, true)
  document.addEventListener('keydown', onKey, true)
}
