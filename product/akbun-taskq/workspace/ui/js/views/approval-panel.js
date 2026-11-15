// Approval panel on the task detail. Shows the exact input the pending request will run, and answers that one
// request only (its request_id). Long input keeps Approve disabled until the user scrolls the input to its end,
// or ticks the box when there is nothing to scroll.
import { api, notify } from '../core/api.js'
import { el } from '../core/dom.js'
import { emit } from '../core/bus.js'
import { requestRefresh } from '../core/refresh.js'
import { fmtDateTime } from '../core/time.js'
import { approvalText, hiddenInInput, isLong } from '../pure/approval-view.js'
import { visibleText } from './visible-text.js'

// Read progress survives the detail view's refresh, so a re-render does not ask the user to read again.
const memo = { requestId: null, read: false, checked: false, scroll: 0 }

export function approvalPanel(task, pending) {
  if (memo.requestId !== pending.request_id) Object.assign(memo, { requestId: pending.request_id, read: false, checked: false, scroll: 0 })
  const { command, json } = approvalText(pending.tool, pending.input)
  const needsRead = isLong(json) || (command !== null && isLong(command))
  const hidden = hiddenInInput(pending.input)

  const pre = visibleText('pre', json, { class: 'approval-json' })
  const check = el('input', { type: 'checkbox' })
  check.checked = memo.checked
  const approve = el('button', { type: 'button', text: 'Approve', onclick: () => answer(task.id, pending, true) })
  const deny = el('button', { type: 'button', text: 'Deny', onclick: () => answer(task.id, pending, false) })
  approve.disabled = needsRead && !memo.read

  const unlock = () => {
    memo.read = true
    approve.disabled = false
  }
  const atEnd = () => pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 2
  pre.addEventListener('scroll', () => {
    memo.scroll = pre.scrollTop
    if (atEnd()) unlock()
  })
  check.addEventListener('change', () => {
    memo.checked = check.checked
    if (check.checked) unlock()
  })
  // After the panel is in the page, put the scroll position back. Only a scroll to the end (or the box) unlocks.
  requestAnimationFrame(() => {
    pre.scrollTop = memo.scroll
  })

  const parts = [
    el('h3', { text: 'Approval needed' }),
    el('p', { class: 'meta', text: `Tool ${pending.tool} · ${pending.bytes} bytes · requested ${fmtDateTime(pending.created_at)}` }),
  ]
  if (hidden > 0) {
    parts.push(el('p', {
      class: 'approval-warning',
      role: 'alert',
      text: `This input has ${hidden} hidden or non-printing character${hidden === 1 ? '' : 's'}. They are shown as escapes such as \\u{202E}.`,
    }))
  }
  if (command !== null) {
    parts.push(el('p', { class: 'approval-label', text: 'Command' }), visibleText('pre', command, { class: 'approval-command' }))
  }
  parts.push(el('p', { class: 'approval-label', text: 'Whole input (JSON)' }), pre)
  if (needsRead) parts.push(el('label', { class: 'approval-read' }, check, ' I have read the whole command'))
  parts.push(el('div', { class: 'actions' }, approve, deny))

  return el('section', {
    class: 'approval-panel',
    tabindex: -1,
    dataset: { area: 'approval-panel', request: pending.request_id },
  }, ...parts)
}

// request_id is the one the user saw. A 409 means it is no longer the open request: reload and say so.
async function answer(taskId, pending, approve) {
  try {
    await api.post(`/tasks/${taskId}/${approve ? 'approve' : 'deny'}`, { request_id: pending.request_id })
    notify(approve ? 'Approved' : 'Denied')
  } catch (error) {
    notify(error.status === 409
      ? 'The approval request changed while you were reading. The task was reloaded; review the new input.'
      : error.message, true)
  }
  requestRefresh()
  emit('open-task', taskId)
}
