(function registerEditorDeck(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(require('./constants.js'), require('./shapes.js'))
    : factory(root.makepresentationEditorConstants, root.makepresentationEditorShapes);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorDeck = api;
})(globalThis, function createEditorDeck(C, Shapes) {
  'use strict';

  const {
    CM_PER_INCH,
    DEFAULT_BACKGROUND,
    MAX_SLIDE_SIZE,
    MIN_SLIDE_SIZE,
    PX_PER_INCH,
    SLIDE_H,
    SLIDE_SIZE_PRESETS,
    SLIDE_W,
  } = C;
  const { createShape } = Shapes;

function createDeck() {
  return { slideWidth: SLIDE_W, slideHeight: SLIDE_H, slides: [createSlide()] };
}

function createSlide() {
  return { shapes: [], background: DEFAULT_BACKGROUND };
}

function slideSize(deck) {
  const width = Number(deck && deck.slideWidth);
  const height = Number(deck && deck.slideHeight);
  return {
    width: Number.isFinite(width) && width >= MIN_SLIDE_SIZE && width <= MAX_SLIDE_SIZE
      ? width
      : SLIDE_W,
    height: Number.isFinite(height) && height >= MIN_SLIDE_SIZE && height <= MAX_SLIDE_SIZE
      ? height
      : SLIDE_H,
  };
}

function setSlideSize(deck, width, height) {
  const nextWidth = Number(width);
  const nextHeight = Number(height);
  if (
    !deck ||
    !Number.isFinite(nextWidth) ||
    !Number.isFinite(nextHeight) ||
    nextWidth < MIN_SLIDE_SIZE ||
    nextHeight < MIN_SLIDE_SIZE ||
    nextWidth > MAX_SLIDE_SIZE ||
    nextHeight > MAX_SLIDE_SIZE
  ) return false;
  deck.slideWidth = Math.round(nextWidth * 100) / 100;
  deck.slideHeight = Math.round(nextHeight * 100) / 100;
  return true;
}

function slideSizePreset(ratio) {
  const preset = SLIDE_SIZE_PRESETS[ratio];
  return preset ? { ...preset } : null;
}

function pixelsToCentimeters(value) {
  return Math.round((Number(value) * CM_PER_INCH / PX_PER_INCH) * 1000) / 1000;
}

function centimetersToPixels(value) {
  const pixels = Number(value) * PX_PER_INCH / CM_PER_INCH;
  const nearestInteger = Math.round(pixels);
  if (Math.abs(pixels - nearestInteger) < 0.05) return nearestInteger;
  return Math.round(pixels * 100) / 100;
}

// A deck saved before slides carried a background, or a slide read from a
// pptx that declares none, has no field here. Both mean paper white.
function slideBackground(slide) {
  const color = slide && slide.background;
  return color && color !== 'none' ? color : DEFAULT_BACKGROUND;
}

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

function moveSlideAtEdge(deck, from, target, edge) {
  if (!Number.isInteger(target) || target < 0 || target >= deck.slides.length) return from;
  let insertion = target + (edge === 'after' ? 1 : 0);
  if (from < insertion) insertion -= 1;
  return moveSlide(deck, from, insertion);
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
function slideNumberShape(number, width = SLIDE_W, height = SLIDE_H) {
  const shape = createShape('text', width - 110, height - 52, {
    fontSize: 18,
    textColor: '#868e96',
  });
  shape.w = 90;
  shape.h = 24;
  shape.text = String(number);
  return shape;
}

// --- SVG markup --------------------------------------------------------------


  return {
    createDeck,
    createSlide,
    slideSize,
    setSlideSize,
    slideSizePreset,
    pixelsToCentimeters,
    centimetersToPixels,
    slideBackground,
    addSlide,
    deleteSlide,
    moveSlide,
    moveSlideAtEdge,
    moveSlideSelection,
    duplicateSlide,
    slideNumberShape,
  };
});
