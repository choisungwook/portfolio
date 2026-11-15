// Entry point: wires the tabs, the views and the live updates. Token first: no view may fetch before it is known.
import { emit } from './core/bus.js'
import { startLive } from './core/live.js'
import { requestRefresh } from './core/refresh.js'
import { authLost, initToken } from './core/token.js'
import { initApprovalList } from './views/approval-list.js'
import { initCalendar } from './views/calendar.js'
import { initAlertsPanel } from './views/alerts-panel.js'
import { initBoard } from './views/board.js'
import { initGraph } from './views/graph.js'
import { initProposals } from './views/proposals.js'
import { initRunDialog } from './views/run-dialog.js'
import { initSearch } from './views/search.js'
import { initSettings } from './views/settings-dialog.js'
import { initTaskDetail } from './views/task-detail.js'
import { initTaskForm } from './views/task-form.js'
import { initTokenNotice } from './views/token-notice.js'

function initTabs() {
  const tabs = [...document.querySelectorAll('[role="tab"]')]
  const show = (name) => {
    for (const tab of tabs) {
      const on = tab.dataset.tab === name
      tab.setAttribute('aria-selected', String(on))
      tab.tabIndex = on ? 0 : -1
      document.getElementById(tab.getAttribute('aria-controls')).hidden = !on
    }
    emit('tab', name)
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => show(tab.dataset.tab))
    // Arrow keys move between tabs, as the ARIA tab pattern expects.
    tab.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const next = tabs[(i + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]
      next.focus()
      show(next.dataset.tab)
    })
  })
  show('calendar')
}

initTokenNotice()
const hasToken = initToken()
if (!hasToken) authLost()
initApprovalList()
initCalendar()
initAlertsPanel()
initBoard()
initGraph()
initProposals()
initRunDialog()
initSearch()
initTaskDetail()
initTaskForm()
initSettings()
initTabs()
if (hasToken) {
  startLive()
  requestRefresh()
}
