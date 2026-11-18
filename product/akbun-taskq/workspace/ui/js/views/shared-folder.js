// The shared folder every bot reads and writes. Browse it, download a file, upload by dropping or pasting files
// (they land in attachments/<day>/), or open it in the desktop file manager.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'
import { attachments } from '../core/attach.js'
import { download } from './bot-chat.js'

let dir = ''
let list
let crumbs

export function initSharedFolder() {
  list = area('shared-list')
  crumbs = area('shared-crumbs')
  const uploads = attachments({ zone: area('shared-drop'), button: area('shared-upload'), chips: area('shared-chips'), pasteTarget: area('shared-view') })
  area('shared-open').addEventListener('click', () => mutate(() => api.post('/open-folder', { target: 'shared' })))
  // A finished upload shows up in the list; the chips clear once every file is stored.
  setInterval(() => {
    if (!area('shared-view').hidden && uploads.files().length && !uploads.busy()) {
      uploads.clear()
      load()
    }
  }, 700)
  on('tab', (name) => {
    if (name === 'shared') load()
  })
}

async function load() {
  try {
    const { entries } = await api.get(`/shared?dir=${encodeURIComponent(dir)}`)
    const parts = dir ? dir.split('/') : []
    clear(crumbs).append(
      el('button', { type: 'button', class: 'link', text: 'shared', onclick: () => go('') }),
      ...parts.flatMap((part, i) => [' / ', el('button', { type: 'button', class: 'link', text: part, onclick: () => go(parts.slice(0, i + 1).join('/')) })]))
    if (entries.length === 0) {
      clear(list).append(el('li', { class: 'empty', text: t('shared.empty', 'Empty.') }))
      return
    }
    clear(list).append(...entries.map((entry) => el('li', {},
      el('button', { type: 'button', class: 'shared-item', dataset: { dir: String(entry.dir) }, onclick: () => (entry.dir ? go(entry.path) : download(entry.path)) },
        el('span', { class: 'shared-icon', 'aria-hidden': 'true', text: entry.dir ? '▸' : '·' }),
        el('span', { class: 'shared-name', text: entry.name }),
        el('span', { class: 'meta', text: entry.dir ? '' : size(entry.size) }),
        el('span', { class: 'meta', text: new Date(entry.modified * 1000).toLocaleString() })))))
  } catch (error) {
    clear(list).append(el('li', { class: 'error', text: error.message }))
  }
}

function go(next) {
  dir = next
  load()
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
