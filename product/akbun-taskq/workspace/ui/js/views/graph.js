// Graph tab: tasks as nodes, deps as edges, laid out in dependency layers in an inline SVG.
import { api } from '../core/api.js'
import { area, clear, el, svg } from '../core/dom.js'
import { emit, on } from '../core/bus.js'
import { label } from '../core/vocab.js'
import { layerTasks } from '../pure/graph-layers.js'

const COL_W = 200
const ROW_H = 72
const NODE_W = 170
const NODE_H = 52
const PAD = 20
// Statuses that need a person, or failed: drawn with a thick outline as well as their label.
// A node with stale runs (and not done) is emphasized too.
const EMPHASIS = new Set(['failed', 'needs_approval', 'needs_auth'])

let host
let active = false

export function initGraph() {
  host = area('graph-canvas')
  on('tab', (name) => {
    active = name === 'graph'
    if (active) load()
  })
  on('refresh', () => {
    if (active) load()
  })
}

async function load() {
  try {
    const graph = await api.get('/graph')
    const { layers } = layerTasks(graph.tasks, graph.deps)
    clear(host).append(draw(graph, layers))
  } catch (error) {
    clear(host).append(el('p', { class: 'error', text: error.message }))
  }
}

function draw({ tasks, deps }, layers) {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const pos = new Map()
  layers.forEach((ids, col) => {
    ids.forEach((id, row) => {
      pos.set(id, { x: PAD + col * COL_W, y: PAD + row * ROW_H })
    })
  })
  const width = PAD * 2 + Math.max(1, layers.length) * COL_W
  const height = PAD * 2 + Math.max(1, ...layers.map((ids) => ids.length)) * ROW_H

  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, width, height, role: 'img', 'aria-label': 'Task dependency graph' })
  const defs = svg('defs')
  const marker = svg('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: 10, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto-start-reverse' })
  marker.append(svg('path', { d: 'M0,0 L10,5 L0,10 z', class: 'arrow-head' }))
  defs.append(marker)
  root.append(defs)

  for (const dep of deps) {
    const from = pos.get(dep.depends_on)
    const to = pos.get(dep.task_id)
    if (!from || !to) continue
    const x1 = from.x + NODE_W
    const y1 = from.y + NODE_H / 2
    const x2 = to.x
    const y2 = to.y + NODE_H / 2
    const mid = (x1 + x2) / 2
    root.append(svg('path', {
      d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`,
      class: `edge edge-${dep.kind}`,
      'marker-end': 'url(#arrow)',
    }))
  }

  for (const [id, p] of pos) root.append(node(byId.get(id), p))
  return el('div', { class: 'graph-wrap' }, root)
}

function node(task, p) {
  const title = task.title ?? ''
  const short = title.length > 24 ? `${title.slice(0, 23)}…` : title
  const stale = task.stale_count > 0 && task.status !== 'done'
  const emphasized = EMPHASIS.has(task.status) || stale
  const group = svg('g', {
    class: `node status-${task.status}${emphasized ? ' emphasis' : ''}`,
    role: 'button',
    tabindex: 0,
    'aria-label': `${title}, ${label(task.status)}${task.blocked ? ', blocked' : ''}${stale ? ', stale runs' : ''}`,
    transform: `translate(${p.x},${p.y})`,
  })
  group.addEventListener('click', () => emit('open-task', task.id))
  group.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      emit('open-task', task.id)
    }
  })
  const rect = svg('rect', { width: NODE_W, height: NODE_H, rx: 6, class: 'node-box' })
  const text1 = svg('text', { x: 10, y: 21, class: 'node-title' })
  text1.textContent = short
  const text2 = svg('text', { x: 10, y: 40, class: 'node-status' })
  text2.textContent = `${label(task.status)}${task.blocked ? ' · blocked' : ''}`
  const tip = svg('title')
  tip.textContent = task.stale_count ? `${title} (stale runs: ${task.stale_count})` : title
  group.append(rect, text1, text2, tip)
  return group
}
