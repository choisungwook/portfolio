// Bot avatars: a plain colored circle with the bot's initial. A bot keeps its color by its place in the roster, so the
// same bot looks the same in the sidebar, the chat and the discussions. The orchestrator taskq is the light circle.
import { el } from '../core/dom.js'

const order = new Map()

// The sidebar calls this with the roster so every view numbers bots the same way.
export function setRoster(names) {
  order.clear()
  names.forEach((name, i) => {
    order.set(name, i)
  })
}

function colorOf(name) {
  if (name === 'taskq' || name === 'user') return 'var(--avatar-user)'
  if (name === 'queue') return 'var(--stale)'
  let i = order.get(name)
  if (i === undefined) {
    i = 0
    for (const char of name) i = (i * 31 + char.charCodeAt(0)) >>> 0
  }
  return `var(--avatar-${(i % 6) + 1})`
}

function circle(name, label, size) {
  return el('span', {
    class: 'avatar', 'aria-hidden': 'true', dataset: { who: name },
    style: { width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * 0.42)}px`, background: colorOf(name) },
  }, label)
}

// The agent SDK a bot runs on, as a small mark at the avatar's lower right.
const SDK_MARKS = {
  claude: { text: '✻', title: 'Claude Agent SDK' }, openai: { text: '◎', title: 'OpenAI' }, kiro: { text: 'K', title: 'Kiro (AWS)' },
}

export function botAvatar(name, size = 40, sdk = null) {
  const face = circle(name, name.slice(0, 1).toUpperCase(), size)
  const mark = sdk ? SDK_MARKS[sdk] : null
  if (!mark) return face
  return el('span', { class: 'avatar-wrap', title: mark.title },
    face,
    el('span', { class: 'sdk-badge', dataset: { sdk }, 'aria-label': mark.title, style: { width: `${Math.round(size * 0.42)}px`, height: `${Math.round(size * 0.42)}px`, fontSize: `${Math.round(size * 0.28)}px` } }, mark.text))
}

export function userAvatar(size = 40) {
  return circle('user', 'me', size)
}

// Any sender: the user, the queue reporting a task, or a bot.
export function senderAvatar(name, size = 28) {
  if (name === 'user') return userAvatar(size)
  if (name === 'queue') return circle('queue', 'Q', size)
  return botAvatar(name, size)
}
