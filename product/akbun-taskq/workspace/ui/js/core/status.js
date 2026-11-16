import { el } from './dom.js'
import { label } from './vocab.js'

// Status indicator (Carbon): symbol, color and word together. The symbol and color come from css/base.css by data-status.
export function statusIndicator(status, text = label(status)) {
  return el('span', { class: 'status-ind', dataset: { status }, text })
}
