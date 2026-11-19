// Entry point: wires the sidebar navigation, the views and the live updates. Token first: no view may fetch before it is known.
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
import { initBotChat } from './views/bot-chat.js'
import { initBotsSidebar } from './views/bots-sidebar.js'
import { initSharedViews } from './views/shared-views.js'
import { initNav } from './core/nav.js'
import { initSearchView } from './views/search-view.js'
import { initSharedFolder } from './views/shared-folder.js'
import { initPluginsView } from './views/plugins-view.js'
import { initWorkflowsView } from './views/workflows-view.js'
import { initWikiTransfer } from './views/wiki-transfer.js'
import { initUsageSettings } from './views/usage-settings.js'
import { initConnections } from './views/connections.js'
import { initGlobalSettings, loadGlobalSettings } from './views/global-settings.js'
import { initTokenNotice } from './views/token-notice.js'

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
initGlobalSettings()
initBotChat()
initSharedViews()
initSearchView()
initSharedFolder()
initPluginsView()
initWorkflowsView()
initWikiTransfer()
initUsageSettings()
initConnections()
initNav()
if (hasToken) {
  loadGlobalSettings()
  initBotsSidebar()
  startLive()
  requestRefresh()
}
