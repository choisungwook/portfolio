// Bot avatars: a colored shape with two eyes. A bot keeps its shape and color by its place in the roster, so the same
// bot looks the same in the sidebar, the chat and the Board. The user's own avatar is a white circle.
import { svg } from '../core/dom.js'

const SHAPES = [
  (fill) => svg('rect', { x: 9, y: 9, width: 46, height: 46, rx: 15, fill, transform: 'rotate(-14 32 32)' }),
  (fill) => svg('path', { fill, d: 'M17 50c-8 0-12-7-9-14 2-5 7-7 11-6 1-8 8-13 16-12 7 1 11 6 12 11 7-1 13 4 13 11 0 6-5 10-11 10z' }),
  (fill) => svg('rect', { x: 4, y: 17, width: 56, height: 32, rx: 16, fill, transform: 'rotate(-10 32 32)' }),
  (fill) => svg('path', { fill, d: 'M47 50c8 0 12-7 9-14-2-5-7-7-11-6-1-8-8-13-16-12-7 1-11 6-12 11-7-1-13 4-13 11 0 6 5 10 11 10z' }),
  (fill) => svg('rect', { x: 10, y: 10, width: 44, height: 44, rx: 10, fill, transform: 'rotate(-28 32 32)' }),
  (fill) => svg('circle', { cx: 32, cy: 33, r: 25, fill }),
]

const order = new Map()

// The sidebar calls this with the roster so every view numbers bots the same way.
export function setRoster(names) {
  order.clear()
  names.forEach((name, i) => order.set(name, i))
}

function indexOf(name) {
  if (order.has(name)) return order.get(name)
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return hash
}

function eyes(root, tilt) {
  for (const x of [25, 37]) {
    root.append(svg('line', {
      x1: x - tilt, y1: 26, x2: x + tilt, y2: 35, stroke: 'var(--avatar-eye)', 'stroke-width': 5, 'stroke-linecap': 'round',
    }))
  }
}

export function botAvatar(name, size = 40) {
  const i = indexOf(name)
  const root = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'avatar', 'aria-hidden': 'true' })
  root.append(SHAPES[i % SHAPES.length](`var(--avatar-${(i % 6) + 1})`))
  eyes(root, 1.5)
  return root
}

export function userAvatar(size = 40) {
  const root = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'avatar', 'aria-hidden': 'true' })
  root.append(svg('circle', { cx: 32, cy: 32, r: 28, fill: 'var(--avatar-user)' }))
  for (const x of [27, 40]) {
    root.append(svg('line', { x1: x - 3, y1: 22, x2: x + 3, y2: 32, stroke: 'var(--avatar-eye)', 'stroke-width': 5.5, 'stroke-linecap': 'round' }))
  }
  return root
}

// A non-bot sender: the user, or taskq itself reporting a task.
export function senderAvatar(name, size = 28) {
  if (name === 'user') return userAvatar(size)
  if (name === 'taskq') {
    const root = svg('svg', { viewBox: '0 0 64 64', width: size, height: size, class: 'avatar', 'aria-hidden': 'true' })
    root.append(svg('rect', { x: 8, y: 8, width: 48, height: 48, rx: 12, fill: 'var(--stale)' }))
    eyes(root, 0)
    return root
  }
  return botAvatar(name, size)
}
