// The page for akbun-keychain gui. Plain ES module, no build. All text from the server goes through textContent.

/** @typedef {{ name: string, description: string, tags: string[], ai_access: 'inject'|'reveal'|'deny', updated_at: string, version: number, intact: boolean }} Entry */
/** @typedef {{ at: string, actor: string, op: string, keys: string[], ok: boolean, code?: string, program?: string }} AuditLine */
/** @typedef {{ locked: boolean, expires_at?: string, idle_expires_at?: string }} AgentStatus */

const REVEAL_MS = 30_000

/** @param {string} selector @returns {HTMLElement} */
function $(selector) {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) throw new Error(`missing ${selector}`)
  return element
}

/** @param {string} area @returns {HTMLElement} */
function area(area) {
  return $(`[data-area="${area}"]`)
}

/**
 * @param {string} tag
 * @param {Record<string, string>} [attributes]
 * @param {(Node|string)[]} [children]
 * @returns {HTMLElement}
 */
function el(tag, attributes = {}, children = []) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  for (const child of children) element.append(child)
  return element
}

class ApiError extends Error {
  /** @param {number} status @param {string} code @param {string} message @param {Record<string, unknown>} body */
  constructor(status, code, message, body) {
    super(message)
    this.status = status
    this.code = code
    this.body = body
  }
}

/**
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<any>}
 */
async function api(method, path, body) {
  const response = await fetch(path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.error ?? 'UNEXPECTED', data.message ?? response.statusText, data)
  return data
}

/** @param {string} text @param {'info'|'success'|'error'} kind */
function notify(text, kind = 'info') {
  const notice = area('notice')
  notice.className = `notice ${kind}`
  const label = kind === 'error' ? 'Error: ' : kind === 'success' ? 'Done: ' : ''
  $('.notice-text').textContent = `${label}${text}`
  notice.hidden = false
}

/** @param {unknown} error */
function describe(error) {
  if (error instanceof ApiError) {
    if (error.code === 'NO_SESSION') return 'the session ended. Run akbun-keychain gui again.'
    return `${error.code}: ${error.message}`
  }
  return 'the server did not answer. It may have stopped; run akbun-keychain gui again.'
}

/** @type {Entry[]} */
let entries = []
/** @type {string|undefined} */
let editing

function showClosed() {
  $('.workspace').hidden = true
  area('login').hidden = true
  area('logout').hidden = true
  area('notice').hidden = true
  $('.closed').hidden = false
}

/** @param {string} iso */
function when(iso) {
  return iso ? new Date(iso).toLocaleString() : ''
}

/** @param {Entry} entry */
function row(entry) {
  const level = el('span', { class: `level ${entry.ai_access}` }, [
    entry.ai_access === 'deny' ? '■ deny' : entry.ai_access === 'reveal' ? '◆ reveal' : '● inject',
  ])
  const head = el('div', { class: 'key-head' }, [el('span', { class: 'key-name' }, [entry.name]), level])
  if (!entry.intact) head.append(el('span', { class: 'broken' }, ['✕ fails authentication']))
  const meta = el('div', { class: 'key-meta' }, [
    ...entry.tags.map((tag) => el('span', { class: 'tag' }, [tag])),
    entry.description ? ` ${entry.description}` : '',
    ` · updated ${when(entry.updated_at)}`,
  ])
  const reveal = el('button', { type: 'button', class: 'ghost', 'data-area': 'key-reveal' }, ['Reveal'])
  const copy = el('button', { type: 'button', class: 'ghost', 'data-area': 'key-copy' }, ['Copy'])
  const editButton = el('button', { type: 'button', class: 'ghost' }, ['Edit'])
  const remove = el('button', { type: 'button', class: 'ghost', 'data-area': 'key-delete' }, ['Delete'])
  const item = el('li', { class: 'key-row', 'data-area': 'key-row', 'data-name': entry.name }, [
    head,
    meta,
    el('div', { class: 'row-actions' }, [reveal, copy, editButton, remove]),
  ])

  reveal.addEventListener('click', async () => {
    try {
      const { value } = await api('POST', `/api/keys/${encodeURIComponent(entry.name)}/reveal`)
      const shown = el('div', { class: 'key-value' }, [value])
      item.append(shown)
      reveal.setAttribute('disabled', '')
      setTimeout(() => {
        shown.remove()
        reveal.removeAttribute('disabled')
      }, REVEAL_MS)
      void refreshAudit()
    } catch (error) {
      notify(describe(error), 'error')
    }
  })
  copy.addEventListener('click', async () => {
    try {
      const { value } = await api('POST', `/api/keys/${encodeURIComponent(entry.name)}/reveal`)
      await navigator.clipboard.writeText(value)
      notify(`copied ${entry.name} to the clipboard`, 'success')
      void refreshAudit()
    } catch (error) {
      notify(describe(error), 'error')
    }
  })
  editButton.addEventListener('click', () => openEditor(entry))
  remove.addEventListener('click', () => {
    if (item.querySelector('.confirm')) return
    const input = el('input', { 'aria-label': `Type ${entry.name} to delete it`, placeholder: `Type ${entry.name}` })
    const confirm = el('button', { type: 'button', class: 'danger' }, ['Delete permanently'])
    const cancel = el('button', { type: 'button', class: 'ghost' }, ['Cancel'])
    const box = el('div', { class: 'confirm' }, [input, confirm, cancel])
    item.append(box)
    input.focus()
    cancel.addEventListener('click', () => box.remove())
    confirm.addEventListener('click', async () => {
      if (/** @type {HTMLInputElement} */ (input).value !== entry.name) {
        notify(`type ${entry.name} exactly to delete it`, 'error')
        return
      }
      try {
        await api('DELETE', `/api/keys/${encodeURIComponent(entry.name)}`)
        notify(`deleted ${entry.name}`, 'success')
        await refresh()
      } catch (error) {
        notify(describe(error), 'error')
      }
    })
  })
  return item
}

function renderList() {
  const query = /** @type {HTMLInputElement} */ (area('key-search')).value.trim().toLowerCase()
  const visible = entries.filter((entry) =>
    !query || [entry.name, entry.description, ...entry.tags].some((text) => text.toLowerCase().includes(query)))
  const list = area('key-list')
  list.replaceChildren(...visible.map(row))
  if (visible.length === 0) list.append(el('li', { class: 'key-row muted' }, [entries.length ? 'No key matches.' : 'No keys yet.']))
}

/** @param {Entry} [entry] */
function openEditor(entry) {
  const form = /** @type {HTMLFormElement} */ (area('key-editor'))
  form.reset()
  editing = entry?.name
  $('.editor-title').textContent = entry ? `Edit ${entry.name}` : 'New key'
  $('.editor-value-hint').hidden = !entry
  area('key-editor-error').hidden = true
  const field = (/** @type {string} */ name) => /** @type {HTMLInputElement} */ (form.elements.namedItem(name))
  field('value').required = !entry
  if (entry) {
    field('name').value = entry.name
    field('description').value = entry.description
    field('tags').value = entry.tags.join(', ')
    field('ai_access').value = entry.ai_access
  }
  form.hidden = false
  field(entry ? 'value' : 'name').focus()
}

/** @param {SubmitEvent} event */
async function saveEditor(event) {
  event.preventDefault()
  const form = /** @type {HTMLFormElement} */ (area('key-editor'))
  const data = new FormData(form)
  const text = (/** @type {string} */ name) => String(data.get(name) ?? '')
  const tags = text('tags').split(',').map((tag) => tag.trim()).filter(Boolean)
  const body = { description: text('description'), tags, ai_access: text('ai_access') }
  try {
    if (editing) {
      const change = { ...body, value: text('value') || undefined, rename: text('name') !== editing ? text('name') : undefined }
      await api('PATCH', `/api/keys/${encodeURIComponent(editing)}`, change)
      notify(`saved ${text('name')}`, 'success')
    } else {
      await api('POST', '/api/keys', { ...body, name: text('name'), value: text('value') })
      notify(`created ${text('name')}`, 'success')
    }
    form.reset()
    form.hidden = true
    editing = undefined
    await refresh()
  } catch (error) {
    const message = area('key-editor-error')
    message.textContent = describe(error)
    message.hidden = false
  }
}

async function refreshAgent() {
  /** @type {AgentStatus} */
  const status = await api('GET', '/api/agent')
  $('.agent-state').textContent = status.locked
    ? '○ Locked: AI agents cannot use the vault.'
    : `● Unlocked: agents can use the vault until ${when(status.idle_expires_at ?? '')} if idle.`
  area('agent-unlock').hidden = !status.locked
  area('agent-lock').hidden = status.locked
}

async function refreshAudit() {
  /** @type {{ lines: AuditLine[] }} */
  const { lines } = await api('GET', '/api/audit?limit=100')
  const items = lines.reverse().map((line) =>
    el('li', line.ok ? {} : { class: 'failed' }, [
      `${when(line.at)} ${line.actor} ${line.op}${line.keys.length ? ` ${line.keys.join(', ')}` : ''}`,
      line.program ? ` (${line.program})` : '',
      line.ok ? ' ✓ ok' : ` ✕ ${line.code ?? 'failed'}`,
    ]))
  $('.audit-lines').replaceChildren(...items)
}

async function refresh() {
  try {
    entries = (await api('GET', '/api/keys')).entries
    renderList()
    await Promise.all([refreshAgent(), refreshAudit()])
  } catch (error) {
    notify(describe(error), 'error')
  }
}

const bootstrap = new URLSearchParams(location.hash.slice(1)).get('bootstrap') ?? ''
history.replaceState(null, '', location.pathname)

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault()
  const input = /** @type {HTMLInputElement} */ (area('login-password'))
  const error = area('login-error')
  try {
    await api('POST', '/api/login', { bootstrap, password: input.value })
    input.value = ''
    area('login').hidden = true
    $('.workspace').hidden = false
    area('logout').hidden = false
    await refresh()
  } catch (failure) {
    input.value = ''
    if (failure instanceof ApiError && failure.code === 'BAD_PASSWORD') {
      const left = Number(failure.body.attempts_left)
      error.textContent = left > 0 ? `Wrong password. ${left} attempts left.` : 'Wrong password. The server has stopped.'
      if (left <= 0) setTimeout(showClosed, 1500)
    } else {
      error.textContent = describe(failure)
    }
    error.hidden = false
  }
})

$('.notice-close').addEventListener('click', () => { area('notice').hidden = true })
area('key-search').addEventListener('input', renderList)
area('key-new').addEventListener('click', () => openEditor())
area('key-editor').addEventListener('submit', (event) => void saveEditor(/** @type {SubmitEvent} */ (event)))
$('.editor-cancel').addEventListener('click', () => {
  area('key-editor').hidden = true
  editing = undefined
})
area('agent-unlock').addEventListener('click', async () => {
  try {
    await api('POST', '/api/agent/unlock', { ttl_minutes: 15 })
    notify('AI agents can use the vault for 15 minutes', 'success')
    await Promise.all([refreshAgent(), refreshAudit()])
  } catch (error) {
    notify(describe(error), 'error')
  }
})
area('agent-lock').addEventListener('click', async () => {
  try {
    await api('POST', '/api/agent/lock')
    notify('agent access stopped', 'success')
    await Promise.all([refreshAgent(), refreshAudit()])
  } catch (error) {
    notify(describe(error), 'error')
  }
})
area('logout').addEventListener('click', async () => {
  try {
    await api('POST', '/api/logout')
  } finally {
    showClosed()
  }
})
area('login-password').focus()
