// Settings dialog: a menu on the left and one page on the right (appearance, connections, usage, ...). This file
// switches the pages and owns the read-only configuration; other views fill their own page and listen for
// 'settings-page'. Closing it emits 'settings-closed'.
import { api, mutate, notify } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { initDbPath, showDbPath } from './db-path.js'

let dialog
let gear
let configList
let notificationToggle
let savingNotification = false
let loadId = 0
let opener = null
const PAGE_KEY = 'taskq.settings.page'

function savedPage() {
  try {
    return localStorage.getItem(PAGE_KEY)
  } catch {
    return null
  }
}

export function showSettingsPage(name) {
  const pages = [...dialog.querySelectorAll('[data-settings-page]')]
  const page = pages.some((section) => section.dataset.settingsPage === name) ? name : 'appearance'
  for (const section of pages) section.hidden = section.dataset.settingsPage !== page
  for (const button of area('settings-nav').querySelectorAll('[data-page]')) {
    if (button.dataset.page === page) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  }
  try {
    localStorage.setItem(PAGE_KEY, page)
  } catch {
    // The page is remembered only where storage works.
  }
  emit('settings-page', page)
}

export function initSettings() {
  dialog = area('settings-dialog')
  gear = area('settings-button')
  configList = area('settings-config')
  notificationToggle = area('desktop-notifications')
  notificationToggle.addEventListener('change', saveNotification)
  gear.addEventListener('click', () => {
    dialog.showModal()
    showSettingsPage(savedPage() ?? 'appearance')
    load()
  })
  area('settings-nav').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]')
    if (button) showSettingsPage(button.dataset.page)
  })
  // Opened from elsewhere (the bot connection panel): the gear's own listeners load every page, then the page shows and
  // focus goes back to where it came from.
  on('open-settings', (page) => {
    if (!dialog.open) {
      opener = document.activeElement
      gear.click()
    }
    showSettingsPage(page)
  })
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    ;(opener?.isConnected ? opener : gear).focus()
    opener = null
    emit('settings-closed')
  })
  initDbPath()
}

async function load() {
  if (!dialog.open) return
  const id = ++loadId
  const canLoadNotification = !savingNotification
  notificationToggle.disabled = true
  try {
    const settings = await api.get('/settings')
    if (id !== loadId) return
    showDbPath(settings.db_path)
    renderConfig(settings)
    if (canLoadNotification && !savingNotification) {
      notificationToggle.checked = settings.desktop_notifications
      notificationToggle.disabled = false
    }
  } catch (error) {
    notify(error.message, true)
  }
}

async function saveNotification() {
  const enabled = notificationToggle.checked
  savingNotification = true
  notificationToggle.disabled = true
  const result = await mutate(() => api.post('/settings/desktop-notifications', { enabled }), 'Notification preference saved')
  notificationToggle.checked = result?.enabled ?? !enabled
  savingNotification = false
  notificationToggle.disabled = false
}

function renderConfig(settings) {
  const entries = [...Object.entries(settings.config), ['home', settings.home]]
  clear(configList).append(...entries.flatMap(([key, value]) => [
    el('dt', { text: key }),
    el('dd', { text: typeof value === 'string' ? value : JSON.stringify(value) }),
  ]))
}
