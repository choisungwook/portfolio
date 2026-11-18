// A bot's memory: its own notes, sent with every turn. The user reads and edits the same text the bot keeps with
// memory_write. Opened from the bot's right-click menu.
import { api, notify } from '../core/api.js'
import { area } from '../core/dom.js'
import { applyLanguage, t } from '../core/i18n.js'
import { currentLanguage } from '../core/i18n.js'

let dialog
let text
let bot = null

function init() {
  if (dialog) return
  dialog = area('memory-dialog')
  text = area('memory-text')
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  text.addEventListener('input', count)
  area('memory-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    try {
      await api.put(`/bots/${bot}/memory`, { memory: text.value })
      dialog.close()
      notify(`${bot}: ${t('memory.title', 'Memory')} ✓`)
    } catch (error) {
      area('memory-error').textContent = error.message
    }
  })
}

function count() {
  area('memory-count').textContent = `${text.value.length.toLocaleString()} / 16,000`
}

export async function openMemory(name) {
  init()
  bot = name
  area('memory-error').textContent = ''
  area('memory-title').textContent = `${name} · ${t('memory.title', 'Memory')}`
  applyLanguage(currentLanguage(), dialog)
  try {
    text.value = (await api.get(`/bots/${name}/memory`)).memory
    count()
    dialog.showModal()
    text.focus()
  } catch (error) {
    notify(error.message, true)
  }
}
