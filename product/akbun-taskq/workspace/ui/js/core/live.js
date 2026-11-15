// Subscribes to the SSE stream. EventSource cannot send headers, so the token rides in the query.
// Falls back to a 5 s poll while the stream is down. Stops both when the token is lost.
import { on } from './bus.js'
import { requestRefresh } from './refresh.js'
import { getToken } from './token.js'

const POLL_MS = 5000

export function startLive() {
  const token = getToken()
  if (token === null) return
  let poll = null
  let stream = null
  const stopPoll = () => {
    if (poll !== null) clearInterval(poll)
    poll = null
  }
  const startPoll = () => {
    if (poll === null) poll = setInterval(requestRefresh, POLL_MS)
  }
  if (!('EventSource' in window)) {
    startPoll()
  } else {
    stream = new EventSource(`/api/events/stream?token=${encodeURIComponent(token)}`)
    stream.addEventListener('event', requestRefresh)
    stream.onopen = stopPoll
    stream.onerror = startPoll
  }
  on('auth-lost', () => {
    stopPoll()
    if (stream !== null) stream.close()
  })
}
