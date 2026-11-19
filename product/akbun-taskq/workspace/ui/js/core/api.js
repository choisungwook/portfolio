// Thin fetch wrapper. Every request carries the token. Mutations send application/json with a JSON body ({} when empty).
import { requestRefresh } from './refresh.js'
import { area, el } from './dom.js'
import { icon } from './icons.js'
import { authLost, getToken } from './token.js'

const NO_TOKEN = 'Open the URL printed by taskq run to continue.'

// status is the HTTP status, 0 when the server cannot be reached.
export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

async function request(method, path, body) {
  const token = getToken()
  if (token === null) {
    authLost()
    throw new ApiError(NO_TOKEN, 401)
  }
  const init = { method, headers: { 'x-taskq-token': token } }
  if (method !== 'GET') {
    init.headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body ?? {})
  }
  let res
  try {
    res = await fetch(`/api${path}`, init)
  } catch {
    throw new ApiError('server not reachable')
  }
  if (res.status === 401) {
    authLost()
    throw new ApiError(NO_TOKEN, 401)
  }
  const text = await res.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = null
  }
  if (!res.ok) throw new ApiError(data?.error ?? `HTTP ${res.status}`, res.status)
  return data
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body ?? {}),
  patch: (path, body) => request('PATCH', path, body ?? {}),
  put: (path, body) => request('PUT', path, body ?? {}),
  // A file download: same token header, body returned as a Blob.
  blob: async (path) => {
    const token = getToken()
    const res = await fetch(`/api${path}`, { headers: { 'x-taskq-token': token ?? '' } })
    if (!res.ok) throw new ApiError(`HTTP ${res.status}`, res.status)
    return res.blob()
  },
  del: (path, body) => request('DELETE', path, body ?? {}),
  // A plain-text answer (a diff): same token header, the body as a string, the error text on failure.
  text: async (path) => {
    const res = await fetch(`/api${path}`, { headers: { 'x-taskq-token': getToken() ?? '' } })
    const text = await res.text()
    if (!res.ok) {
      let message = `HTTP ${res.status}`
      try { message = JSON.parse(text).error ?? message } catch { /* not JSON */ }
      throw new ApiError(message, res.status)
    }
    return text
  },
}

// Builds ?a=1&b=2 and skips empty values.
export function qs(params) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

// Toast notification (Carbon): it stays until the user closes it or the next message replaces it, never on a timer.
// Only the text is a live region, so a screen reader reads the message and not the close button.
// Closing returns focus to the control that caused the message, or to the main region when a refresh replaced it.
export function notify(message, isError = false) {
  const node = area('notice')
  const origin = document.activeElement
  node.querySelector('.notice-text').textContent = message
  node.dataset.kind = isError ? 'error' : 'ok'
  node.querySelector('.notice-close')?.remove()
  const close = el('button', { type: 'button', class: 'notice-close', 'aria-label': 'Close notification' }, icon('close', 16))
  close.addEventListener('click', () => {
    node.querySelector('.notice-text').textContent = ''
    delete node.dataset.kind
    close.remove()
    const target = origin instanceof HTMLElement && origin.isConnected && origin !== document.body ? origin : document.querySelector('main')
    target?.focus()
  })
  node.append(close)
}

// Runs a mutation, shows the server's error message on failure, and refreshes views on success.
export async function mutate(fn, okMessage = '') {
  try {
    const result = await fn()
    if (okMessage) notify(okMessage)
    requestRefresh()
    return result
  } catch (error) {
    notify(error instanceof Error ? error.message : String(error), true)
    return undefined
  }
}
