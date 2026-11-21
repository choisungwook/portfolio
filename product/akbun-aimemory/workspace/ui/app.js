const token = new URLSearchParams(location.search).get('token')
const api = (path, init = {}) => fetch(`/api/${path}`, { ...init, headers: { 'x-aimem-token': token } }).then((r) => r.json())
const $ = (id) => document.getElementById(id)
const time = (ms) => new Date(ms).toLocaleString()
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

function renderMemories(items, title, sessionId) {
  $('memory-pane').innerHTML = `<h2>${esc(title)}</h2>`
    + (sessionId ? `<button id="delete-session">Delete session</button>` : '')
    + (items.length ? '' : '<p class="meta">Nothing here.</p>')
    + items.map((m) => `<article class="memory" data-id="${m.id}">
        <div class="meta">${time(m.created_at)} · ${esc(m.agent)} · ${esc(m.kind)} · ${esc(m.project)}${m.score ? ` · ${m.score.toFixed(4)}` : ''}</div>
        <pre>${esc(m.content)}</pre>
        <button class="delete-memory">Delete</button></article>`).join('')
  $('delete-session')?.addEventListener('click', async () => {
    if (!confirm('Delete this session and all its memories?')) return
    await api(`sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' }); load()
  })
  for (const b of document.querySelectorAll('.delete-memory')) b.addEventListener('click', async () => {
    const card = b.closest('.memory'); await api(`memories/${card.dataset.id}`, { method: 'DELETE' }); card.remove()
  })
}

async function openSession(id) {
  for (const b of document.querySelectorAll('.session')) b.setAttribute('aria-current', String(b.dataset.id === id))
  renderMemories(await api(`sessions/${encodeURIComponent(id)}`), id, id)
}

async function load() {
  const sessions = await api('sessions')
  $('session-list').innerHTML = sessions.map((s) => `<button class="session" data-id="${esc(s.id)}">
    <div>${esc(s.project || s.id)}</div><div class="meta">${esc(s.agent)} · ${s.memories} · ${time(s.started_at)}</div></button>`).join('')
  for (const b of document.querySelectorAll('.session')) b.addEventListener('click', () => openSession(b.dataset.id))
  $('memory-pane').innerHTML = '<p class="meta">Pick a session or search.</p>'
}

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = $('search-input').value.trim()
  if (q) renderMemories(await api(`search?q=${encodeURIComponent(q)}`), `Search: ${q}`)
})
$('export-link').href = `/api/export?token=${token}`
load()
