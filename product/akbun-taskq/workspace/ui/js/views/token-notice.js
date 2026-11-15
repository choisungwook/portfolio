// Full-width notice shown when the page has no token or the server rejected it. Nothing else on the page polls.
import { on } from '../core/bus.js'
import { area } from '../core/dom.js'

export function initTokenNotice() {
  const notice = area('token-notice')
  on('auth-lost', () => {
    notice.hidden = false
  })
}
