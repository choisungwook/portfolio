'use strict';

// The pure editor model: deck and shape operations plus the SVG markup for a
// shape. No DOM access, so node can test all of it without an app binary.
// renderer.js owns the DOM and calls into here.

const SLIDE_W = 1280;
const SLIDE_H = 720;

// Paper white. A slide keeps its own background so changing it touches that
// one field and nothing else on the slide.
const DEFAULT_BACKGROUND = '#ffffff';

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
  bold: false,
  italic: false,
  underline: false,
  textAlign: 'left',
  verticalAlign: 'top',
};

const BOXY = new Set(['rect', 'ellipse', 'text', 'image']);
const SHAPE_KINDS = new Set(['rect', 'ellipse', 'line', 'arrow', 'pen', 'text', 'image']);
const MAX_CLIPBOARD_SHAPES = 100;
const MAX_GEOMETRY = 1_000_000;

function createDeck() {
  return { slides: [createSlide()] };
}

function createSlide() {
  return { shapes: [], background: DEFAULT_BACKGROUND };
}

// A deck saved before slides carried a background, or a slide read from a
// pptx that declares none, has no field here. Both mean paper white.
function slideBackground(slide) {
  const color = slide && slide.background;
  return color && color !== 'none' ? color : DEFAULT_BACKGROUND;
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
    src: '',
    bold: s.bold,
    italic: s.italic,
    underline: s.underline,
    textAlign: s.textAlign,
    verticalAlign: s.verticalAlign,
    cropLeft: 0,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    rotation: 0,
  };
}

function isFiniteInRange(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function safeColor(value, fallback) {
  const color = String(value || '');
  return /^(none|#[0-9a-f]{3}|#[0-9a-f]{4}|#[0-9a-f]{6}|#[0-9a-f]{8})$/i.test(color)
    ? color
    : fallback;
}

function normalizeClipboardShape(value) {
  if (!value || typeof value !== 'object' || !SHAPE_KINDS.has(value.kind)) return null;
  if (![value.x, value.y, value.w, value.h].every(
    (number) => isFiniteInRange(number, -MAX_GEOMETRY, MAX_GEOMETRY)
  )) return null;

  if (value.kind === 'pen') {
    if (!Array.isArray(value.points) || value.points.length < 2 || value.points.length > 100_000) {
      return null;
    }
    const validPoints = value.points.every(
      (point) => Array.isArray(point) && point.length === 2 && point.every(
        (number) => isFiniteInRange(number, -MAX_GEOMETRY, MAX_GEOMETRY)
      )
    );
    if (!validPoints) return null;
  }

  const shape = createShape(value.kind, value.x, value.y, {});
  shape.w = value.w;
  shape.h = value.h;
  if (value.kind === 'pen') shape.points = value.points.map((point) => [...point]);
  shape.stroke = safeColor(value.stroke, shape.stroke);
  shape.fill = safeColor(value.fill, shape.fill);
  shape.textColor = safeColor(value.textColor, shape.textColor);
  if (isFiniteInRange(value.strokeWidth, 0, 1_000)) shape.strokeWidth = value.strokeWidth;
  if (['solid', 'dash', 'dot'].includes(value.dash)) shape.dash = value.dash;
  if (typeof value.text === 'string' && value.text.length <= 1_000_000) shape.text = value.text;
  if (isFiniteInRange(value.fontSize, 1, 1_000)) shape.fontSize = value.fontSize;
  if (typeof value.fontFamily === 'string' && value.fontFamily.length <= 200) {
    shape.fontFamily = value.fontFamily;
  }
  if (typeof value.src === 'string' && value.src.length <= 100_000_000 &&
      /^data:image\/[a-z0-9.+-]+;base64,/i.test(value.src)) {
    shape.src = value.src;
  }
  for (const name of ['bold', 'italic', 'underline']) {
    if (typeof value[name] === 'boolean') shape[name] = value[name];
  }
  if (['left', 'center', 'right'].includes(value.textAlign)) {
    shape.textAlign = value.textAlign;
  }
  if (['top', 'center', 'bottom'].includes(value.verticalAlign)) {
    shape.verticalAlign = value.verticalAlign;
  }
  for (const name of ['cropLeft', 'cropTop', 'cropRight', 'cropBottom']) {
    if (isFiniteInRange(value[name], 0, 1)) shape[name] = value[name];
  }
  if (isFiniteInRange(value.rotation, -360_000, 360_000)) shape.rotation = value.rotation;
  return shape;
}

function parseClipboardShapes(value) {
  try {
    const shapes = JSON.parse(value);
    if (!Array.isArray(shapes) || shapes.length === 0 || shapes.length > MAX_CLIPBOARD_SHAPES) {
      return [];
    }
    return shapes.map(normalizeClipboardShape).filter(Boolean);
  } catch (_) {
    return [];
  }
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

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

function shapeIndicesInRect(shapes, rect) {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return shapes.reduce((indices, shape, index) => {
    const box = shapeBBox(shape);
    const contained =
      box.x >= rect.x &&
      box.y >= rect.y &&
      box.x + box.w <= right &&
      box.y + box.h <= bottom;
    if (contained) indices.push(index);
    return indices;
  }, []);
}

// Add an unselected item to a selection, or remove it when it is already
// present. Keeping this independent of the page makes modifier-click
// selection use the same valid-index rules as every other selection path.
function toggleSelection(selection, index, length) {
  const current = [...new Set(selection)].filter(
    (selected) => Number.isInteger(selected) && selected >= 0 && selected < length
  );
  if (!Number.isInteger(index) || index < 0 || index >= length) return current;
  return current.includes(index)
    ? current.filter((selected) => selected !== index)
    : [...current, index];
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

function wrapTextLines(text, width, fontSize) {
  if (!(width > 0)) return String(text || '').split('\n');
  const max = Math.max(1, Math.floor(width / Math.max(fontSize * 0.52, 1)));
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = words.shift();
    for (const word of words) {
      if (`${line} ${word}`.length <= max) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function rotateSvg(shape, markup) {
  if (!shape.rotation) return markup;
  const b = shapeBBox(shape);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return `<g transform="rotate(${shape.rotation} ${cx} ${cy})">${markup}</g>`;
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
      const lines = wrapTextLines(shape.text, shape.w, shape.fontSize);
      const lineHeight = shape.fontSize * 1.3;
      const blockHeight = lines.length * lineHeight;
      let y = shape.y + shape.fontSize;
      if (shape.verticalAlign === 'center') y += Math.max(0, (shape.h - blockHeight) / 2);
      if (shape.verticalAlign === 'bottom') y += Math.max(0, shape.h - blockHeight);
      const align = shape.textAlign || 'left';
      const x = align === 'center'
        ? shape.x + shape.w / 2
        : align === 'right' ? shape.x + shape.w : shape.x;
      const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
      const spans = lines
        .map(
          (line, i) =>
            `<tspan x="${x}" dy="${i === 0 ? 0 : '1.3em'}">${escapeXml(line) || ' '}</tspan>`
        )
        .join('');
      const decoration = shape.underline ? ' text-decoration="underline"' : '';
      const markup = `<text x="${x}" y="${y}" font-size="${shape.fontSize}" fill="${shape.textColor}" text-anchor="${anchor}" font-weight="${shape.bold ? '700' : '400'}" font-style="${shape.italic ? 'italic' : 'normal'}"${decoration} ${fontAttr(shape)}>${spans}</text>`;
      return rotateSvg(shape, markup);
    }
    case 'image': {
      const src = String(shape.src || '');
      const href = src.startsWith('data:image/') ? escapeXml(src) : '';
      const left = Math.max(0, Math.min(0.999, shape.cropLeft || 0));
      const top = Math.max(0, Math.min(0.999, shape.cropTop || 0));
      const width = Math.max(0.001, 1 - left - Math.max(0, shape.cropRight || 0));
      const height = Math.max(0.001, 1 - top - Math.max(0, shape.cropBottom || 0));
      const markup = `<svg x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" viewBox="${left} ${top} ${width} ${height}" preserveAspectRatio="none" overflow="hidden"><image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${href}"/></svg>`;
      return rotateSvg(shape, markup);
    }
    default:
      return '';
  }
}

function arrowSvg(shape) {
  const x1 = shape.x, y1 = shape.y;
  const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
  const length = Math.hypot(shape.w, shape.h);
  // A zero length arrow has no direction to point in. Drawing nothing beats
  // drawing the dot a round cap would leave behind; the handles still select it.
  if (!length) return '';
  const ux = shape.w / length, uy = shape.h / length;
  // Never more than half the arrow, so the base of the head stays in front of
  // the tail. Past that the shaft is drawn backwards and its far end shows up
  // as a dot sitting behind the arrow.
  const head = Math.min(length / 2, Math.max(10, shape.strokeWidth * 4));
  // Shorten the line so it does not poke through the head tip.
  const bx = x2 - ux * head, by = y2 - uy * head;
  // Widening a shortened head keeps it visible on a stubby arrow, where a head
  // proportional to its own length would be narrower than the shaft it sits on.
  // A head that is not clamped is already wider than this, so nothing moves.
  const half = Math.max(head * 0.45, shape.strokeWidth);
  const p1 = `${bx - uy * half},${by + ux * half}`;
  const p2 = `${bx + uy * half},${by - ux * half}`;
  // Both ends of the shaft take the default butt cap, which stops exactly on
  // the endpoint. The other two both overshoot it by half a stroke, and that
  // overshoot reads as a bead stuck on the end of the arrow: round leaves a
  // semicircle, square a rectangle.
  return (
    `<line x1="${x1}" y1="${y1}" x2="${bx}" y2="${by}" ${strokeAttrs(shape)}/>` +
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
    `<rect width="${SLIDE_W}" height="${SLIDE_H}" fill="${slideBackground(slide)}"/>${shapes}</svg>`
  );
}

function rotatedBBox(box, degrees) {
  if (!degrees) return box;
  const radians = degrees * Math.PI / 180;
  const width = Math.abs(box.w * Math.cos(radians)) + Math.abs(box.h * Math.sin(radians));
  const height = Math.abs(box.w * Math.sin(radians)) + Math.abs(box.h * Math.cos(radians));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x: cx - width / 2, y: cy - height / 2, w: width, h: height };
}

function shapeImageBBox(shape) {
  const stroke = shape.stroke === 'none' || shape.kind === 'text' || shape.kind === 'image'
    ? 0
    : Math.max(0, shape.strokeWidth || 0) / 2;
  const arrow = shape.kind === 'arrow'
    ? Math.max(10, Math.max(0, shape.strokeWidth || 0) * 4) * 0.5
    : 0;
  const padding = Math.max(2, stroke, arrow);
  const box = shapeBBox(shape);
  const padded = {
    x: box.x - padding,
    y: box.y - padding,
    w: Math.max(1, box.w + padding * 2),
    h: Math.max(1, box.h + padding * 2),
  };
  return rotatedBBox(padded, shape.rotation || 0);
}

function renderShapesSvg(shapes) {
  if (!Array.isArray(shapes) || shapes.length === 0) return null;
  const boxes = shapes.map(shapeImageBBox);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  const width = Math.max(1, right - left);
  const height = Math.max(1, bottom - top);
  const markup = shapes.map((shape) => renderShapeSvg(shape)).join('');
  return {
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${left} ${top} ${width} ${height}">${markup}</svg>`,
    width,
    height,
  };
}

// --- zoom ---------------------------------------------------------------------
//
// Fixed steps rather than a free factor: every stop is a round number the
// label can show, and repeated presses land on the same places every time.
// 1 is the slide fitted to the stage, which is where the editor starts.

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const ZOOM_FIT = 1;

function zoomIn(zoom) {
  return ZOOM_STEPS.find((step) => step > zoom + 0.001) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

function zoomOut(zoom) {
  const smaller = ZOOM_STEPS.filter((step) => step < zoom - 0.001);
  return smaller.length ? smaller[smaller.length - 1] : ZOOM_STEPS[0];
}

const exported = {
  SLIDE_W,
  SLIDE_H,
  DEFAULT_STYLE,
  DEFAULT_BACKGROUND,
  ZOOM_STEPS,
  ZOOM_FIT,
  zoomIn,
  zoomOut,
  createDeck,
  createSlide,
  slideBackground,
  createShape,
  parseClipboardShapes,
  dragShape,
  isDegenerate,
  shapeBBox,
  normalizeRect,
  shapeIndicesInRect,
  toggleSelection,
  moveShape,
  handlesFor,
  resizeShape,
  addSlide,
  deleteSlide,
  duplicateSlide,
  slideNumberShape,
  escapeXml,
  wrapTextLines,
  renderShapeSvg,
  renderSlideSvg,
  renderShapesSvg,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.slidesLib = exported;
}
