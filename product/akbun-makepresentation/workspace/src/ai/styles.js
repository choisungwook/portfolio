'use strict';

// Diagram look is two independent choices: where the boxes go, and what colour
// they are. Keeping them apart means eight palettes times six layouts instead
// of forty-eight presets nobody can name, and "redraw this in Ocean" stays one
// dropdown away from "redraw this as a left-to-right flow".
//
// Every colour here is a literal #rrggbb because that is the only form the
// slide output schema accepts. A palette that resolves to a CSS variable or a
// named colour is rejected by the parser, not by the renderer, so the failure
// would show up as an unexplained "invalid response".
(function registerAiStyles(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationAiStyles = api;
})(globalThis, function createAiStyles() {

const PALETTES = Object.freeze([
  {
    id: 'slate-amber',
    label: 'Slate & Amber',
    background: '#ffffff',
    surface: '#f1f5f9',
    surfaceAlt: '#e2e8f0',
    border: '#475569',
    accent: '#f59e0b',
    connector: '#64748b',
    text: '#0f172a',
    textOnAccent: '#1c1917',
    muted: '#64748b',
  },
  {
    id: 'ocean',
    label: 'Ocean',
    background: '#f8fafc',
    surface: '#e0f2fe',
    surfaceAlt: '#bae6fd',
    border: '#0369a1',
    accent: '#0891b2',
    connector: '#0284c7',
    text: '#0c4a6e',
    textOnAccent: '#ffffff',
    muted: '#0369a1',
  },
  {
    id: 'forest',
    label: 'Forest',
    background: '#ffffff',
    surface: '#ecfdf5',
    surfaceAlt: '#d1fae5',
    border: '#047857',
    accent: '#65a30d',
    connector: '#059669',
    text: '#064e3b',
    textOnAccent: '#ffffff',
    muted: '#047857',
  },
  {
    id: 'sunset',
    label: 'Sunset',
    background: '#fffbeb',
    surface: '#ffedd5',
    surfaceAlt: '#fed7aa',
    border: '#c2410c',
    accent: '#7c3aed',
    connector: '#ea580c',
    text: '#7c2d12',
    textOnAccent: '#ffffff',
    muted: '#9a3412',
  },
  {
    id: 'mono',
    label: 'Monochrome',
    background: '#ffffff',
    surface: '#f4f4f5',
    surfaceAlt: '#e4e4e7',
    border: '#18181b',
    accent: '#18181b',
    connector: '#52525b',
    text: '#18181b',
    textOnAccent: '#ffffff',
    muted: '#71717a',
  },
  {
    id: 'berry',
    label: 'Berry',
    background: '#fdf4ff',
    surface: '#fae8ff',
    surfaceAlt: '#f5d0fe',
    border: '#86198f',
    accent: '#db2777',
    connector: '#a21caf',
    text: '#4a044e',
    textOnAccent: '#ffffff',
    muted: '#86198f',
  },
  {
    id: 'terracotta',
    label: 'Terracotta',
    background: '#fdfaf6',
    surface: '#f5ece3',
    surfaceAlt: '#e7d3c1',
    border: '#9a5b3d',
    accent: '#6b7f4b',
    connector: '#a97155',
    text: '#43302b',
    textOnAccent: '#ffffff',
    muted: '#8a6a58',
  },
  {
    id: 'cloud',
    label: 'Cloud Neutral',
    background: '#ffffff',
    surface: '#f2f5f9',
    surfaceAlt: '#e6ebf2',
    border: '#232f3e',
    accent: '#ff9900',
    connector: '#566573',
    text: '#232f3e',
    textOnAccent: '#232f3e',
    muted: '#566573',
  },
  {
    id: 'midnight',
    label: 'Midnight',
    background: '#0f172a',
    surface: '#1e293b',
    surfaceAlt: '#334155',
    border: '#38bdf8',
    accent: '#22d3ee',
    connector: '#7dd3fc',
    text: '#e2e8f0',
    textOnAccent: '#0f172a',
    muted: '#94a3b8',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    background: '#0b2545',
    surface: '#13315c',
    surfaceAlt: '#1c4a7d',
    border: '#8ecae6',
    accent: '#ffb703',
    connector: '#a8dadc',
    text: '#eaf4fc',
    textOnAccent: '#0b2545',
    muted: '#8ecae6',
  },
].map(Object.freeze));

const LAYOUTS = Object.freeze([
  {
    id: 'layered',
    label: 'Layered tiers',
    summary: 'Horizontal tiers stacked top to bottom, each tier a row of equal boxes.',
    rules: (zone) => {
      const rows = 3;
      const gap = Math.round(zone.height * 0.08);
      const rowHeight = Math.round((zone.height - gap * (rows - 1)) / rows);
      return [
        `Stack ${rows} horizontal tiers inside the content zone, top to bottom.`,
        `Each tier is ${rowHeight} px tall with a ${gap} px gap between tiers.`,
        `Tier ${1} top y=${zone.y}, tier 2 top y=${zone.y + rowHeight + gap}, tier 3 top y=${zone.y + (rowHeight + gap) * 2}.`,
        'Put a left-aligned tier label text shape outside the boxes, at the left margin.',
        'Boxes inside one tier share the same y and h and are spread evenly across the content width.',
        'Arrows run vertically between tiers only, from the bottom edge of one box to the top edge of the box below.',
      ];
    },
  },
  {
    id: 'flow',
    label: 'Left to right flow',
    summary: 'A pipeline of steps reading left to right, joined by horizontal arrows.',
    rules: (zone) => {
      const steps = 4;
      const gap = Math.round(zone.width * 0.05);
      const boxWidth = Math.round((zone.width - gap * (steps - 1)) / steps);
      const boxHeight = Math.round(zone.height * 0.34);
      const top = Math.round(zone.y + (zone.height - boxHeight) / 2);
      return [
        `Lay out up to ${steps} steps in one row, reading left to right.`,
        `Each box is ${boxWidth} px wide and ${boxHeight} px tall, at y=${top}, with a ${gap} px gap.`,
        `First box x=${zone.x}; each following box starts ${boxWidth + gap} px further right.`,
        'Every box on the row shares the same y and h. Do not stagger them.',
        'Join consecutive boxes with a horizontal arrow that starts on the right edge of one box and ends on the left edge of the next, at the shared vertical centre.',
        'If a step needs a caption, add a text shape directly under its box, same x and w.',
      ];
    },
  },
  {
    id: 'hub',
    label: 'Hub and spokes',
    summary: 'One central component with satellites around it.',
    rules: (zone) => {
      const hubWidth = Math.round(zone.width * 0.26);
      const hubHeight = Math.round(zone.height * 0.26);
      const centerX = Math.round(zone.x + zone.width / 2);
      const centerY = Math.round(zone.y + zone.height / 2);
      const satelliteWidth = Math.round(zone.width * 0.19);
      const satelliteHeight = Math.round(zone.height * 0.2);
      return [
        `Place the central component at x=${centerX - Math.round(hubWidth / 2)}, y=${centerY - Math.round(hubHeight / 2)}, w=${hubWidth}, h=${hubHeight}.`,
        `Satellites are ${satelliteWidth} px by ${satelliteHeight} px.`,
        'Put satellites in the four corners and, if more are needed, at the midpoints of the top and bottom edges of the content zone.',
        'Every satellite is the same size. Distance from the hub is the same for every satellite on the same side.',
        'One arrow per satellite, pointing at the nearest hub edge. Arrows never cross another box.',
        'The hub uses the accent colour; satellites use the surface colour.',
      ];
    },
  },
  {
    id: 'grouped',
    label: 'Grouped containers',
    summary: 'Boundary boxes (VPC, account, region) holding smaller components.',
    rules: (zone) => {
      const groups = 2;
      const gap = Math.round(zone.width * 0.04);
      const groupWidth = Math.round((zone.width - gap * (groups - 1)) / groups);
      const padding = Math.round(zone.height * 0.09);
      return [
        `Draw ${groups} boundary rectangles side by side, each ${groupWidth} px wide, spanning the full content height from y=${zone.y}.`,
        `First boundary x=${zone.x}, second boundary x=${zone.x + groupWidth + gap}.`,
        `Boundaries use a dashed stroke, fill none, and a text label placed inside the top-left corner with a ${padding} px inset.`,
        `Components sit inside their boundary with at least ${padding} px of padding on every side, and never overlap the boundary edge.`,
        'Components inside one boundary are the same width and are stacked vertically with even gaps.',
        'Arrows may cross a boundary edge, but only a boundary edge, never another component.',
      ];
    },
  },
  {
    id: 'sequence',
    label: 'Numbered steps',
    summary: 'Numbered stages with a caption under each, for a process explained in order.',
    rules: (zone) => {
      const steps = 4;
      const gap = Math.round(zone.width * 0.045);
      const columnWidth = Math.round((zone.width - gap * (steps - 1)) / steps);
      const badge = Math.round(Math.min(columnWidth, zone.height) * 0.3);
      return [
        `Lay out up to ${steps} numbered columns, each ${columnWidth} px wide, first column x=${zone.x}.`,
        `Each column starts with an ellipse badge ${badge} px square holding the step number, horizontally centred in the column at y=${zone.y}.`,
        'Under the badge put a bold heading text shape, and under that a caption text shape. Both span the full column width.',
        'Badges use the accent colour with textOnAccent text. Headings and captions use the text colour.',
        `Join badges with a horizontal arrow at the badge's vertical centre, y=${zone.y + Math.round(badge / 2)}.`,
        'Every column shares the same y positions for badge, heading and caption.',
      ];
    },
  },
  {
    id: 'matrix',
    label: 'Comparison grid',
    summary: 'A grid of cells for comparing options against criteria.',
    rules: (zone) => {
      const columns = 3;
      const rows = 3;
      const gap = Math.round(Math.min(zone.width, zone.height) * 0.03);
      const cellWidth = Math.round((zone.width - gap * (columns - 1)) / columns);
      const cellHeight = Math.round((zone.height - gap * (rows - 1)) / rows);
      return [
        `Draw a ${columns} by ${rows} grid of rectangles, each ${cellWidth} px by ${cellHeight} px, with a ${gap} px gutter.`,
        `Cell (column c, row r) is at x=${zone.x} + c*${cellWidth + gap}, y=${zone.y} + r*${cellHeight + gap}, with c and r counted from 0.`,
        'The top row and the left column are headers: use the surfaceAlt colour and bold text.',
        'Body cells use the surface colour and regular text, centred both ways.',
        'Do not draw arrows in this layout.',
      ];
    },
  },
].map(Object.freeze));

const DEFAULT_PALETTE_ID = PALETTES[0].id;
const DEFAULT_LAYOUT_ID = LAYOUTS[0].id;

function palette(id) {
  return PALETTES.find((item) => item.id === id) || PALETTES[0];
}

function layout(id) {
  return LAYOUTS.find((item) => item.id === id) || LAYOUTS[0];
}

// The zone the diagram may occupy. Callers pass the guideline content zone when
// guidelines are configured; otherwise a 6% inset of the whole canvas, which is
// close enough to the default guidelines to look deliberate either way.
function diagramZone(size, geometry) {
  const width = Math.max(1, Math.round(Number(size?.width) || 0));
  const height = Math.max(1, Math.round(Number(size?.height) || 0));
  if (geometry && Number.isFinite(geometry.contentHeight) && geometry.contentHeight > 1) {
    return {
      x: Math.round(geometry.x),
      y: Math.round(geometry.contentY),
      width: Math.round(geometry.width),
      height: Math.round(geometry.contentHeight),
    };
  }
  const inset = Math.round(Math.min(width, height) * 0.06);
  return {
    x: inset,
    y: inset,
    width: Math.max(1, width - inset * 2),
    height: Math.max(1, height - inset * 2),
  };
}

function paletteLines(value) {
  return [
    `Palette "${value.label}". Use these colours and no others:`,
    `- slide background: ${value.background}`,
    `- component box fill: ${value.surface}, secondary box fill: ${value.surfaceAlt}`,
    `- box stroke: ${value.border}`,
    `- emphasis fill: ${value.accent}, text on emphasis: ${value.textOnAccent}`,
    `- arrows and lines: ${value.connector}`,
    `- body text: ${value.text}, secondary text: ${value.muted}`,
  ];
}

function layoutLines(value, zone) {
  return [`Layout "${value.label}". ${value.summary}`, ...value.rules(zone).map((line) => `- ${line}`)];
}

return {
  PALETTES,
  LAYOUTS,
  DEFAULT_PALETTE_ID,
  DEFAULT_LAYOUT_ID,
  palette,
  layout,
  diagramZone,
  paletteLines,
  layoutLines,
};
});
