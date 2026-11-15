// Text with non-printing characters in marked spans. Built with createElement and textContent only.
import { el } from '../core/dom.js'
import { visibleParts } from '../pure/hidden-chars.js'

export function visibleText(tag, text, props = {}) {
  return el(tag, props, ...visibleParts(text).map((part) => (part.hidden ? el('span', { class: 'hidden-char', text: part.text }) : part.text)))
}
