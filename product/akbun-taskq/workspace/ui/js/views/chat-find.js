// Cmd/Ctrl+F inside a bot conversation: a find bar that highlights matches in the messages and steps through them.
// It replaces the browser's find only while a conversation is shown; elsewhere the browser keeps its own.
import { area, el } from '../core/dom.js'
import { currentView } from '../core/nav.js'

let log
let bar
let input
let count
let hits = []
let at = -1

export function initChatFind(logNode) {
  log = logNode
  bar = area('chat-find')
  input = area('chat-find-input')
  count = area('chat-find-count')
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && currentView().view === 'bot') {
      event.preventDefault()
      bar.hidden = false
      input.focus()
      input.select()
    }
  })
  input.addEventListener('input', refreshFind)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') step(event.shiftKey ? -1 : 1)
    if (event.key === 'Escape') close()
  })
  area('chat-find-next').addEventListener('click', () => step(1))
  area('chat-find-prev').addEventListener('click', () => step(-1))
  area('chat-find-close').addEventListener('click', close)
}

function close() {
  input.value = ''
  refreshFind()
  bar.hidden = true
  document.querySelector('[data-area="bot-input"]')?.focus()
}

function unmark() {
  for (const mark of log.querySelectorAll('mark.find')) mark.replaceWith(document.createTextNode(mark.textContent))
  log.normalize()
}

// Called after every redraw of the log too, so the highlight survives polling.
export function refreshFind() {
  if (!log) return
  unmark()
  hits = []
  const query = input?.value.trim().toLowerCase() ?? ''
  if (!query) {
    if (count) count.textContent = ''
    return
  }
  for (const bubble of log.querySelectorAll('.bubble')) {
    const text = bubble.textContent
    const lower = text.toLowerCase()
    if (!lower.includes(query)) continue
    const parts = []
    let from = 0
    for (let i = lower.indexOf(query); i >= 0; i = lower.indexOf(query, i + query.length)) {
      parts.push(text.slice(from, i))
      const mark = el('mark', { class: 'find', text: text.slice(i, i + query.length) })
      parts.push(mark)
      hits.push(mark)
      from = i + query.length
    }
    parts.push(text.slice(from))
    bubble.replaceChildren(...parts)
  }
  at = hits.length ? Math.min(Math.max(at, 0), hits.length - 1) : -1
  show()
}

function step(direction) {
  if (!hits.length) return
  at = (at + direction + hits.length) % hits.length
  show()
}

function show() {
  for (const hit of hits) hit.classList.remove('current')
  count.textContent = hits.length ? `${at + 1}/${hits.length}` : '0'
  if (at >= 0) {
    hits[at].classList.add('current')
    hits[at].scrollIntoView({ block: 'center' })
  }
}
