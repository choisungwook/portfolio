// Header search: full-text match over past runs. Each result opens its run dialog.
import { api, qs } from '../core/api.js'
import { area, clear, el } from '../core/dom.js'
import { emit } from '../core/bus.js'

let form
let results
let body

export function initSearch() {
  form = area('search')
  results = area('search-results')
  body = results.querySelector('.search-body')
  form.addEventListener('submit', (event) => {
    event.preventDefault()
    run(String(new FormData(form).get('q') ?? '').trim())
  })
  area('search-close').addEventListener('click', () => {
    results.hidden = true
  })
}

async function run(q) {
  results.hidden = false
  if (!q) {
    clear(body).append(el('p', { class: 'empty', text: 'Type a word to search.' }))
    return
  }
  try {
    const rows = await api.get(`/search${qs({ q })}`)
    clear(body).append(
      el('h2', { text: `Results for "${q}"` }),
      rows.length === 0
        ? el('p', { class: 'empty', text: 'No matching runs.' })
        : el('ul', { class: 'search-list' }, ...rows.map((row) => el('li', {},
          el('strong', { text: row.task_title ?? row.task_id }),
          el('p', { class: 'pre', text: row.snippet }),
          el('button', { type: 'button', text: 'Open run', onclick: () => emit('open-run', row.run_id) })))),
    )
  } catch (error) {
    clear(body).append(el('p', { class: 'error', text: error.message }))
  }
}
