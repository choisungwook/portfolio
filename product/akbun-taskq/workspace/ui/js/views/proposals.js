// Proposals tab: pending memory and skill proposals, with the text to be appended and Apply / Reject.
import { api, mutate } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'
import { label } from '../core/vocab.js'

let list
let active = false

export function initProposals() {
  list = area('proposal-list')
  on('tab', (name) => {
    active = name === 'proposals'
    if (active) load()
  })
  on('refresh', () => {
    if (active) load()
  })
}

async function load() {
  try {
    const rows = await api.get('/proposals?status=pending')
    clear(list).append(...(rows.length === 0 ? [el('p', { class: 'empty', text: 'No pending proposals.' })] : rows.map(card)))
  } catch (error) {
    clear(list).append(el('p', { class: 'error', text: error.message }))
  }
}

function card(p) {
  return el('article', { class: 'proposal' },
    el('h3', { text: `${label(p.kind)} proposal` }),
    el('p', { class: 'meta', text: `Target: ${p.target_path} · created ${fmtDateTime(p.created_at)}` }),
    el('pre', { text: p.diff }),
    el('div', { class: 'actions' },
      el('button', { type: 'button', text: 'Apply', onclick: () => decide(p.id, 'apply', 'Applied') }),
      el('button', { type: 'button', text: 'Reject', onclick: () => decide(p.id, 'reject', 'Rejected') })))
}

function decide(id, action, okMessage) {
  return mutate(() => api.post(`/proposals/${id}/${action}`, {}), okMessage)
}
