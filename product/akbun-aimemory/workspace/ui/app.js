const token = new URLSearchParams(location.search).get('token')
const api = async (path, init = {}) => {
  const headers = { 'x-aimem-token': token, ...(init.headers ?? {}) }
  const res = await fetch(`/api/${path}`, { ...init, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}
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

function renderCaBundle(info) {
  const status = $('ca-status')
  const err = $('ca-error')
  const list = $('ca-cert-list')
  if (info.error) {
    err.textContent = info.error
    err.hidden = false
  } else {
    err.hidden = true
    err.textContent = ''
  }
  if (!info.path) {
    status.textContent = 'No custom CA bundle configured.'
    $('ca-clear-btn').disabled = true
    list.innerHTML = ''
    return
  }
  status.textContent = `Source: ${info.source} (${info.path})`
  $('ca-clear-btn').disabled = info.source !== 'saved'
  list.innerHTML = info.certs.map((c) => `<div class="cert-card">
    <div><strong>${esc(c.subject)}</strong></div>
    <div class="meta">Issuer: ${esc(c.issuer)}</div>
    <div class="meta">Valid until: ${esc(c.valid_to)}</div>
    <div class="meta mono">SHA-256: ${esc(c.fingerprint256)}</div>
  </div>`).join('')
}

async function openConnections() {
  $('ca-error').hidden = true
  $('connections-dialog').showModal()
  try {
    renderCaBundle(await api('ca-bundle'))
  } catch (error) {
    $('ca-error').textContent = error.message
    $('ca-error').hidden = false
  }
}

$('connections-btn').addEventListener('click', openConnections)
$('connections-close').addEventListener('click', () => $('connections-dialog').close())
$('ca-import-btn').addEventListener('click', () => $('ca-file').click())
$('ca-file').addEventListener('change', async (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try {
    const pem = await file.text()
    const info = await api('ca-bundle', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pem }),
    })
    renderCaBundle(info)
  } catch (error) {
    $('ca-error').textContent = error.message
    $('ca-error').hidden = false
  }
})
$('ca-clear-btn').addEventListener('click', async () => {
  try {
    renderCaBundle(await api('ca-bundle', { method: 'DELETE' }))
  } catch (error) {
    $('ca-error').textContent = error.message
    $('ca-error').hidden = false
  }
})

$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const q = $('search-input').value.trim()
  if (q) renderMemories(await api(`search?q=${encodeURIComponent(q)}`), `Search: ${q}`)
})
$('export-link').href = `/api/export?token=${token}`
load()
