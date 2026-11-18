// Search every bot conversation from the sidebar's search icon. One request per search (debounced while typing); the
// server answers from the trigram index, so Korean stems and English both match. A hit opens the bot's conversation
// at that message.
import { api } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { show } from '../core/nav.js'
import { t } from '../core/i18n.js'
import { senderAvatar } from './avatar.js'
import { shortTime } from './bots-sidebar.js'

let input
let list
let timer
let seq = 0

export function initSearchView() {
  input = area('msg-query')
  list = area('msg-hits')
  area('msg-search').addEventListener('submit', (event) => {
    event.preventDefault()
    run()
  })
  input.addEventListener('input', () => {
    clearTimeout(timer)
    timer = setTimeout(run, 250)
  })
  on('tab', (name) => {
    if (name === 'search') setTimeout(() => input.focus(), 0)
  })
  document.addEventListener('keydown', (event) => {
    // Cmd/Ctrl+K opens the search from anywhere, like a command palette.
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      show('search')
    }
  })
}

async function run() {
  const query = input.value.trim()
  const id = ++seq
  if (!query) {
    clear(list)
    return
  }
  try {
    const hits = await api.get(`/bots/search?q=${encodeURIComponent(query)}`)
    if (id !== seq) return
    if (hits.length === 0) {
      clear(list).append(el('li', { class: 'empty', text: t('search.none', 'No conversation matches.') }))
      return
    }
    const bot = (hit) => (hit.sender === 'user' || hit.sender === 'queue' ? hit.recipient : hit.sender)
    clear(list).append(...hits.map((hit) => el('li', {},
      el('button', { type: 'button', class: 'search-hit', onclick: () => {
        show('bot', bot(hit))
        emit('focus-message', hit.id)
      } },
      senderAvatar(hit.sender, 32),
      el('span', { class: 'search-hit-text' },
        el('span', { class: 'meta', text: `${hit.sender} → ${hit.recipient} · ${shortTime(hit.created_at)}` }),
        highlight(hit.snippet, query))))))
  } catch (error) {
    clear(list).append(el('li', { class: 'error', text: error.message }))
  }
}

function highlight(snippet, query) {
  const node = el('span', { class: 'search-snippet' })
  const terms = query.toLowerCase().split(/\s+/).filter((term) => term.length >= 2)
  const lower = snippet.toLowerCase()
  let from = 0
  while (from < snippet.length) {
    let next = -1
    let term = ''
    for (const candidate of terms) {
      const at = lower.indexOf(candidate, from)
      if (at >= 0 && (next < 0 || at < next)) {
        next = at
        term = candidate
      }
    }
    if (next < 0) break
    node.append(snippet.slice(from, next), el('mark', { text: snippet.slice(next, next + term.length) }))
    from = next + term.length
  }
  node.append(snippet.slice(from))
  return node
}
