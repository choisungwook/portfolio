// Must-check panel: a bell in the header with the count of open alerts; clicking it opens the panel over the page (like
// the macOS notification list) and Escape or a click outside closes it. Unacked critical and high alerts, critical
// first, with per-kind actions and the queue banner. Normal alerts are not shown.
// An approval alert gets Review only: the decision is taken in the task's approval panel, where the input is shown.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'
import { label, SEVERITY_RANK } from '../core/vocab.js'
import { t } from '../core/i18n.js'

const KIND_ACTIONS = {
  auth_required: [['Resume', 'resume', 'Resumed']],
  review_ready: [['Mark done', 'done', 'Marked done']],
}

let list
let badges
let banner
let bannerText
let toggle
let paused = false
let panel
let bell
let approvals = new Map()   // open bot approval requests by id, so their alert shows the whole call

export function initAlertsPanel() {
  list = area('alerts-list')
  badges = area('alert-badges')
  banner = area('queue-banner')
  bannerText = area('queue-text')
  toggle = area('queue-toggle')
  toggle.addEventListener('click', () => (paused
    ? mutate(() => api.post('/queue/resume', {}), 'Queue resumed')
    : mutate(() => api.post('/queue/pause', {}), 'Queue paused')))
  on('refresh', load)
  panel = area('alerts-panel')
  bell = area('alerts-button')
  bell.addEventListener('click', () => setOpen(panel.hidden))
  // Escape closes it, unless a dialog it opened is on top (that Escape is the dialog's) or another handler took the key.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || panel.hidden || event.defaultPrevented || document.querySelector('dialog[open]')) return
    const inside = panel.contains(document.activeElement) || document.activeElement === bell
    event.preventDefault()
    setOpen(false)
    if (inside) bell.focus()
  })
  window.addEventListener('resize', () => {
    if (!panel.hidden) place()
  })
  // A click outside closes it; clicks on its own buttons, and on dialogs it opens, do not.
  document.addEventListener('click', (event) => {
    if (panel.hidden || panel.contains(event.target) || bell.contains(event.target) || event.target.closest('dialog')) return
    setOpen(false)
  })
}

function setOpen(open) {
  panel.hidden = !open
  bell.setAttribute('aria-expanded', String(open))
  if (!open) return
  place()
  area('must-check-title').focus()
  load()
}

// Beside the bell at the bottom of the sidebar: to its right, bottoms aligned, never past the window's edges.
function place() {
  const box = bell.getBoundingClientRect()
  const width = panel.offsetWidth
  const left = Math.max(16, Math.min(Math.round(box.right + 8), window.innerWidth - width - 16))
  panel.style.left = `${left}px`
  panel.style.right = 'auto'
  panel.style.top = 'auto'
  const bottom = Math.max(16, Math.round(window.innerHeight - box.bottom))
  panel.style.bottom = `${bottom}px`
  panel.style.maxHeight = `${window.innerHeight - bottom - 16}px`
}

// The bell's count: open critical and high alerts, plus waiting approvals that have no open alert of their own (a task
// approval raises one, so it is counted once). Red when one is critical. A paused queue shows "!" when nothing else does.
function renderBell(shown, approvalsWaiting, queuePaused) {
  const count = area('alerts-count')
  const alerted = new Set(shown.filter((a) => a.kind === 'approval_required').map((a) => a.task_id))
  const pending = approvalsWaiting.filter((p) => !alerted.has(p.task_id)).length
  const total = shown.length + pending
  count.hidden = total === 0 && !queuePaused
  count.textContent = total === 0 ? '!' : total > 99 ? '99+' : String(total)
  count.dataset.level = shown.some((a) => a.severity === 'critical') || pending > 0 || total === 0 ? 'critical' : 'high'
  const text = `${t('panel.must_check', 'Must check')}${total ? ` (${total})` : ''}${queuePaused ? ` · ${t('panel.queue_paused', 'queue paused')}` : ''}`
  bell.title = text
  bell.setAttribute('aria-label', text)
}

async function load() {
  try {
    const [alerts, queue, requests, taskApprovals] = await Promise.all([
      api.get('/alerts'), api.get('/queue'), api.get('/bot-approvals').catch(() => []), api.get('/approvals').catch(() => []),
    ])
    approvals = new Map(requests.map((r) => [String(r.id), r]))
    const unacked = alerts
      .filter((a) => a.acked_at === null && a.severity !== 'normal')
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.created_at - a.created_at)
    renderBadges(unacked)
    renderBanner(queue)
    renderBell(unacked, taskApprovals, queue.paused)
    clear(list).append(...(unacked.length === 0
      ? [el('li', { class: 'empty', text: 'Nothing to check.' })]
      : unacked.map((a) => item(a))))
  } catch (error) {
    clear(list).append(el('li', { class: 'error', text: error.message }))
  }
}

function renderBadges(unacked) {
  const count = (sev) => unacked.filter((a) => a.severity === sev).length
  clear(badges).append(
    el('span', { class: 'badge sev-critical', text: `critical ${count('critical')}` }),
    el('span', { class: 'badge sev-high', text: `high ${count('high')}` }),
  )
}

// At the top of the panel: whether the queue runs, and the one button that pauses or resumes it. While the panel is
// closed, a paused queue shows on the bell.
function renderBanner(queue) {
  paused = queue.paused
  banner.dataset.state = paused ? 'paused' : 'running'
  bannerText.textContent = paused ? `Queue paused${queue.reason ? `: ${queue.reason}` : '.'}` : 'Queue running'
  toggle.textContent = paused ? 'Resume queue' : 'Pause queue'
}

function actionsFor(alert) {
  // A bot's call that waits for approval is answered right here.
  const [refKind, refId] = String(alert.ref ?? '').split(':')
  if (refKind === 'bot-approval') {
    return [
      el('button', { type: 'button', text: 'Approve once', onclick: () => mutate(() => api.post(`/bot-approvals/${refId}`, { approve: true }), 'Approved; the bot may run it once') }),
      el('button', { type: 'button', class: 'danger', text: 'Deny', onclick: () => mutate(() => api.post(`/bot-approvals/${refId}`, { approve: false }), 'Denied') }),
    ]
  }
  if (alert.kind === 'approval_required') {
    return [el('button', { type: 'button', text: 'Review', onclick: () => emit('review-approval', alert.task_id) })]
  }
  return (KIND_ACTIONS[alert.kind] ?? []).map(([text, path, ok]) => el('button', {
    type: 'button',
    text,
    onclick: () => mutate(() => api.post(`/tasks/${alert.task_id}/${path}`, {}), ok),
  }))
}

// The whole call a bot waits to run, so the user reads all of what "Approve once" lets through.
function fullCall(alert) {
  const [refKind, refId] = String(alert.ref ?? '').split(':')
  const request = refKind === 'bot-approval' ? approvals.get(refId) : null
  if (!request) return null
  return el('details', { class: 'alert-call', open: request.command.length <= 300 || null },
    el('summary', { text: `${request.tool} · ${request.command.length} characters` }),
    el('pre', { class: 'mono', text: request.command }))
}

function item(alert) {
  const acked = () => mutate(() => api.post(`/alerts/${alert.id}/ack`, {}), 'Acknowledged')
  return el('li', { class: `alert sev-${alert.severity}` },
    el('div', { class: 'alert-head' },
      el('strong', { class: 'sev-label', text: label(alert.severity) }),
      el('span', { class: 'kind', text: label(alert.kind) })),
    alert.task_id
      ? el('button', { type: 'button', class: 'link', text: alert.task_title ?? alert.task_id, onclick: () => emit('open-task', alert.task_id) })
      : el('span', { class: 'meta', text: 'No task' }),
    el('p', { class: 'alert-message', text: alert.message }),
    fullCall(alert),
    el('time', { datetime: new Date(alert.created_at * 1000).toISOString(), text: fmtDateTime(alert.created_at) }),
    el('div', { class: 'actions' }, ...actionsFor(alert), el('button', { type: 'button', text: 'Acknowledge', onclick: acked })))
}
