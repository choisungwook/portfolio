// Access token for the local API. `taskq run` prints http://127.0.0.1:<port>/#token=<hex>.
// The token is read once from the fragment, kept in sessionStorage for this tab, and the fragment is removed from
// the address bar. It is never put in a link, a log or the DOM.
import { emit } from './bus.js'

const KEY = 'taskq-token'
const SHAPE = /^[0-9a-f]{16,256}$/

let token = null
let lost = false

// Returns true when a token is available for this tab.
export function initToken() {
  const fromHash = new URLSearchParams(location.hash.slice(1)).get('token')
  if (fromHash !== null) {
    try {
      history.replaceState(null, '', `${location.pathname}${location.search}`)
    } catch {
      // Some embedded contexts refuse replaceState. The token is still read below.
    }
  }
  const candidate = fromHash ?? read()
  token = candidate !== null && SHAPE.test(candidate) ? candidate : null
  if (token !== null && fromHash !== null) store(token)
  return token !== null
}

export function getToken() {
  return lost ? null : token
}

export function hasAccess() {
  return getToken() !== null
}

// Called on a missing token or a 401. Forgets the token, then tells the views to stop polling and show the notice.
export function authLost() {
  if (lost) return
  lost = true
  token = null
  forget()
  emit('auth-lost')
}

function read() {
  try {
    return sessionStorage.getItem(KEY)
  } catch {
    return null
  }
}

function store(value) {
  try {
    sessionStorage.setItem(KEY, value)
  } catch {
    // Private windows may refuse storage. The token then lasts only until this page is closed.
  }
}

function forget() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // Nothing to forget when storage is unavailable.
  }
}
