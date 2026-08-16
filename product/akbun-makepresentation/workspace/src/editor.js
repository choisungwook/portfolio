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
  stroke: '#e03131',
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

// A shape that can hold text of its own. A text box is the whole shape; a
// rect or an ellipse draws its text inside the outline.
const TEXTUAL = new Set(['rect', 'ellipse']);

// The five pptx line ends, under their pptx names, so a round trip through
// `a:headEnd`/`a:tailEnd` is a rename and nothing else.
const ARROW_ENDS = ['none', 'triangle', 'arrow', 'oval', 'diamond'];
const DEFAULT_PRESET_IDS = [
  'red-filled-rectangle',
  'red-outline-rectangle',
  'numbered-circle',
  'right-open-arrow',
  'left-open-arrow',
];
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
  // Text inside a box wants to sit in the middle of it. A text box is its own
  // box, so it keeps the top-left start every other editor gives it.
  const align = TEXTUAL.has(kind) ? 'center' : s.textAlign;
  const verticalAlign = TEXTUAL.has(kind) ? 'center' : s.verticalAlign;
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
    textAlign: align,
    verticalAlign,
    cropLeft: 0,
    cropTop: 0,
    cropRight: 0,
    cropBottom: 0,
    rotation: 0,
    groupId: '',
    penArrow: false,
    arrowStart: 'none',
    arrowEnd: kind === 'arrow' ? 'triangle' : 'none',
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
  if (typeof value.groupId === 'string' && value.groupId.length <= 100) {
    shape.groupId = value.groupId;
  }
  if (typeof value.penArrow === 'boolean') shape.penArrow = value.penArrow;
  for (const name of ['arrowStart', 'arrowEnd']) {
    if (ARROW_ENDS.includes(value[name])) shape[name] = value[name];
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

function defaultPresetShapes(id) {
  const red = '#e03131';
  if (id === 'red-filled-rectangle' || id === 'red-outline-rectangle') {
    const shape = createShape('rect', 0, 0, {
      stroke: red,
      fill: id === 'red-filled-rectangle' ? red : 'none',
    });
    shape.w = 160;
    shape.h = 90;
    return [shape];
  }
  if (id === 'numbered-circle') {
    const shape = createShape('ellipse', 0, 0, {
      stroke: red,
      fill: 'none',
      fontSize: 30,
      textColor: red,
    });
    shape.w = 90;
    shape.h = 90;
    shape.text = '1';
    return [shape];
  }
  if (id === 'right-open-arrow' || id === 'left-open-arrow') {
    const pointsRight = id === 'right-open-arrow';
    const shape = createShape('arrow', pointsRight ? 0 : 180, 45, {
      stroke: red,
      strokeWidth: 3,
    });
    shape.w = pointsRight ? 180 : -180;
    shape.h = 0;
    shape.arrowEnd = 'arrow';
    return [shape];
  }
  return [];
}

function normalizeRect(x0, y0, x1, y1) {
  return {
    x: Math.min(x0, x1),
    y: Math.min(y0, y1),
    w: Math.abs(x1 - x0),
    h: Math.abs(y1 - y0),
  };
}

// Touching is enough, the way Figma and Illustrator drag-select. Requiring
// full containment looked like a bug that swallowed objects: shapes default
// to no fill, so a drag started in the empty middle of a rectangle begins a
// marquee, and that marquee can never contain the rectangle it started
// inside. The text sitting in the rectangle was caught and the rectangle
// itself was not.
//
// Lines keep being tested by their bounding box, so a diagonal one answers to
// a marquee that only crosses the empty corner of that box. Under a touch
// rule that errs the forgiving way.
function shapeIndicesInRect(shapes, rect) {
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  return shapes.reduce((indices, shape, index) => {
    const box = shapeBBox(shape);
    const overlaps =
      box.x <= right &&
      box.x + box.w >= rect.x &&
      box.y <= bottom &&
      box.y + box.h >= rect.y;
    if (overlaps) indices.push(index);
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

let groupSequence = 0;

function nextGroupId() {
  groupSequence += 1;
  return `group-${Date.now()}-${groupSequence}`;
}

function groupShapes(shapes, indices) {
  const valid = [...new Set(indices)].filter(
    (index) => Number.isInteger(index) && index >= 0 && index < shapes.length
  );
  if (valid.length < 2) return '';
  const id = nextGroupId();
  for (const index of valid) shapes[index].groupId = id;
  return id;
}

function ungroupShapes(shapes, indices) {
  const ids = new Set(indices.map((index) => shapes[index] && shapes[index].groupId).filter(Boolean));
  if (ids.size === 0) return false;
  for (const shape of shapes) {
    if (ids.has(shape.groupId)) shape.groupId = '';
  }
  return true;
}

function groupIndicesFor(shapes, index) {
  const shape = shapes[index];
  if (!shape || !shape.groupId) return Number.isInteger(index) ? [index] : [];
  return shapes.reduce((indices, candidate, candidateIndex) => {
    if (candidate.groupId === shape.groupId) indices.push(candidateIndex);
    return indices;
  }, []);
}

function cloneShapes(shapes) {
  const groupIds = new Map();
  return shapes.map((shape) => {
    const copy = structuredClone(shape);
    if (copy.groupId) {
      if (!groupIds.has(copy.groupId)) groupIds.set(copy.groupId, nextGroupId());
      copy.groupId = groupIds.get(copy.groupId);
    }
    return copy;
  });
}

function setCrop(shape, side, fraction) {
  const value = Math.max(0, Math.min(0.95, fraction));
  const opposite = side === 'left' ? 'cropRight' : side === 'right' ? 'cropLeft' :
    side === 'top' ? 'cropBottom' : 'cropTop';
  const property = `crop${side[0].toUpperCase()}${side.slice(1)}`;
  shape[property] = Math.round(Math.min(value, 0.95 - (shape[opposite] || 0)) * 1_000_000) / 1_000_000;
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

function resizeLineEndpoint(shape, from, handle, dx, dy) {
  const endX = from.x + from.w;
  const endY = from.y + from.h;
  if (handle === 'start') {
    shape.x = from.x + dx;
    shape.y = from.y + dy;
    shape.w = endX - shape.x;
    shape.h = endY - shape.y;
  } else {
    shape.x = from.x;
    shape.y = from.y;
    shape.w = from.w + dx;
    shape.h = from.h + dy;
  }
}

function projectOnAxis(x, y, fixedX, fixedY, axisX, axisY) {
  const lengthSquared = axisX * axisX + axisY * axisY;
  if (lengthSquared === 0) return { x, y };
  const scale = ((x - fixedX) * axisX + (y - fixedY) * axisY) / lengthSquared;
  return {
    x: fixedX + axisX * scale,
    y: fixedY + axisY * scale,
  };
}

function resizeLineOnAxis(shape, from, handle, dx, dy) {
  const endX = from.x + from.w;
  const endY = from.y + from.h;
  if (handle === 'start') {
    const point = projectOnAxis(
      from.x + dx,
      from.y + dy,
      endX,
      endY,
      -from.w,
      -from.h
    );
    shape.x = point.x;
    shape.y = point.y;
    shape.w = endX - point.x;
    shape.h = endY - point.y;
  } else {
    const point = projectOnAxis(
      endX + dx,
      endY + dy,
      from.x,
      from.y,
      from.w,
      from.h
    );
    shape.x = from.x;
    shape.y = from.y;
    shape.w = point.x - from.x;
    shape.h = point.y - from.y;
  }
}

function resizeSquare(shape, from, handle, dx, dy) {
  const b = shapeBBox(from);
  const fixedX = handle.includes('w') ? b.x + b.w : b.x;
  const fixedY = handle.includes('n') ? b.y + b.h : b.y;
  const movingX = (handle.includes('w') ? b.x : b.x + b.w) + dx;
  const movingY = (handle.includes('n') ? b.y : b.y + b.h) + dy;
  const width = handle.includes('w') ? fixedX - movingX : movingX - fixedX;
  const height = handle.includes('n') ? fixedY - movingY : movingY - fixedY;
  const size = Math.max(MIN_SIZE, width, height);
  shape.x = handle.includes('w') ? fixedX - size : fixedX;
  shape.y = handle.includes('n') ? fixedY - size : fixedY;
  shape.w = size;
  shape.h = size;
}

// Resize by dragging a handle. `from` is the shape as it was when the drag
// started, so repeated calls with a growing delta do not compound.
function resizeShape(shape, from, handle, dx, dy) {
  if (handle === 'start' || handle === 'end') {
    resizeLineEndpoint(shape, from, handle, dx, dy);
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

// Shift-resizing a box makes geometry rather than merely preserving its old
// aspect ratio: a rectangle becomes a square and an ellipse becomes a circle.
// A line keeps its original axis, including the opposite direction after the
// moving endpoint crosses the fixed one.
function resizeShapeConstrained(shape, from, handle, dx, dy) {
  if (shape.kind === 'line' || shape.kind === 'arrow') {
    resizeLineOnAxis(shape, from, handle, dx, dy);
    return;
  }
  if (shape.kind === 'rect' || shape.kind === 'ellipse') {
    resizeSquare(shape, from, handle, dx, dy);
    return;
  }
  resizeShape(shape, from, handle, dx, dy);
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

// Move one slide to another position and answer where it landed. An index
// outside the deck clamps rather than throwing, so a drag past either end of
// the panel and a Cmd+Arrow at the last slide both do the obvious thing.
function moveSlide(deck, from, to) {
  const last = deck.slides.length - 1;
  if (!Number.isInteger(from) || from < 0 || from > last) return from;
  const at = Math.max(0, Math.min(Math.round(to), last));
  if (at === from) return from;
  const [slide] = deck.slides.splice(from, 1);
  deck.slides.splice(at, 0, slide);
  return at;
}

function moveSlideSelection(deck, indices, direction) {
  if (direction !== -1 && direction !== 1) return [];
  const selected = new Set(indices.filter(
    (index) => Number.isInteger(index) && index >= 0 && index < deck.slides.length
  ));
  if (direction < 0) {
    for (let index = 1; index < deck.slides.length; index += 1) {
      if (!selected.has(index) || selected.has(index - 1)) continue;
      [deck.slides[index - 1], deck.slides[index]] = [deck.slides[index], deck.slides[index - 1]];
      selected.delete(index);
      selected.add(index - 1);
    }
  } else {
    for (let index = deck.slides.length - 2; index >= 0; index -= 1) {
      if (!selected.has(index) || selected.has(index + 1)) continue;
      [deck.slides[index], deck.slides[index + 1]] = [deck.slides[index + 1], deck.slides[index]];
      selected.delete(index);
      selected.add(index + 1);
    }
  }
  return [...selected].sort((left, right) => left - right);
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

const TEXT_CHAR_WIDTH = 0.52;

function wrapTextLines(text, width, fontSize) {
  if (!(width > 0)) return String(text || '').split('\n');
  const max = Math.max(1, Math.floor(width / Math.max(fontSize * TEXT_CHAR_WIDTH, 1)));
  const lines = [];
  for (const paragraph of String(text || '').split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let line = '';
    for (let word of words) {
      while (word.length > max) {
        if (line) {
          lines.push(line);
          line = '';
        }
        lines.push(word.slice(0, max));
        word = word.slice(max);
      }
      if (!word) continue;
      if (!line) {
        line = word;
      } else if (`${line} ${word}`.length <= max) {
        line += ` ${word}`;
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }
  return lines;
}

function fitTextBox(shape, text, maxWidth) {
  if (!shape || shape.kind !== 'text') return shape;
  const content = String(text || '');
  const fontSize = Math.max(1, Number(shape.fontSize) || DEFAULT_STYLE.fontSize);
  const available = Number.isFinite(maxWidth)
    ? maxWidth
    : SLIDE_W - Math.max(0, Number(shape.x) || 0);
  const widthLimit = Math.max(1, available);
  const minWidth = Math.min(120, widthLimit);
  const longest = Math.max(1, ...content.split('\n').map((line) => line.length));
  shape.w = Math.min(
    widthLimit,
    Math.max(minWidth, longest * fontSize * TEXT_CHAR_WIDTH + 4)
  );
  const lines = wrapTextLines(content, shape.w, fontSize);
  shape.h = Math.max(fontSize * 1.4, lines.length * fontSize * 1.35);
  return shape;
}

function rotateSvg(shape, markup) {
  if (!shape.rotation) return markup;
  const b = shapeBBox(shape);
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  return `<g transform="rotate(${shape.rotation} ${cx} ${cy})">${markup}</g>`;
}

// How far the text inside a rect or an ellipse keeps off its outline. A text
// box has no outline to keep off, so it gets none.
const TEXT_PADDING = 8;

// The box a shape lays its own text out in. Same one the overlay textarea
// uses, so glyphs do not jump when editing starts or ends.
function textBox(shape) {
  const b = shapeBBox(shape);
  if (!TEXTUAL.has(shape.kind)) return { x: b.x, y: b.y, w: b.w, h: b.h };
  const pad = Math.min(TEXT_PADDING, b.w / 4, b.h / 4);
  return { x: b.x + pad, y: b.y + pad, w: Math.max(0, b.w - pad * 2), h: Math.max(0, b.h - pad * 2) };
}

// Glyphs for whatever text a shape carries, laid out in `box`. Shared by the
// text box and by the text a rect or an ellipse holds inside its outline, so
// the two wrap, align and anchor the same way.
function shapeTextSvg(shape) {
  if (!String(shape.text || '')) return '';
  const inner = textBox(shape);
  const lines = wrapTextLines(shape.text, inner.w, shape.fontSize);
  const lineHeight = shape.fontSize * 1.3;
  const blockHeight = lines.length * lineHeight;
  let y = inner.y + shape.fontSize;
  if (shape.verticalAlign === 'center') y += Math.max(0, (inner.h - blockHeight) / 2);
  if (shape.verticalAlign === 'bottom') y += Math.max(0, inner.h - blockHeight);
  const align = shape.textAlign || 'left';
  const x = align === 'center'
    ? inner.x + inner.w / 2
    : align === 'right' ? inner.x + inner.w : inner.x;
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const spans = lines
    .map(
      (line, i) =>
        `<tspan x="${x}" dy="${i === 0 ? 0 : '1.3em'}">${escapeXml(line) || ' '}</tspan>`
    )
    .join('');
  const decoration = shape.underline ? ' text-decoration="underline"' : '';
  return `<text x="${x}" y="${y}" font-size="${shape.fontSize}" fill="${shape.textColor}" text-anchor="${anchor}" font-weight="${shape.bold ? '700' : '400'}" font-style="${shape.italic ? 'italic' : 'normal'}"${decoration} ${fontAttr(shape)}>${spans}</text>`;
}

// Markup for one shape. `options.hideText` suppresses the glyphs while the
// overlay textarea is editing that shape.
function renderShapeSvg(shape, options) {
  const hideText = options && options.hideText;
  switch (shape.kind) {
    case 'rect': {
      const b = shapeBBox(shape);
      const outline = `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, outline + (hideText ? '' : shapeTextSvg(shape)));
    }
    case 'ellipse': {
      const b = shapeBBox(shape);
      const outline = `<ellipse cx="${b.x + b.w / 2}" cy="${b.y + b.h / 2}" rx="${b.w / 2}" ry="${b.h / 2}" fill="${shape.fill}" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, outline + (hideText ? '' : shapeTextSvg(shape)));
    }
    case 'line':
    case 'arrow':
      return arrowSvg(shape);
    case 'pen': {
      const pts = shape.points.map((p) => `${p[0]},${p[1]}`).join(' ');
      return `<polyline points="${pts}" fill="none" ${strokeAttrs(shape)} stroke-linecap="round" stroke-linejoin="round"/>${shape.penArrow ? penArrowSvg(shape) : ''}`;
    }
    case 'text': {
      if (hideText) return '';
      return rotateSvg(shape, shapeTextSvg(shape));
    }
    case 'image': {
      const src = String(shape.src || '');
      const href = src.startsWith('data:image/') ? escapeXml(src) : '';
      const left = Math.max(0, Math.min(0.999, shape.cropLeft || 0));
      const top = Math.max(0, Math.min(0.999, shape.cropTop || 0));
      const width = Math.max(0.001, 1 - left - Math.max(0, shape.cropRight || 0));
      const height = Math.max(0.001, 1 - top - Math.max(0, shape.cropBottom || 0));
      const markup = `<svg x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" viewBox="${left} ${top} ${width} ${height}" preserveAspectRatio="none" overflow="hidden"><image x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${href}"/></svg><rect x="${shape.x}" y="${shape.y}" width="${shape.w}" height="${shape.h}" fill="none" ${strokeAttrs(shape)}/>`;
      return rotateSvg(shape, markup);
    }
    default:
      return '';
  }
}

function penArrowSvg(shape) {
  if (shape.points.length < 2 || shape.stroke === 'none') return '';
  const end = shape.points[shape.points.length - 1];
  let start = shape.points[shape.points.length - 2];
  for (let index = shape.points.length - 2; index >= 0; index -= 1) {
    if (shape.points[index][0] !== end[0] || shape.points[index][1] !== end[1]) {
      start = shape.points[index];
      break;
    }
  }
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const length = Math.hypot(dx, dy);
  if (!length) return '';
  const ux = dx / length;
  const uy = dy / length;
  const head = Math.min(length / 2, Math.max(10, shape.strokeWidth * 4));
  const half = Math.max(head * 0.45, shape.strokeWidth);
  const bx = end[0] - ux * head;
  const by = end[1] - uy * head;
  const p1 = `${bx - uy * half},${by + ux * half}`;
  const p2 = `${bx + uy * half},${by - ux * half}`;
  return `<polygon points="${end[0]},${end[1]} ${p1} ${p2}" fill="${shape.stroke}"/>`;
}

// The end a shape draws at a given tip, and how far back along the shaft that
// end reaches. The shaft is shortened by that much so it never pokes out
// through a filled tip.
//
// (ux,uy) points outward, away from the shaft and towards the tip.
function arrowEndSvg(end, x, y, ux, uy, size, shape) {
  const color = shape.stroke === 'none' ? '#1a1a1a' : shape.stroke;
  const back = (distance) => [x - ux * distance, y - uy * distance];
  switch (end) {
    case 'triangle': {
      const [bx, by] = back(size);
      // Widening a shortened head keeps it visible on a stubby arrow, where a
      // head proportional to its own length would be narrower than the shaft
      // it sits on. An unclamped head is already wider, so nothing moves.
      const half = Math.max(size * 0.45, shape.strokeWidth);
      return {
        markup: `<polygon points="${x},${y} ${bx - uy * half},${by + ux * half} ${bx + uy * half},${by - ux * half}" fill="${color}"/>`,
        inset: size,
      };
    }
    case 'arrow': {
      // Two open barbs. They meet at the tip, so the shaft can run the whole
      // way and nothing has to be shortened.
      const [bx, by] = back(size);
      const half = Math.max(size * 0.5, shape.strokeWidth);
      return {
        markup:
          `<polyline points="${bx - uy * half},${by + ux * half} ${x},${y} ${bx + uy * half},${by - ux * half}"` +
          ` fill="none" stroke="${color}" stroke-width="${shape.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`,
        inset: 0,
      };
    }
    case 'oval': {
      const r = Math.max(size * 0.35, shape.strokeWidth);
      const [cx, cy] = back(r);
      return {
        markup: `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`,
        inset: r * 2,
      };
    }
    case 'diamond': {
      const [cx, cy] = back(size / 2);
      const [bx, by] = back(size);
      const half = Math.max(size * 0.35, shape.strokeWidth);
      return {
        markup: `<polygon points="${x},${y} ${cx - uy * half},${cy + ux * half} ${bx},${by} ${cx + uy * half},${cy - ux * half}" fill="${color}"/>`,
        inset: size,
      };
    }
    default:
      return { markup: '', inset: 0 };
  }
}

// One renderer for line and arrow. The two differ only in the end they start
// life with, so a line given an end draws it and an arrow given none stops
// drawing one.
function arrowSvg(shape) {
  const x1 = shape.x, y1 = shape.y;
  const x2 = shape.x + shape.w, y2 = shape.y + shape.h;
  const length = Math.hypot(shape.w, shape.h);
  // A zero length line has no direction to point in. Drawing nothing beats
  // drawing the dot a round cap would leave behind; the handles still select it.
  if (!length) return '';
  const ux = shape.w / length, uy = shape.h / length;
  const start = ARROW_ENDS.includes(shape.arrowStart) ? shape.arrowStart : 'none';
  const end = ARROW_ENDS.includes(shape.arrowEnd) ? shape.arrowEnd : 'none';
  const decorated = (start !== 'none' ? 1 : 0) + (end !== 'none' ? 1 : 0);
  // Never more than half the line for both ends together, so the two bases
  // stay clear of each other. Past that the shaft is drawn backwards and its
  // far end shows up as a stray dot behind the head.
  const size = Math.min(
    length / 2 / Math.max(1, decorated),
    Math.max(10, shape.strokeWidth * 4)
  );
  const head = arrowEndSvg(end, x2, y2, ux, uy, size, shape);
  const tail = arrowEndSvg(start, x1, y1, -ux, -uy, size, shape);
  // A bare line keeps the round cap it always had; a decorated end takes the
  // default butt cap, which stops exactly on the endpoint. Round and square
  // both overshoot by half a stroke, and that overshoot reads as a bead stuck
  // on the end of the arrow.
  const cap = decorated ? '' : ' stroke-linecap="round"';
  return (
    `<line x1="${x1 + ux * tail.inset}" y1="${y1 + uy * tail.inset}"` +
    ` x2="${x2 - ux * head.inset}" y2="${y2 - uy * head.inset}" ${strokeAttrs(shape)}${cap}/>` +
    tail.markup +
    head.markup
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

function filterFonts(fonts, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return [...fonts];
  return fonts.filter((font) => font.toLocaleLowerCase().includes(needle));
}

const exported = {
  SLIDE_W,
  SLIDE_H,
  DEFAULT_STYLE,
  DEFAULT_BACKGROUND,
  ARROW_ENDS,
  DEFAULT_PRESET_IDS,
  TEXTUAL,
  textBox,
  ZOOM_STEPS,
  ZOOM_FIT,
  zoomIn,
  zoomOut,
  filterFonts,
  createDeck,
  createSlide,
  slideBackground,
  createShape,
  defaultPresetShapes,
  parseClipboardShapes,
  dragShape,
  isDegenerate,
  shapeBBox,
  normalizeRect,
  shapeIndicesInRect,
  toggleSelection,
  moveShape,
  groupShapes,
  ungroupShapes,
  groupIndicesFor,
  cloneShapes,
  setCrop,
  handlesFor,
  resizeShape,
  resizeShapeConstrained,
  addSlide,
  deleteSlide,
  moveSlide,
  moveSlideSelection,
  duplicateSlide,
  slideNumberShape,
  escapeXml,
  wrapTextLines,
  fitTextBox,
  rotateSvg,
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
