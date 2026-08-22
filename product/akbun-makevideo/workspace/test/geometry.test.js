'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const G = require('../src/geometry.js');

// Where the picture goes. All of it is arithmetic over plain objects, which is
// the point of the module: the two things that place a picture — the media
// element stack in the page and a native view over the webview — used to work
// it out separately, and the ways that goes wrong are silent. A box a pixel
// past its panel looks like nothing until the thing in it is not clipped by
// CSS, and then it is drawn over the timeline.

const HD = { settings: { width: 1920, height: 1080 } };
const SQUARE = { settings: { width: 1000, height: 1000 } };
const PAD = G.STAGE_PADDING;

/** A panel of the given size at the origin, plus its padding, so a test can
 *  name the room it means rather than the room plus fourteen twice. */
function panel(width, height, left = 0, top = 0) {
  return { left, top, width: width + PAD * 2, height: height + PAD * 2 };
}

test('the project shape decides the box, and it is centred in the panel', () => {
  const box = G.stageBoxOf(panel(800, 600), HD);
  assert.deepStrictEqual(box, {
    left: PAD,
    top: PAD + (600 - 450) / 2,
    width: 800,
    height: 450,
  });
});

test('a panel narrower than it is tall fits against the other edge', () => {
  const box = G.stageBoxOf(panel(400, 600), HD);
  assert.strictEqual(box.width, 400);
  assert.strictEqual(box.height, 225);
  assert.strictEqual(box.left, PAD);
  assert.strictEqual(box.top, Math.round(PAD + (600 - 225) / 2));
});

test('the panel offset is carried through, because the answer is placed as it is', () => {
  // The box is handed straight to a native view without a second measurement,
  // so it has to be in the coordinates it was measured in rather than relative
  // to the panel.
  const box = G.stageBoxOf(panel(800, 600, 320, 96), HD);
  assert.strictEqual(box.left, 320 + PAD);
  assert.strictEqual(box.top, 96 + PAD + 75);
});

// The bug this module was written for. A stage held up to a minimum size is
// wider than the panel holding it, and a native view is not in the page's
// stacking order, so the panel's `overflow: hidden` does not clip it — what
// hangs over the edge is drawn over the timeline.
test('a panel with no room in it has no box, rather than a small one', () => {
  for (const [width, height] of [[0, 600], [800, 0], [-100, 600]]) {
    const box = G.stageBoxOf({ left: 0, top: 0, width, height }, HD);
    assert.ok(!G.isDrawable(box), `${width}x${height}`);
  }
  // Padded past its own size is the same nothing: the room, not the panel, is
  // what a box is fitted into.
  assert.ok(!G.isDrawable(G.stageBoxOf({ left: 0, top: 0, width: 20, height: 20 }, HD, 10)));
});

test('the box fills the panel, because a monitor is not a picture with a margin', () => {
  const box = G.stageBoxOf({ left: 0, top: 0, width: 800, height: 600 }, HD);
  assert.strictEqual(box.left, 0);
  assert.strictEqual(box.width, 800);
});

test('a box never reaches past the panel it was fitted into', () => {
  // Sizes chosen to land on fractions: the failure is a rounded origin and a
  // rounded size each going up, which is a pixel over on the far edge.
  for (let width = 101; width < 400; width += 7) {
    for (let height = 97; height < 300; height += 11) {
      const room = panel(width, height, 10.5, 20.25);
      const box = G.stageBoxOf(room, HD);
      if (!G.isDrawable(box)) continue;
      assert.ok(box.left >= Math.floor(room.left), `${width}x${height} left`);
      assert.ok(
        box.left + box.width <= Math.ceil(room.left + room.width),
        `${width}x${height} right`
      );
      assert.ok(
        box.top + box.height <= Math.ceil(room.top + room.height),
        `${width}x${height} bottom`
      );
    }
  }
});

test('the shape survives rounding to whole pixels', () => {
  // Within a pixel each way. A width held to a floor while the height falls
  // past it is the stretched picture this replaced.
  for (let width = 60; width < 900; width += 13) {
    const box = G.stageBoxOf(panel(width, width), HD);
    if (!G.isDrawable(box)) continue;
    const wanted = box.width * (1080 / 1920);
    assert.ok(Math.abs(box.height - wanted) <= 1, `${width}: ${box.width}x${box.height}`);
  }
});

test('a square project is not given a widescreen box', () => {
  const box = G.stageBoxOf(panel(800, 600), SQUARE);
  assert.strictEqual(box.width, 600);
  assert.strictEqual(box.height, 600);
});

test('a project with no usable settings is treated as 1080p', () => {
  const expected = G.stageBoxOf(panel(800, 600), HD);
  for (const project of [null, {}, { settings: {} }, { settings: { width: 0, height: -4 } }]) {
    assert.deepStrictEqual(G.stageBoxOf(panel(800, 600), project), expected, String(project));
    assert.deepStrictEqual(G.shapeOf(project), { width: 1920, height: 1080 });
  }
});

test('a panel that is not there is not a box', () => {
  assert.ok(!G.isDrawable(G.stageBoxOf(null, HD)));
  assert.ok(!G.isDrawable(G.stageBoxOf({ width: NaN, height: NaN }, HD)));
});

test('the fitted picture is the stage box exactly', () => {
  const box = G.stageBoxOf(panel(800, 600, 40, 20), HD);
  assert.deepStrictEqual(G.contentBoxOf(box, G.fittedViewport()), box);
});

test('zoom enlarges the picture and leaves the clip alone', () => {
  const place = G.monitorPlaceOf(panel(800, 600), HD, { zoom: 2, x: -100, y: -40 });
  assert.deepStrictEqual(place.stage, { x: PAD, y: PAD + 75, width: 800, height: 450 });
  assert.deepStrictEqual(place.content, {
    x: PAD - 100,
    y: PAD + 75 - 40,
    width: 1600,
    height: 900,
  });
});

test('zooming at the cursor keeps the source point under it', () => {
  const box = { left: 0, top: 0, width: 640, height: 360 };
  assert.deepStrictEqual(G.zoomViewport(G.fittedViewport(), box, { x: 480, y: 270 }, 2), {
    zoom: 2,
    x: -480,
    y: -270,
  });
});

test('panning cannot expose space past an enlarged picture edge', () => {
  const box = { left: 0, top: 0, width: 640, height: 360 };
  assert.deepStrictEqual(G.clampViewport({ zoom: 2, x: 20, y: -999 }, box), {
    zoom: 2,
    x: 0,
    y: -360,
  });
});

test('zoom is held between fit and the maximum', () => {
  const box = { left: 0, top: 0, width: 640, height: 360 };
  assert.strictEqual(G.clampViewport({ zoom: 0.1, x: 0, y: 0 }, box).zoom, G.FIT_ZOOM);
  assert.strictEqual(G.clampViewport({ zoom: 99, x: 0, y: 0 }, box).zoom, G.MAX_ZOOM);
});

// A panel dragged narrower under an enlarged picture leaves a pan offset that
// was legal against the old box and is not against the new one. Holding it at
// the point it is used means the caller cannot forget to.
test('a shrinking box pulls an enlarged picture back against its edges', () => {
  const wide = { left: 0, top: 0, width: 800, height: 450 };
  const narrow = { left: 0, top: 0, width: 200, height: 112 };
  const panned = G.clampViewport({ zoom: 2, x: -700, y: -400 }, wide);
  assert.deepStrictEqual(G.clampViewport(panned, narrow), { zoom: 2, x: -200, y: -112 });
});

test('the same box twice is recognised, so a drag is not a command per frame', () => {
  const box = { x: 1, y: 2, width: 3, height: 4 };
  assert.ok(G.samePlace(box, { ...box }));
  assert.ok(!G.samePlace(box, { ...box, x: 2 }));
  assert.ok(!G.samePlace(box, { ...box, width: 5 }));
  assert.ok(!G.samePlace(null, box));
  assert.ok(!G.samePlace(box, null));
});

test('a monitor placement compares both of its rectangles', () => {
  const place = G.monitorPlaceOf(panel(800, 600), HD, G.fittedViewport());
  assert.ok(G.samePlace(place, G.monitorPlaceOf(panel(800, 600), HD, G.fittedViewport())));
  assert.ok(!G.samePlace(place, G.monitorPlaceOf(panel(800, 600), HD, { zoom: 2, x: 0, y: 0 })));
  assert.ok(!G.samePlace(place, G.monitorPlaceOf(panel(400, 600), HD, G.fittedViewport())));
});

// Same panel, same project: the media element stack and the native view are
// laid out from one answer, so there is nothing left for them to disagree
// about. Measuring one off the other is what put them a frame apart.
test('the page and the native view are given the same box', () => {
  const room = panel(801, 601, 33, 17);
  const box = G.stageBoxOf(room, HD);
  assert.deepStrictEqual(G.monitorPlaceOf(room, HD, G.fittedViewport()).stage, G.placeOf(box));
});
