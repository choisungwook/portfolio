// Left sidebar navigation. A view is one panel in <main>; a bot conversation is the 'bot' panel with a bot name.
// Views learn they are shown through the 'tab' event (name) and the bot view also through 'bot' (bot name).
import { emit } from './bus.js'

const STORE = 'taskq.view'
let current = { view: 'calendar', bot: null }

export function currentView() {
  return current
}

export function show(view, bot = null) {
  current = { view, bot }
  for (const panel of document.querySelectorAll('[data-view-panel]')) panel.hidden = panel.dataset.viewPanel !== view
  for (const item of document.querySelectorAll('.sidebar [data-view], .sidebar [data-bot]')) {
    const on = view === 'bot' ? item.dataset.bot === bot : item.dataset.view === view
    if (on) item.setAttribute('aria-current', 'page')
    else item.removeAttribute('aria-current')
  }
  try {
    localStorage.setItem(STORE, JSON.stringify(current))
  } catch {
    // The view is a convenience; without storage the page opens on the calendar.
  }
  emit('tab', view)
  if (view === 'bot') emit('bot', bot)
}

export function initNav() {
  for (const item of document.querySelectorAll('.sidebar [data-view]')) {
    item.addEventListener('click', () => show(item.dataset.view))
  }
  let saved = null
  try {
    saved = JSON.parse(localStorage.getItem(STORE) ?? 'null')
  } catch {
    saved = null
  }
  if (saved?.view === 'bot' && saved.bot) show('bot', saved.bot)
  else if (saved?.view && document.querySelector(`[data-view-panel="${saved.view}"]`)) show(saved.view)
  else show('calendar')
}
