// Must-check panel, always visible. Unacked alerts, critical first, with per-kind actions and the queue-paused banner.
// An approval alert gets Review only: the decision is taken in the task's approval panel, where the input is shown.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'
import { label, SEVERITY_RANK } from '../core/vocab.js'

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
}

async function load() {
  try {
    const [alerts, queue] = await Promise.all([api.get('/alerts'), api.get('/queue')])
    const unacked = alerts
      .filter((a) => a.acked_at === null)
      .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.created_at - a.created_at)
    renderBadges(unacked)
    renderBanner(queue)
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
    el('span', { class: 'badge sev-normal', text: `normal ${count('normal')}` }),
  )
}

// Always shown: the text says whether the queue runs, and the one button pauses or resumes it.
function renderBanner(queue) {
  paused = queue.paused
  banner.dataset.state = paused ? 'paused' : 'running'
  bannerText.textContent = paused ? `Queue paused${queue.reason ? `: ${queue.reason}` : '.'}` : 'Queue running'
  toggle.textContent = paused ? 'Resume queue' : 'Pause queue'
}

function actionsFor(alert) {
  if (alert.kind === 'approval_required') {
    return [el('button', { type: 'button', text: 'Review', onclick: () => emit('review-approval', alert.task_id) })]
  }
  return (KIND_ACTIONS[alert.kind] ?? []).map(([text, path, ok]) => el('button', {
    type: 'button',
    text,
    onclick: () => mutate(() => api.post(`/tasks/${alert.task_id}/${path}`, {}), ok),
  }))
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
    el('time', { datetime: new Date(alert.created_at * 1000).toISOString(), text: fmtDateTime(alert.created_at) }),
    el('div', { class: 'actions' }, ...actionsFor(alert), el('button', { type: 'button', text: 'Acknowledge', onclick: acked })))
}
