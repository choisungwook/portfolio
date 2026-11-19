// The workflow canvas, edited the way n8n edits a workflow:
// - drag a node to move it; drag from a node's right port to another node's left port to make it run after it;
// - click a link to select it, Delete or Backspace removes the selected link or node;
// - drag the empty canvas to pan, Ctrl/Cmd + wheel (or the buttons) to zoom, "Arrange" lays the nodes out by order;
// - a link that would close a loop is refused.
// Read-only mode (a run) draws the same graph colored by step status. Positions are saved on each step.
import { el } from '../core/dom.js'
import { t } from '../core/i18n.js'
import { icon } from '../core/icons.js'

const SVG = 'http://www.w3.org/2000/svg'
const W = 196
const H = 60
const GX = 70
const GY = 26
export const KIND_LABEL = {
  do: ['wf.kind.do', 'Do'], check: ['wf.kind.check', 'Check (needs evidence)'],
  handoff: ['wf.kind.handoff', 'Hand off to a bot'], approval: ['wf.kind.approval', 'User approval'],
}
const KIND_ICON = { do: '▶', check: '✓', handoff: '⇄', approval: '✋' }

// Positions by order (longest chain of needs before a step), for steps saved without one and for "Arrange".
export function layout(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]))
  const depth = new Map()
  const depthOf = (id, seen = new Set()) => {
    if (depth.has(id)) return depth.get(id)
    if (seen.has(id) || !byId.has(id)) return 0
    seen.add(id)
    const d = Math.max(-1, ...byId.get(id).needs.map((n) => depthOf(n, seen))) + 1
    depth.set(id, d)
    return d
  }
  const rows = []
  for (const s of steps) {
    const d = depthOf(s.id)
    rows[d] = (rows[d] ?? 0) + 1
    s.position = { x: 24 + d * (W + GX), y: 24 + (rows[d] - 1) * (H + GY) }
  }
}

function reaches(steps, from, to) {
  // Does `from` (transitively) need `to`? Then `to` needing `from` would close a loop.
  const byId = new Map(steps.map((s) => [s.id, s]))
  const stack = [from]
  const seen = new Set()
  while (stack.length) {
    const id = stack.pop()
    if (id === to) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(byId.get(id)?.needs ?? []))
  }
  return false
}

export function createCanvas({ steps, editable, states = null, onChange = () => {}, onSelect = () => {}, notify = () => {} }) {
  if (steps.some((s) => !s.position)) layout(steps)
  let view = { x: 0, y: 0, zoom: 1 }
  let selected = null          // { type: 'node', id } | { type: 'edge', from, to }
  let drag = null

  const edges = document.createElementNS(SVG, 'svg')
  edges.classList.add('wfc-edges')
  const layer = el('div', { class: 'wfc-layer' }, edges)
  const root = el('div', { class: `wfc${editable ? ' editable' : ''}`, tabindex: 0, 'aria-label': t('wf.canvas', 'Workflow canvas') }, layer)
  const zoomBar = el('div', { class: 'wfc-zoom' },
    el('button', { type: 'button', title: t('wf.zoom_in', 'Zoom in'), 'aria-label': t('wf.zoom_in', 'Zoom in'), onclick: () => zoomBy(1.2) }, icon('plus', 16)),
    el('button', { type: 'button', title: t('wf.zoom_out', 'Zoom out'), 'aria-label': t('wf.zoom_out', 'Zoom out'), onclick: () => zoomBy(1 / 1.2) }, icon('minus', 16)),
    el('button', { type: 'button', title: t('wf.fit', 'Fit'), 'aria-label': t('wf.fit', 'Fit'), onclick: fit }, icon('fit', 16)),
    editable ? el('button', { type: 'button', title: t('wf.arrange', 'Arrange'), text: t('wf.arrange', 'Arrange'), onclick: () => { layout(steps); render(); onChange() } }) : null)
  root.append(zoomBar)

  function apply() {
    layer.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`
  }

  function zoomBy(factor, cx = root.clientWidth / 2, cy = root.clientHeight / 2) {
    const zoom = Math.min(2, Math.max(0.3, view.zoom * factor))
    view = { zoom, x: cx - ((cx - view.x) * zoom) / view.zoom, y: cy - ((cy - view.y) * zoom) / view.zoom }
    apply()
  }

  function fit() {
    if (steps.length === 0) return
    const xs = steps.map((s) => s.position.x)
    const ys = steps.map((s) => s.position.y)
    const w = Math.max(...xs) + W - Math.min(...xs) + 48
    const h = Math.max(...ys) + H - Math.min(...ys) + 48
    const zoom = Math.min(1.1, Math.max(0.6, Math.min((root.clientWidth || 800) / w, (root.clientHeight || 360) / h)))
    view = { zoom, x: (24 - Math.min(...xs)) * zoom, y: (24 - Math.min(...ys)) * zoom }
    apply()
  }

  function point(event) {
    const box = root.getBoundingClientRect()
    return { x: (event.clientX - box.left - view.x) / view.zoom, y: (event.clientY - box.top - view.y) / view.zoom }
  }

  function edgePath(a, b) {
    const x1 = a.x + W
    const y1 = a.y + H / 2
    const x2 = b.x
    const y2 = b.y + H / 2
    const bend = Math.max(40, Math.abs(x2 - x1) / 2)
    return `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
  }

  function renderEdges(pending) {
    edges.replaceChildren()
    const byId = new Map(steps.map((s) => [s.id, s]))
    for (const s of steps) {
      for (const need of s.needs) {
        const from = byId.get(need)
        if (!from) continue
        const path = document.createElementNS(SVG, 'path')
        path.setAttribute('d', edgePath(from.position, s.position))
        path.setAttribute('class', `wfc-edge${selected?.type === 'edge' && selected.from === need && selected.to === s.id ? ' selected' : ''}`)
        if (editable) {
          const hit = document.createElementNS(SVG, 'path')
          hit.setAttribute('d', edgePath(from.position, s.position))
          hit.setAttribute('class', 'wfc-edge-hit')
          hit.addEventListener('pointerdown', (event) => {
            event.stopPropagation()
            select({ type: 'edge', from: need, to: s.id })
          })
          edges.append(path, hit)
        } else {
          edges.append(path)
        }
      }
    }
    if (pending) {
      const path = document.createElementNS(SVG, 'path')
      const from = byId.get(pending.from).position
      const x1 = from.x + W
      const y1 = from.y + H / 2
      path.setAttribute('d', `M${x1},${y1} C${x1 + 60},${y1} ${pending.x - 60},${pending.y} ${pending.x},${pending.y}`)
      path.setAttribute('class', 'wfc-edge pending')
      edges.append(path)
    }
  }

  function node(step) {
    const state = states?.get(step.id)
    const box = el('div', {
      class: `wfc-node${selected?.type === 'node' && selected.id === step.id ? ' selected' : ''}`,
      dataset: { kind: step.kind, status: state ?? 'none', id: step.id }, tabindex: 0,
      style: { left: `${step.position.x}px`, top: `${step.position.y}px`, width: `${W}px`, height: `${H}px` },
      'aria-label': `${step.name || step.id}, ${t(...KIND_LABEL[step.kind])}${state ? `, ${state}` : ''}`,
    },
    el('span', { class: 'wfc-icon', text: KIND_ICON[step.kind] }),
    el('span', { class: 'wfc-text' },
      el('strong', { text: step.name || step.id }),
      el('small', { text: state ? t(`wf.status.${state}`, state) : `${t(...KIND_LABEL[step.kind])}${step.to ? ` → ${step.to}` : ''}` })),
    editable ? el('span', { class: 'wfc-port in', title: t('wf.port_in', 'Drop a link here') }) : null,
    editable ? el('span', { class: 'wfc-port out', title: t('wf.port_out', 'Drag to the next step') }) : null)
    box.addEventListener('pointerdown', (event) => {
      event.stopPropagation()
      select({ type: 'node', id: step.id })
      if (!editable) return
      const p = point(event)
      if (event.target.classList.contains('wfc-port') && event.target.classList.contains('out')) {
        drag = { type: 'link', from: step.id }
      } else {
        drag = { type: 'node', id: step.id, dx: p.x - step.position.x, dy: p.y - step.position.y, moved: false }
      }
      root.setPointerCapture(event.pointerId)
    })
    box.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') select({ type: 'node', id: step.id })
    })
    return box
  }

  function render(pending = null) {
    layer.replaceChildren(edges, ...steps.map(node))
    renderEdges(pending)
    apply()
  }

  function select(next) {
    selected = next
    render()
    onSelect(next)
  }

  function removeSelected() {
    if (!editable || !selected) return
    if (selected.type === 'edge') {
      const target = steps.find((s) => s.id === selected.to)
      if (target) target.needs = target.needs.filter((n) => n !== selected.from)
    } else {
      const index = steps.findIndex((s) => s.id === selected.id)
      if (index >= 0) steps.splice(index, 1)
      for (const s of steps) s.needs = s.needs.filter((n) => n !== selected.id)
    }
    selected = null
    render()
    onSelect(null)
    onChange()
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return
    drag = { type: 'pan', x: event.clientX - view.x, y: event.clientY - view.y }
    if (selected) select(null)
    root.setPointerCapture(event.pointerId)
  })
  root.addEventListener('pointermove', (event) => {
    if (!drag) return
    if (drag.type === 'pan') {
      view = { ...view, x: event.clientX - drag.x, y: event.clientY - drag.y }
      apply()
    } else if (drag.type === 'node') {
      const p = point(event)
      const step = steps.find((s) => s.id === drag.id)
      step.position = { x: Math.round(p.x - drag.dx), y: Math.round(p.y - drag.dy) }
      drag.moved = true
      const box = layer.querySelector(`.wfc-node[data-id="${CSS.escape(step.id)}"]`)
      if (box) {
        box.style.left = `${step.position.x}px`
        box.style.top = `${step.position.y}px`
      }
      renderEdges()
    } else if (drag.type === 'link') {
      renderEdges({ from: drag.from, ...point(event) })
    }
  })
  root.addEventListener('pointerup', (event) => {
    if (drag?.type === 'node' && drag.moved) onChange()
    if (drag?.type === 'link') {
      const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.wfc-node')
      const to = target?.dataset.id
      const step = steps.find((s) => s.id === to)
      if (step && to !== drag.from && !step.needs.includes(drag.from)) {
        if (reaches(steps, drag.from, to)) notify(t('wf.loop', 'That link would make a loop'), true)
        else {
          step.needs.push(drag.from)
          onChange()
        }
      }
      render()
    }
    drag = null
  })
  root.addEventListener('wheel', (event) => {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const box = root.getBoundingClientRect()
    zoomBy(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - box.left, event.clientY - box.top)
  }, { passive: false })
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Delete' && event.key !== 'Backspace') return
    if (event.target.closest?.('input, textarea, select')) return
    event.preventDefault()
    removeSelected()
  })

  render()
  requestAnimationFrame(fit)

  return {
    element: root,
    render,
    select,
    removeSelected,
    // A new step placed in the middle of what is in view.
    add(step) {
      const cx = (root.clientWidth / 2 - view.x) / view.zoom - W / 2
      const cy = (root.clientHeight / 2 - view.y) / view.zoom - H / 2
      step.position = { x: Math.round(cx + (steps.length % 3) * 16), y: Math.round(cy + (steps.length % 3) * 16) }
      steps.push(step)
      select({ type: 'node', id: step.id })
      onChange()
    },
  }
}
