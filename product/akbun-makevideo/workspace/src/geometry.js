'use strict';

(function () {

// Where the picture goes, as arithmetic over plain objects.
//
// One function answers "where is the stage", and everything that needs the
// answer — the media element preview laying out its stack, the native monitor
// placing a view over the webview — asks this rather than measuring what the
// other one did. Two measurements of the same box taken a frame apart was the
// shape this replaced, and a frame apart is exactly when they disagree.
//
// # Units
//
// CSS pixels throughout, measured from the top left of the WebView. That is
// what `getBoundingClientRect()` returns and what an AppKit frame inside a
// flipped `WKWebView` takes, so nothing here converts anything and no number
// crosses the IPC boundary in a unit the far side has to guess at.
//
// The old path multiplied by `window.devicePixelRatio` on the way out and
// divided by the view's backing scale on the way in. For placement those two
// cancel — it was a round trip that only came back where it started while the
// page's ratio and the window's agreed. They stop agreeing whenever the window
// is on a display the page's cached ratio is not about, and then every
// coordinate is scaled by two or a half at once: the view lands at double the
// offset *and* double the size, which is a picture drawn well outside the
// panel. Physical pixels are still needed to size a swapchain, and that number
// is now asked of the view itself, on the side that can know which display the
// window is actually on.
//
// # Why a box that does not fit is empty rather than small
//
// A native view is not in the page's stacking order, so `overflow: hidden` on
// the panel does not clip it. A stage held up to some minimum width is wider
// than the panel holding it, and what spills is not clipped by anything — it is
// drawn over the timeline. So there are no minimum sizes here. A panel with no
// room in it has no picture in it, and `isDrawable` is how that is said.
//
// Minimums also break the shape. A width held up to a floor while the height
// falls past it is a stretched picture, which is the other half of the same
// bug.

const STAGE_PADDING = 14;

const DEFAULT_SHAPE = Object.freeze({ width: 1920, height: 1080 });

const EMPTY = Object.freeze({ left: 0, top: 0, width: 0, height: 0 });

const FIT_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

function clamp(value, min, max) {
  return Math.max(min, Math.min(value, max));
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

/** A box on whole pixels that is never bigger than the one it was measured
 *  from.
 *
 *  Rounding the origin and the size separately is what lets a box end up a
 *  pixel past its container: two independent roundings, each free to go up.
 *  Rounding the two *edges* and taking the size from them leaves the right and
 *  bottom edges where they were measured. */
function pixelBox(left, top, width, height) {
  if (![left, top, width, height].every(Number.isFinite)) return EMPTY;
  const x = Math.round(left);
  const y = Math.round(top);
  return {
    left: x,
    top: y,
    width: Math.max(0, Math.round(left + width) - x),
    height: Math.max(0, Math.round(top + height) - y),
  };
}

/** Whether there is enough of a box to draw on. A stage box is genuinely zero
 *  while a window is being laid out and while a panel is dragged shut, and both
 *  have to read as "nothing to show" rather than as a size. */
function isDrawable(box) {
  return Boolean(box) && box.width >= 1 && box.height >= 1;
}

/** The project's pixel shape, which is all the fit needs from it. */
function shapeOf(project) {
  const settings = (project && project.settings) || null;
  return {
    width: positive(settings && settings.width, DEFAULT_SHAPE.width),
    height: positive(settings && settings.height, DEFAULT_SHAPE.height),
  };
}

/** Fit the project's shape inside `panel` and centre it there.
 *
 *  `panel` is the preview panel as `getBoundingClientRect()` gives it, so the
 *  answer is in the same coordinates and can be handed straight to a native
 *  view without another measurement. */
function stageBoxOf(panel, project, padding) {
  if (!panel) return EMPTY;
  const pad = Number.isFinite(padding) ? Math.max(0, padding) : STAGE_PADDING;
  const room = {
    width: (Number(panel.width) || 0) - pad * 2,
    height: (Number(panel.height) || 0) - pad * 2,
  };
  if (!(room.width > 0) || !(room.height > 0)) return EMPTY;

  const shape = shapeOf(project);
  const fit = Math.min(room.width / shape.width, room.height / shape.height);
  if (!Number.isFinite(fit) || fit <= 0) return EMPTY;

  const width = shape.width * fit;
  const height = shape.height * fit;
  return pixelBox(
    (Number(panel.left) || 0) + pad + (room.width - width) / 2,
    (Number(panel.top) || 0) + pad + (room.height - height) / 2,
    width,
    height
  );
}

function fittedViewport() {
  return { zoom: FIT_ZOOM, x: 0, y: 0 };
}

/** Hold the enlarged picture against the stage edges, so panning can never
 *  expose a strip of nothing beside it. */
function clampViewport(viewport, stage) {
  const zoom = clamp(positive(viewport && viewport.zoom, FIT_ZOOM), FIT_ZOOM, MAX_ZOOM);
  const width = Math.max(0, Number(stage && stage.width) || 0);
  const height = Math.max(0, Number(stage && stage.height) || 0);
  return {
    zoom,
    x: clamp(Number(viewport && viewport.x) || 0, width - width * zoom, 0),
    y: clamp(Number(viewport && viewport.y) || 0, height - height * zoom, 0),
  };
}

/** Zoom about `cursor`, which is a point inside the stage box, keeping
 *  whatever the project shows there under it. */
function zoomViewport(viewport, stage, cursor, zoom) {
  const current = clampViewport(viewport, stage);
  const next = clamp(positive(zoom, FIT_ZOOM), FIT_ZOOM, MAX_ZOOM);
  const at = cursor || { x: 0, y: 0 };
  const sourceX = ((Number(at.x) || 0) - current.x) / current.zoom;
  const sourceY = ((Number(at.y) || 0) - current.y) / current.zoom;
  return clampViewport(
    {
      zoom: next,
      x: (Number(at.x) || 0) - sourceX * next,
      y: (Number(at.y) || 0) - sourceY * next,
    },
    stage
  );
}

/** The enlarged picture, in the same coordinates as the stage it sits in. At
 *  the fitted zoom this is the stage box exactly. */
function contentBoxOf(stage, viewport) {
  if (!isDrawable(stage)) return EMPTY;
  const held = clampViewport(viewport || fittedViewport(), stage);
  return pixelBox(
    stage.left + held.x,
    stage.top + held.y,
    stage.width * held.zoom,
    stage.height * held.zoom
  );
}

/** A box as the wire carries it. Same numbers, same units — the shape differs
 *  only because a rectangle addressed by its origin is what a native view is
 *  placed with. */
function placeOf(box) {
  return {
    x: box.left,
    y: box.top,
    width: box.width,
    height: box.height,
  };
}

/** Everything the native monitor is placed with, from the panel it lives in.
 *
 *  Two rectangles: the stage, which clips, and the picture inside it, which
 *  zoom makes larger than the clip. Both are derived here in one pass from one
 *  measurement, so they cannot describe two different moments. */
function monitorPlaceOf(panel, project, viewport) {
  const stage = stageBoxOf(panel, project);
  return {
    stage: placeOf(stage),
    content: placeOf(contentBoxOf(stage, viewport)),
  };
}

/** Whether two placements are the same box, so a resize that fires on every
 *  frame of a drag does not become a command for every one of them. */
function samePlace(a, b) {
  if (!a || !b) return false;
  if (a.stage || b.stage) {
    return (
      samePlace(a.stage, b.stage) &&
      samePlace(a.content, b.content) &&
      a.backingScale === b.backingScale
    );
  }
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

const exported = {
  STAGE_PADDING,
  FIT_ZOOM,
  MAX_ZOOM,
  ZOOM_STEP,
  isDrawable,
  shapeOf,
  stageBoxOf,
  contentBoxOf,
  fittedViewport,
  clampViewport,
  zoomViewport,
  placeOf,
  monitorPlaceOf,
  samePlace,
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.geometryLib = exported;
}
})();
