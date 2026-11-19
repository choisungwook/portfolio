// The shared folder every bot reads and writes, browsed like a desktop file manager: list, details (a table whose headers
// sort) or icons, sorted by name, kind, size or date with folders first. Clicking a file shows it in the pane beside the
// list; uploads by dropping or pasting land in attachments/<day>/.
import { api, mutate } from '../core/api.js'
import { area, clear, el, fill } from '../core/dom.js'
import { on } from '../core/bus.js'
import { t } from '../core/i18n.js'
import { show } from '../core/nav.js'
import { attachments } from '../core/attach.js'
import { icon } from '../core/icons.js'
import { extOf, showFile } from './file-viewer.js'

const STORE = 'taskq.shared.view'
const MODES = ['list', 'details', 'icons']
const SORTS = ['name', 'kind', 'size', 'modified']

let dir = ''
let entries = []
let selected = null
let pendingOpen = null
let prefs = { mode: 'list', sort: 'name', desc: false }
let list
let crumbs
let pane

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE) ?? 'null')
    if (saved && MODES.includes(saved.mode) && SORTS.includes(saved.sort)) prefs = { mode: saved.mode, sort: saved.sort, desc: Boolean(saved.desc) }
  } catch {
    // The view is a convenience; without storage it opens as a list sorted by name.
  }
}

function savePrefs() {
  try {
    localStorage.setItem(STORE, JSON.stringify(prefs))
  } catch {
    // Same as above.
  }
}

export function initSharedFolder() {
  list = area('shared-list')
  crumbs = area('shared-crumbs')
  pane = area('shared-file')
  loadPrefs()
  const uploads = attachments({ zone: area('shared-drop'), button: area('shared-upload'), chips: area('shared-chips'), pasteTarget: area('shared-view') })
  area('shared-open').addEventListener('click', () => mutate(() => api.post('/open-folder', { target: 'shared' })))
  for (const button of area('shared-views').querySelectorAll('[data-mode]')) {
    button.addEventListener('click', () => setPrefs({ mode: button.dataset.mode }))
  }
  area('shared-sort').addEventListener('change', (event) => setPrefs({ sort: event.target.value }))
  area('shared-dir').addEventListener('click', () => setPrefs({ desc: !prefs.desc }))
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
  // "Show in shared folder" from a file pane: open this view in the file's folder with the file selected and shown.
  on('open-shared', ({ dir: target, select }) => {
    dir = target ?? ''
    pendingOpen = select ?? null
    if (area('shared-view').hidden) show('shared')
    else load()
  })
  renderControls()
}

function setPrefs(change) {
  prefs = { ...prefs, ...change }
  savePrefs()
  renderControls()
  render()
}

function renderControls() {
  for (const button of area('shared-views').querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === prefs.mode))
  }
  area('shared-sort').value = prefs.sort
  const order = area('shared-dir')
  order.replaceChildren(icon(prefs.desc ? 'arrow-down' : 'arrow-up', 16))
  order.title = prefs.desc ? t('shared.desc', 'Descending') : t('shared.asc', 'Ascending')
  order.setAttribute('aria-label', order.title)
}

async function load() {
  try {
    const result = await api.get(`/shared?dir=${encodeURIComponent(dir)}`)
    entries = result.entries
  } catch (error) {
    fill(list, el('p', { class: 'error', text: error.message }))
    return
  }
  const parts = dir ? dir.split('/') : []
  clear(crumbs).append(
    el('button', { type: 'button', class: 'link', text: 'shared', onclick: () => go('') }),
    ...parts.flatMap((part, i) => [' / ', el('button', { type: 'button', class: 'link', text: part, onclick: () => go(parts.slice(0, i + 1).join('/')) })]))
  if (pendingOpen) {
    const path = pendingOpen
    pendingOpen = null
    if (entries.some((entry) => entry.path === path)) open(path)
  }
  render()
}

function go(next) {
  dir = next
  load()
}

function open(path) {
  selected = path
  showFile(pane, path, { onClose: () => { pane.hidden = true; selected = null; render() } })
  render()
}

function activate(entry) {
  if (entry.dir) go(entry.path)
  else open(entry.path)
}

function kindLabel(entry) {
  if (entry.dir) return t('shared.folder', 'Folder')
  const ext = extOf(entry.path)
  return ext ? ext.toUpperCase() : t('shared.file', 'File')
}

function compare(a, b) {
  if (a.dir !== b.dir) return a.dir ? -1 : 1
  const byName = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  let result = 0
  if (prefs.sort === 'kind') result = extOf(a.path).localeCompare(extOf(b.path))
  else if (prefs.sort === 'size') result = (a.size ?? 0) - (b.size ?? 0)
  else if (prefs.sort === 'modified') result = a.modified - b.modified
  result ||= byName
  return prefs.desc ? -result : result
}

function fileIcon(entry, big = false) {
  const ext = entry.dir ? '' : extOf(entry.path).slice(0, 4)
  return el('span', { class: `ficon${big ? ' ficon-big' : ''}`, 'aria-hidden': 'true', dataset: { kind: entry.dir ? 'folder' : 'file' } },
    ext && big ? el('span', { class: 'ficon-ext', text: ext }) : null)
}

function itemProps(entry, className) {
  return {
    type: 'button', class: className, title: entry.name, 'aria-current': entry.path === selected ? 'true' : null,
    dataset: { dir: String(entry.dir) }, onclick: () => activate(entry),
  }
}

function render() {
  if (!list) return
  list.dataset.mode = prefs.mode
  if (entries.length === 0) {
    fill(list, el('p', { class: 'empty', text: t('shared.empty', 'Empty.') }))
    return
  }
  const sorted = [...entries].sort(compare)
  if (prefs.mode === 'details') fill(list, detailsTable(sorted))
  else if (prefs.mode === 'icons') fill(list, el('div', { class: 'shared-icons' }, ...sorted.map((entry) =>
    el('button', itemProps(entry, 'shared-tile'), fileIcon(entry, true), el('span', { class: 'shared-name', text: entry.name })))))
  else fill(list, el('div', { class: 'shared-rows' }, ...sorted.map((entry) =>
    el('button', itemProps(entry, 'shared-item'), fileIcon(entry), el('span', { class: 'shared-name', text: entry.name })))))
}

function detailsTable(sorted) {
  const header = (key, label, extra = '') => el('th', { scope: 'col', class: extra, 'aria-sort': prefs.sort === key ? (prefs.desc ? 'descending' : 'ascending') : 'none' },
    el('button', {
      type: 'button', class: 'link sort-head',
      onclick: () => setPrefs(prefs.sort === key ? { desc: !prefs.desc } : { sort: key, desc: false }),
    }, label, prefs.sort === key ? icon(prefs.desc ? 'arrow-down' : 'arrow-up', 14) : null))
  return el('table', { class: 'shared-table' },
    el('thead', {}, el('tr', {},
      header('name', t('shared.sort_name', 'Name')),
      header('kind', t('shared.sort_kind', 'Kind'), 'col-kind'),
      header('size', t('shared.sort_size', 'Size'), 'col-size'),
      header('modified', t('shared.sort_modified', 'Date modified'), 'col-date'))),
    el('tbody', {}, ...sorted.map((entry) => el('tr', { 'aria-selected': entry.path === selected ? 'true' : null },
      el('td', {}, el('button', itemProps(entry, 'shared-item'), fileIcon(entry), el('span', { class: 'shared-name', text: entry.name }))),
      el('td', { class: 'meta col-kind', text: kindLabel(entry) }),
      el('td', { class: 'meta col-size', text: entry.dir ? '—' : size(entry.size) }),
      el('td', { class: 'meta col-date', text: new Date(entry.modified * 1000).toLocaleString() })))))
}

function size(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
