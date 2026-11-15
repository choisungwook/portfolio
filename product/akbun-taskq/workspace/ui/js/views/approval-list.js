// Must-check list of open approvals. Each row shows the start of the command and a Review button. Never Approve.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { approvalText, headOf } from '../pure/approval-view.js'
import { visibleText } from './visible-text.js'

const PREVIEW_CHARS = 120

let section
let list

export function initApprovalList() {
  section = area('pending-approvals')
  list = area('pending-list')
  on('refresh', load)
}

async function load() {
  try {
    const rows = await api.get('/approvals')
    section.hidden = rows.length === 0
    clear(list).append(...rows.map(row))
  } catch {
    // The token notice explains a lost token. Hide the list rather than repeat the error here.
    section.hidden = true
  }
}

function row(p) {
  const { command, json } = approvalText(p.tool, p.input)
  return el('li', { class: 'alert' },
    el('div', { class: 'alert-head' }, el('strong', { class: 'sev-label', text: p.tool }), el('span', { class: 'kind', text: 'approval' })),
    el('button', { type: 'button', class: 'link', text: p.task_title ?? p.task_id, onclick: () => emit('open-task', p.task_id) }),
    visibleText('p', headOf(command ?? json, PREVIEW_CHARS), { class: 'alert-message' }),
    el('div', { class: 'actions' }, el('button', { type: 'button', text: 'Review', onclick: () => emit('review-approval', p.task_id) })))
}
