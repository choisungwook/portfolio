// Line and filled icons on a 24 px grid, drawn in currentColor.
// Markup asks with data-icon="name"; paintIcons fills them. setIcon swaps one (play and pause).

const PATHS: Record<string, { stroke?: string[]; fill?: string[] }> = {
  // Play and pause are filled shapes: they are the one control the eye looks for.
  play: { fill: ['M8 5.2v13.6a.8.8 0 0 0 1.2.7l11-6.8a.8.8 0 0 0 0-1.4l-11-6.8A.8.8 0 0 0 8 5.2z'] },
  pause: { fill: ['M6.5 5h3.5a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5H6.5a.5.5 0 0 1-.5-.5v-13a.5.5 0 0 1 .5-.5z', 'M14 5h3.5a.5.5 0 0 1 .5.5v13a.5.5 0 0 1-.5.5H14a.5.5 0 0 1-.5-.5v-13A.5.5 0 0 1 14 5z'] },
  repeat: { stroke: ['M4 11V9a3 3 0 0 1 3-3h13', 'M17 3l3 3-3 3', 'M20 13v2a3 3 0 0 1-3 3H4', 'M7 21l-3-3 3-3'] },
  metronome: { stroke: ['M9 3.5h6l4.5 17h-15z', 'M12 15.5l5-10', 'M6.5 15.5h11'] },
  keys: { stroke: ['M2.5 6h19v12h-19z', 'M7 6v12', 'M12 6v12', 'M17 6v12', 'M5.5 6v6.5h3V6', 'M15.5 6v6.5h3V6'] },
  hand: {
    stroke: [
      'M8 13V5.5a1.5 1.5 0 0 1 3 0V11', 'M11 10.5V4a1.5 1.5 0 0 1 3 0v6.5', 'M14 10.5V5.5a1.5 1.5 0 0 1 3 0V12',
      'M17 8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.5a6 6 0 0 1-4.6-2.2L3.6 15.1a1.6 1.6 0 0 1 2.4-2.1L8 15',
    ],
  },
}

const NS = 'http://www.w3.org/2000/svg'

export function icon(name: string, size = 20): SVGSVGElement {
  const svg = document.createElementNS(NS, 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('width', String(size))
  svg.setAttribute('height', String(size))
  svg.setAttribute('aria-hidden', 'true')
  svg.classList.add('icon')
  const spec = PATHS[name] ?? {}
  for (const d of spec.stroke ?? []) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.8')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    svg.append(path)
  }
  for (const d of spec.fill ?? []) {
    const path = document.createElementNS(NS, 'path')
    path.setAttribute('d', d)
    path.setAttribute('fill', 'currentColor')
    svg.append(path)
  }
  return svg
}

export function setIcon(element: Element, name: string): void {
  const size = Number(element.getAttribute('data-icon-size') ?? 20)
  element.querySelector(':scope > .icon')?.remove()
  element.prepend(icon(name, size))
}

export function paintIcons(root: ParentNode = document): void {
  for (const element of root.querySelectorAll('[data-icon]')) setIcon(element, element.getAttribute('data-icon')!)
}
