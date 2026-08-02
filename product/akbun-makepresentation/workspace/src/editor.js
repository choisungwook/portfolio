'use strict';

// The pure editor model: deck and shape operations plus the SVG markup for a
// shape. No DOM access, so node can test all of it without an app binary.
// renderer.js owns the DOM and calls into here.

const SLIDE_W = 1280;
const SLIDE_H = 720;

const DEFAULT_STYLE = {
  stroke: '#1a1a1a',
  strokeWidth: 2,
  dash: 'solid',
  fill: 'none',
  fontSize: 24,
  textColor: '#1a1a1a',
  // One plain family name, not a CSS stack, so it survives a pptx round trip
  // unchanged. A generic fallback is appended at render time. The list on
  // offer lives in the markup of #prop-font-family, which is also where the
  // display labels belong; anything outside it still opens and renders.
  fontFamily: 'Helvetica',
};

const BOXY = new Set(['rect', 'ellipse', 'text']);

function createDeck() {
  return { slides: [createSlide()] };
}

function createSlide() {
  return { shapes: [] };
}

function createShape(kind, x, y, style) {
  const s = Object.assign({}, DEFAULT_STYLE, style);
  return {
    kind,
    x,
    y,
    w: 0,
    h: 0,
    points: kind === 'pen' ? [[x, y]] : [],
    stroke: s.stroke,
    strokeWidth: s.strokeWidth,
    dash: s.dash,
    fill: s.fill,
    text: '',
    fontSize: s.fontSize,
    textColor: s.textColor,
    fontFamily: s.fontFamily,
  };
}

// Update a shape while the pointer drags from (x0,y0) to (x,y) during
// creation. Boxy shapes normalize so w and h stay positive; lines keep their
// direction; the pen appends points.
//
// `constrain` is the Shift key: boxy shapes become a square or circle, lines
// snap to the nearest 45 degrees. The pen ignores it.
function dragShape(shape, x0, y0, x, y, constrain) {
  if (shape.kind === 'pen') {
    const last = shape.points[shape.points.length - 1];
    if (!last || Math.abs(last[0] - x) + Math.abs(last[1] - y) >= 2) {
      shape.points.push([x, y]);
    }
  } else if (BOXY.has(shape.kind)) {
    let w = x - x0;
    let h = y - y0;
    if (constrain) {
      const size = Math.max(Math.abs(w), Math.abs(h));
      w = w < 0 ? -size : size;
      h = h < 0 ? -size : size;
    }
    shape.x = Math.min(x0, x0 + w);
    shape.y = Math.min(y0, y0 + h);
    shape.w = Math.abs(w);
    shape.h = Math.abs(h);
  } else {
    let w = x - x0;
    let h = y - y0;
    if (constrain) {
      const step = Math.PI / 4;
      const angle = Math.round(Math.atan2(h, w) / step) * step;
      const length = Math.hypot(w, h);
      // Rounding kills the 1e-16 leftovers that would make a "horizontal"
      // line one hair off horizontal.
      w = Math.round(Math.cos(angle) * length * 100) / 100;
      h = Math.round(Math.sin(angle) * length * 100) / 100;
    }
    shape.x = x0;
    shape.y = y0;
    shape.w = w;
    shape.h = h;
  }
}

// True when a just-drawn shape is too small to have been intentional.
function isDegenerate(shape) {
  if (shape.kind === 'pen') return shape.points.length < 2;
  if (BOXY.has(shape.kind)) return shape.w < 4 && shape.h < 4;
  return Math.abs(shape.w) < 4 && Math.abs(shape.h) < 4;
}

function shapeBBox(shape) {
  if (shape.kind === 'pen') {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of shape.points) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y);
      x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    if (x0 === Infinity) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  const x = Math.min(shape.x, shape.x + shape.w);
  const y = Math.min(shape.y, shape.y + shape.h);
  return { x, y, w: Math.abs(shape.w), h: Math.abs(shape.h) };
}

function moveShape(shape, dx, dy) {
  if (shape.kind === 'pen') {
    for (const p of shape.points) {
      p[0] += dx;
      p[1] += dy;
    }
  } else {
    shape.x += dx;
    shape.y += dy;
  }
}

// Which resize handles a shape offers, with their positions.
function handlesFor(shape) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    return [
      { id: 'start', x: shape.x, y: shape.y },
      { id: 'end', x: shape.x + shape.w, y: shape.y + shape.h },
    ];
  }
  const b = shapeBBox(shape);
  return [
    { id: 'nw', x: b.x, y: b.y },
    { id: 'ne', x: b.x + b.w, y: b.y },
    { id: 'se', x: b.x + b.w, y: b.y + b.h },
    { id: 'sw', x: b.x, y: b.y + b.h },
  ];
}

const MIN_SIZE = 8;

// Resize by dragging a handle. `from` is the shape as it was when the drag
// started, so repeated calls with a growing delta do not compound.
function resizeShape(shape, from, handle, dx, dy) {
  if (handle === 'start') {
    shape.x = from.x + dx;
    shape.y = from.y + dy;
    shape.w = from.w - dx;
    shape.h = from.h - dy;
    return;
  }
  if (handle === 'end') {
    shape.w = from.w + dx;
    shape.h = from.h + dy;
    return;
  }

  const b = shapeBBox(from);
  let x0 = b.x, y0 = b.y, x1 = b.x + b.w, y1 = b.y + b.h;
  if (handle.includes('w')) x0 = Math.min(x0 + dx, x1 - MIN_SIZE);
  if (handle.includes('e')) x1 = Math.max(x1 + dx, x0 + MIN_SIZE);
  if (handle.includes('n')) y0 = Math.min(y0 + dy, y1 - MIN_SIZE);
  if (handle.includes('s')) y1 = Math.max(y1 + dy, y0 + MIN_SIZE);

  if (shape.kind === 'pen') {
    const sx = b.w > 0 ? (x1 - x0) / b.w : 1;
    const sy = b.h > 0 ? (y1 - y0) / b.h : 1;
    shape.points = from.points.map(([px, py]) => [
      x0 + (px - b.x) * sx,
      y0 + (py - b.y) * sy,
    ]);
    return;
  }
  shape.x = x0;
  shape.y = y0;
  shape.w = x1 - x0;
  shape.h = y1 - y0;
}

// --- slide operations -------------------------------------------------------

function addSlide(deck, afterIndex) {
  const at = Math.min(afterIndex + 1, deck.slides.length);
  deck.slides.splice(at, 0, createSlide());
  return at;
}

function deleteSlide(deck, index) {
  deck.slides.splice(index, 1);
  if (deck.slides.length === 0) deck.slides.push(createSlide());
  return Math.min(index, deck.slides.length - 1);
}

function duplicateSlide(deck, index) {
  deck.slides.splice(index + 1, 0, structuredClone(deck.slides[index]));
  return index + 1;
}

// The page number as an ordinary text shape rather than a special case, so it
// draws, rasterizes and exports to pptx through the paths that already exist.
function slideNumberShape(number) {
  const shape = createShape('text', SLIDE_W - 110, SLIDE_H - 52, {
    fontSize: 18,
    textColor: '#868e96',
  });
  shape.w = 90;
  shape.h = 24;
  shape.text = String(number);
  return shape;
}

// --- SVG markup --------------------------------------------------------------

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dashArray(shape) {
  const w = shape.strokeWidth;
  if (shape.dash === 'dash') return `${w * 3} ${w * 2}`;
  if (shape.dash === 'dot') return `${w} ${w * 2}`;
  return 'none';
}

function strokeAttrs(shape) {
  if (shape.stroke === 'none') return 'stroke="none"';
  return (
    `stroke="${shape.stroke}" stroke-width="${shape.strokeWidth}"` +
    ` stroke-dasharray="${dashArray(shape)}"`
  );
}

function fontAttr(shape) {
  return `font-family="${escapeXml(shape.fontFamily || 'Helvetica')}, sans-serif"`;
}

// Markup for one shape. `options.hideText` suppresses the glyphs while the
// overlay textarea is editing that shape.
function renderShapeSvg(shape, options) {
  const hideText = options && options.hideText;
  switch (shape.kind) {
    case 'rect': {
      const b = shapeBBox(shape);
      return `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
    }
    case 'ellipse': {
      const b = shapeBBox(shape);
      return `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
    }
    case 'line':
      return `<line x1="${shape.x}" y1="${shape.y}" x2="${shape.x + shape.w}" y2="${shape.y + shape.h}" ${strokeAttrs(shape)} stroke-linecap="round"/>`;
    case 'arrow':
      return arrowSvg(shape);
    case 'pen': {
      const pts = shape.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      return `<polyline points="${pts}" fill="none" ${strokeAttrs(shape)} stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'text': {
      if (hideText) return '';
      const lines = String(shape.text || '').split('\n');
      const spans = lines
        .map(
          (line, i) =>
            `<tspan x="${shape.x}" dy="${i === 0 ? 0 : '1.3em'}">${escapeXml(line) || ' '}</tspan>`
        )
        .join('');
      return `<text x="${shape.x}" y="${shape.y + shape.fontSize}" font-size="${shape.fontSize}" fill="${shape.textColor}" ${fontAttr(shape)}>${spans}</text>`;
    }
    default:
      return '';
  }
}

function arrowSvg(shape) {
  const x1 = shape.x, y1 = shape.y;
  const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
  const length = Math.hypot(shape.w, shape.h) || 1;
  const ux = shape.w / length, uy = shape.h / length;
  const head = Math.max(10, shape.strokeWidth * 4);
  // Shorten the line so it does not poke through the head tip.
  const bx = x2 - ux * head, by = y2 - uy * head;
  const half = head * 0.45;
  const p1 = `${bx - uy * half},${by + ux * half}`;
  const p2 = `${bx + uy * half},${by - ux * half}`;
  return (
    `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" ${strokeAttrs(shape)} stroke-linecap="round"/>` +
    `<polygon points="${x2},${y2} ${p1} ${p2}" fill="${shape.stroke === 'none' ? '#1a1a1a' : shape.stroke}"/>`
  );
}

// A whole slide as standalone SVG markup, used for thumbnails, the
// presentation view, and rasterizing pages for the pdf export.
function renderSlideSvg(slide, options) {
  let shapes = slide.shapes
    .map((shape, i) =>
      renderShapeSvg(shape, {
        hideText: options && options.hideTextIndex === i,
      })
    )
    .join('');
  if (options && options.number) {
    shapes += renderShapeSvg(slideNumberShape(options.number));
  }
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SLIDE_W} ${SLIDE_H}">` +
    `<rect width="${SLIDE_W}" height="${SLIDE_H}" fill="#ffffff"/>${shapes}</svg>`
  );
}

const exported = {
  SLIDE_W,
  SLIDE_H,
  DEFAULT_STYLE,
  createDeck,
  createSlide,
  createShape,
  dragShape,
  isDegenerate,
  shapeBBox,
  moveShape,
  handlesFor,
  resizeShape,
  addSlide,
  deleteSlide,
  duplicateSlide,
  slideNumberShape,
  escapeXml,
  renderShapeSvg,
  renderSlideSvg,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.slidesLib = exported;
}
