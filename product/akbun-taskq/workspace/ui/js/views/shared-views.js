// Discussions and Wiki, the two things the bots share. Both read the API only while their view is shown.
import { api, mutate, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'
import { senderAvatar } from './avatar.js'

let nodes
let wikiQuery = ''
let openSlug = null

export function initSharedViews() {
  nodes = {
    threads: area('thread-list'),
    search: area('wiki-search'),
    query: area('wiki-query'),
    list: area('wiki-list'),
    page: area('wiki-page'),
  }
  nodes.search.addEventListener('submit', (event) => {
    event.preventDefault()
    wikiQuery = nodes.query.value.trim()
    loadWiki()
  })
  on('tab', (name) => {
    if (name === 'discussions') loadThreads()
    if (name === 'wiki') loadWiki()
  })
}

async function loadThreads() {
  try {
    const { threads } = await api.get('/bots')
    if (threads.length === 0) {
      clear(nodes.threads).append(el('li', { class: 'empty', text: 'No discussions yet. A bot opens one when a question needs several views.' }))
      return
    }
    clear(nodes.threads).append(...threads.map(threadCard))
  } catch (error) {
    clear(nodes.threads).append(el('li', { class: 'error', text: error.message }))
  }
}

function threadCard(t) {
  const total = t.rounds * t.participants.length
  const next = t.status === 'open' ? t.participants[t.posts % t.participants.length] : null
  const state = t.status === 'open' ? `${next}'s turn` : t.status === 'concluding' ? `waiting for ${t.moderator} to conclude` : 'closed'
  return el('li', { class: 'thread', dataset: { status: t.status } },
    el('div', { class: 'thread-people' }, ...t.participants.map((name) => el('span', {
      class: 'thread-person', dataset: { next: String(name === next) }, title: name,
    }, senderAvatar(name, 28)))),
    el('h3', { text: `#${t.id} ${t.topic}` }),
    el('p', { class: 'meta', text: `moderator ${t.moderator} · ${t.participants.join(' → ')} · ${t.posts}/${total} turns · ${state}` }),
    t.conclusion ? el('p', { class: 'pre thread-conclusion', text: t.conclusion }) : null,
    t.status === 'closed' ? null : el('button', {
      type: 'button', class: 'quiet', text: 'Close without a conclusion',
      onclick: () => mutate(() => api.post(`/bots/threads/${t.id}/close`), `Discussion #${t.id} closed`).then(loadThreads),
    }))
}

async function loadWiki() {
  try {
    const pages = await api.get(`/bots/wiki${qs({ q: wikiQuery })}`)
    if (pages.length === 0) {
      clear(nodes.list).append(el('li', { class: 'empty', text: wikiQuery ? 'No page matches.' : 'The wiki is empty.' }))
      return
    }
    // A search returns hits (snippet, via); the plain list returns pages (revision, author).
    clear(nodes.list).append(...pages.map((p) => el('li', {},
      el('button', { type: 'button', class: 'wiki-item', 'aria-current': p.slug === openSlug ? 'true' : null, onclick: () => showPage(p.slug) },
        el('strong', { text: p.title }),
        el('span', { class: 'meta', text: p.snippet === undefined
          ? `${p.slug} · r${p.revision} · ${p.updated_by}`
          : `${p.slug}${p.via ? ` · linked from ${p.via}` : ''}` }),
        p.snippet === undefined ? null : el('span', { class: 'wiki-snippet', text: p.snippet })))))
  } catch (error) {
    clear(nodes.list).append(el('li', { class: 'error', text: error.message }))
  }
}

async function showPage(slug) {
  openSlug = slug
  try {
    const page = await api.get(`/bots/wiki/page${qs({ slug })}`)
    clear(nodes.page).append(
      el('h3', { text: page.title }),
      el('p', { class: 'meta', text: `${page.slug} · revision ${page.revision} by ${page.updated_by} · ${fmtDateTime(page.updated_at)}` }),
      el('pre', { text: page.body }))
    nodes.page.hidden = false
    loadWiki()
  } catch (error) {
    clear(nodes.page).append(el('p', { class: 'error', text: error.message }))
  }
}
