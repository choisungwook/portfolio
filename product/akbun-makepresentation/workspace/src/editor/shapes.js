(function registerEditorShapes(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(require('./constants.js'))
    : factory(root.makepresentationEditorConstants);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorShapes = api;
})(globalThis, function createEditorShapes(C) {
  'use strict';

  const {
    ARROW_ENDS,
    CODE_FORMATS,
    CODE_LANGUAGES,
    DEFAULT_IMAGE_STYLE,
    DEFAULT_STYLE,
    MAX_CLIPBOARD_SHAPES,
    MAX_GEOMETRY,
    SHAPE_KINDS,
    TEXTUAL,
  } = C;

function createShape(kind, x, y, style) {
  const s = Object.assign(
    {},
    DEFAULT_STYLE,
    kind === 'image' ? DEFAULT_IMAGE_STYLE : null,
    style
  );
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
    arrowStart: 'none',
    arrowEnd: kind === 'arrow' ? 'triangle' : 'none',
    codeFormat: 'editor-dark',
    codeLanguage: 'python',
    codeHighlights: [],
    codeCallouts: [],
    showLineNumbers: true,
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

function normalizeLineNumbers(value) {
  const numbers = Array.isArray(value)
    ? value
    : String(value || '').split(',').flatMap((part) => {
      const match = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
      if (!match) return [Number(part.trim())];
      const start = Number(match[1]);
      const end = Number(match[2]);
      if (end < start || end - start > 1_000) return [];
      return Array.from({ length: end - start + 1 }, (_, index) => start + index);
    });
  return [...new Set(numbers.map(Number).filter(
    (number) => Number.isInteger(number) && number > 0 && number <= 100_000
  ))].sort((left, right) => left - right);
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
  // A pen saved before it had two named ends carried one boolean instead.
  if (value.penArrow === true) shape.arrowEnd = 'triangle';
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
  if (CODE_FORMATS[value.codeFormat]) shape.codeFormat = value.codeFormat;
  if (CODE_LANGUAGES.includes(value.codeLanguage)) shape.codeLanguage = value.codeLanguage;
  shape.codeHighlights = normalizeLineNumbers(value.codeHighlights);
  shape.codeCallouts = normalizeLineNumbers(value.codeCallouts);
  if (typeof value.showLineNumbers === 'boolean') shape.showLineNumbers = value.showLineNumbers;
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
let groupSequence = 0;

function nextGroupId() {
  groupSequence += 1;
  return `group-${Date.now()}-${groupSequence}`;
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

  return {
    createShape,
    normalizeLineNumbers,
    parseClipboardShapes,
    cloneShapes,
    setCrop,
    nextGroupId,
  };
});
