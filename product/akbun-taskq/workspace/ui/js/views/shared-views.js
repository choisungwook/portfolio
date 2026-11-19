// The Wiki the bots share. It reads the API only while its view is shown.
import { api, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { on } from '../core/bus.js'
import { fmtDateTime } from '../core/time.js'

let nodes
let wikiQuery = ''
let openSlug = null

export function initSharedViews() {
  nodes = {
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
    if (name === 'wiki') loadWiki()
  })
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
