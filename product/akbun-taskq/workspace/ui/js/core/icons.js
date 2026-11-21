// One icon set for the whole UI: 24x24 line icons, 1.8 stroke, round caps, drawn in currentColor. Static markup asks
// for one with data-icon="name" (paintIcons fills it); code calls icon(name). Unicode glyphs are not used as icons.
import { svg } from './dom.js'

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`
const box = (x, y, w, h, r) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`

const PATHS = {
  calendar: [box(3, 4.5, 18, 16.5, 2.5), 'M3 10h18', 'M8 2.5v4', 'M16 2.5v4'],
  board: [box(3, 3, 18, 18, 2.5), 'M9 3v18', 'M15 3v12'],
  wiki: ['M2.5 4.5h6a3.5 3.5 0 0 1 3.5 3.5v12.5a2.5 2.5 0 0 0-2.5-2.5h-7z', 'M21.5 4.5h-6A3.5 3.5 0 0 0 12 8v12.5a2.5 2.5 0 0 1 2.5-2.5h7z'],
  search: [circle(11, 11, 7), 'M20.5 20.5l-4.5-4.5'],
  settings: [
    'M10 4.7l.4-2.8h3.2l.4 2.8 1.8.7 2.2-1.7 2.3 2.3-1.7 2.2.7 1.8 2.8.4v3.2l-2.8.4-.7 1.8 1.7 2.2-2.3 2.3-2.2-1.7-1.8.7-.4 2.8h-3.2l-.4-2.8-1.8-.7-2.2 1.7-2.3-2.3 1.7-2.2-.7-1.8-2.8-.4v-3.2l2.8-.4.7-1.8-1.7-2.2 2.3-2.3 2.2 1.7z',
    circle(12, 12, 3.2),
  ],
  refresh: ['M20.5 12a8.5 8.5 0 1 1-2.5-6l2.5 2.5', 'M20.5 3.5v5h-5'],
  list: ['M8.5 6h12', 'M8.5 12h12', 'M8.5 18h12', 'M3.5 6h.01', 'M3.5 12h.01', 'M3.5 18h.01'],
  details: [box(3, 3.5, 18, 17, 2.5), 'M3 9h18', 'M3 14.5h18', 'M9 9v11.5'],
  grid: [box(3.5, 3.5, 7, 7, 1.5), box(13.5, 3.5, 7, 7, 1.5), box(3.5, 13.5, 7, 7, 1.5), box(13.5, 13.5, 7, 7, 1.5)],
  'arrow-up': ['M12 19V5', 'M5.5 11.5L12 5l6.5 6.5'],
  'arrow-down': ['M12 5v14', 'M18.5 12.5L12 19l-6.5-6.5'],
  close: ['M18 6L6 18', 'M6 6l12 12'],
  check: ['M5 12.5l4.5 4.5L19 7.5'],
  file: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5'],
  files: ['M15 2.5H9a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6.5z', 'M15 2.5v4h4', 'M7 6.5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1'],
  clip: ['M20.5 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9'],
  folder: ['M3 6.5A1.5 1.5 0 0 1 4.5 5h4.4l2 2.2h8.6A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z'],
  slash: [box(3.5, 3.5, 17, 17, 2.5), 'M14.5 8l-5 8'],
  plug: ['M9 3v4', 'M15 3v4', 'M6.5 7h11v4a5.5 5.5 0 0 1-11 0z', 'M12 16.5V21'],
  'chevron-right': ['M9 6l6 6-6 6'],
  globe: [circle(12, 12, 9), 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'],
  plus: ['M12 5v14', 'M5 12h14'],
  'pull-request': [circle(6, 6, 2.2), circle(6, 18, 2.2), circle(18, 18, 2.2), 'M6 8.2v7.6', 'M18 15.8V10a3 3 0 0 0-3-3h-4', 'M13 4.5L10.5 7l2.5 2.5'],
  terminal: [box(3, 4, 18, 16, 2.5), 'M7 9.5l3 2.5-3 2.5', 'M12.5 15h4'],
  done: ['M12 3l9 9-9 9-9-9z', 'M8.5 12l2.5 2.5 4.5-5'],
  minus: ['M5 12h14'],
  fit: ['M4 9V4h5', 'M20 9V4h-5', 'M4 15v5h5', 'M20 15v5h-5'],
}

export function icon(name, size = 18) {
  const node = svg('svg', {
    viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon',
  })
  for (const d of PATHS[name] ?? []) node.append(svg('path', { d }))
  return node
}

export function paintIcons(root = document) {
  for (const node of root.querySelectorAll('[data-icon]')) {
    node.replaceChildren(icon(node.dataset.icon, Number(node.dataset.iconSize ?? 18)))
  }
}
