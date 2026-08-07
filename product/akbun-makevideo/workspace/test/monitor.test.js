'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { placeOf, samePlace, readChoice } = require('../src/monitor.js');

// The page's half of the native viewport. Everything here is arithmetic over
// plain objects on purpose: the rest of monitor.js needs a window, an IPC
// bridge and a graphics device, and the parts that can be got wrong silently —
// a box in the wrong units, a fallback reported as a failure — are all in here.

test('a box is converted to physical pixels', () => {
  const box = { left: 100, top: 50, width: 640, height: 360 };
  assert.deepStrictEqual(placeOf(box, 1), { x: 100, y: 50, width: 640, height: 360 });
});

test('a retina display doubles every number, not only the size', () => {
  // The offset matters as much as the size. A view sized for the display and
  // positioned for CSS pixels lands in the top left quarter of where it should
  // be, which is the shape of this mistake when it happens.
  const box = { left: 100, top: 50, width: 640, height: 360 };
  assert.deepStrictEqual(placeOf(box, 2), { x: 200, y: 100, width: 1280, height: 720 });
});

test('a fractional layout lands on whole pixels', () => {
  const box = { left: 10.4, top: 20.6, width: 100.5, height: 50.2 };
  const place = placeOf(box, 1.5);
  for (const value of Object.values(place)) {
    assert.strictEqual(value, Math.round(value));
  }
});

test('a missing or nonsense ratio is treated as one', () => {
  const box = { left: 4, top: 8, width: 16, height: 32 };
  const expected = { x: 4, y: 8, width: 16, height: 32 };
  for (const ratio of [undefined, null, 0, -2, NaN, Infinity]) {
    assert.deepStrictEqual(placeOf(box, ratio), expected, String(ratio));
  }
});

test('a collapsed box never becomes a negative size', () => {
  const place = placeOf({ left: 0, top: 0, width: -10, height: -10 }, 2);
  assert.strictEqual(place.width, 0);
  assert.strictEqual(place.height, 0);
});

test('the same box twice is recognised, so a drag is not a command per frame', () => {
  const box = { x: 1, y: 2, width: 3, height: 4 };
  assert.ok(samePlace(box, { ...box }));
  assert.ok(!samePlace(box, { ...box, x: 2 }));
  assert.ok(!samePlace(box, { ...box, width: 5 }));
  assert.ok(!samePlace(null, box));
  assert.ok(!samePlace(box, null));
});

test('a native monitor is used and reports nothing', () => {
  assert.deepStrictEqual(readChoice({ engine: 'native', fellBack: null }), {
    native: true,
    notice: null,
  });
});

test('a fallback carries its reason to the page', () => {
  assert.deepStrictEqual(
    readChoice({ engine: 'media-element', fellBack: 'no graphics adapter' }),
    { native: false, notice: 'no graphics adapter' }
  );
});

// A preference and a fallback both end at the media elements, and only one of
// them is worth telling somebody about. Reporting the first would be the app
// complaining about a setting the user chose.
test('choosing media elements is not reported as a fallback', () => {
  assert.deepStrictEqual(readChoice({ engine: 'media-element', fellBack: null }), {
    native: false,
    notice: null,
  });
});

test('an answer that is not an answer leaves the page on media elements', () => {
  for (const answer of [null, undefined, 'native', 42]) {
    assert.deepStrictEqual(readChoice(answer), { native: false, notice: null }, String(answer));
  }
});

// The router stands in for `preview.js` everywhere in renderer.js, so a call it
// does not answer is a TypeError at the moment somebody presses a button rather
// than a failure anything catches. This is the list renderer.js actually calls.
test('the router answers everything the page asks a preview for', () => {
  const { createMonitor } = require('../src/monitor.js');
  const stub = new Proxy({}, { get: () => () => undefined });
  const monitor = createMonitor({
    preview: stub,
    stage: null,
    api: { available: false },
    getProject: () => null,
  });
  const asked = [
    'layout', 'play', 'pause', 'toggle', 'isPlaying', 'seek', 'position', 'total',
    'mode', 'prune', 'clear', 'showAsset', 'showTimeline', 'setQuality',
    'setScrubbing', 'setMuteWhileScrubbing', 'showExact', 'clearExact', 'isExact',
    'attach', 'release', 'place', 'redraw', 'setVisible', 'usesNativeMonitor',
  ];
  const missing = asked.filter((name) => typeof monitor[name] !== 'function');
  assert.deepStrictEqual(missing, []);
});

// With no monitor attached, every transport call has to reach the media element
// preview instead of being swallowed. This is the fallback actually working
// rather than the app going quiet.
test('with no monitor attached the transport reaches the media elements', () => {
  const { createMonitor } = require('../src/monitor.js');
  const called = [];
  const stub = new Proxy(
    {},
    {
      get: (_target, name) => (...args) => {
        called.push(name);
        return name === 'mode' ? 'timeline' : undefined;
      },
    }
  );
  const monitor = createMonitor({
    preview: stub,
    stage: null,
    api: { available: false },
    getProject: () => null,
  });
  monitor.play();
  monitor.pause();
  monitor.seek(42);
  assert.ok(called.includes('play'), 'play should have reached the preview');
  assert.ok(called.includes('pause'), 'pause should have reached the preview');
  assert.ok(called.includes('seek'), 'seek should have reached the preview');
  assert.strictEqual(monitor.usesNativeMonitor(), false);
});
