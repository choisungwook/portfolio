'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  createMonitor, placeOf, monitorPlaceOf, samePlace, readChoice,
  fittedViewport, clampViewport, zoomViewport,
} = require('../src/monitor.js');

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

test('the native monitor keeps a clipped stage and a scaled picture separate', () => {
  const box = { left: 100, top: 50, width: 640, height: 360 };
  const place = monitorPlaceOf(box, { zoom: 2, x: -100, y: -40 }, 2);
  assert.deepStrictEqual(place.stage, { x: 200, y: 100, width: 1280, height: 720 });
  assert.deepStrictEqual(place.content, { x: 0, y: 20, width: 2560, height: 1440 });
});

test('zooming at the cursor keeps the source point under it', () => {
  const box = { width: 640, height: 360 };
  const cursor = { x: 480, y: 270 };
  const viewport = zoomViewport(fittedViewport(), box, cursor, 2);
  assert.deepStrictEqual(viewport, { zoom: 2, x: -480, y: -270 });
});

test('panning cannot expose space past an enlarged monitor edge', () => {
  const box = { width: 640, height: 360 };
  assert.deepStrictEqual(
    clampViewport({ zoom: 2, x: 20, y: -999 }, box),
    { zoom: 2, x: 0, y: -360 }
  );
});

test('panning against an edge does not place the unchanged viewport', async (t) => {
  const previousWindow = global.window;
  t.after(() => {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });
  global.window = { devicePixelRatio: 1 };
  const places = [];
  const preview = {
    mode: () => 'timeline',
    total: () => 1,
    pause: () => {},
    clear: () => {},
    clearExact: () => {},
  };
  const api = {
    available: true,
    playbackAttach: async () => ({ engine: 'native' }),
    playbackVisible: async () => {},
    playbackPlace: async (place) => places.push(place),
  };
  const stage = {
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }),
  };
  const monitor = createMonitor({ preview, stage, api });

  await monitor.attach();
  monitor.zoomTo(2);
  assert.strictEqual(monitor.panBy(10_000, 10_000), true);
  const placeCount = places.length;
  assert.strictEqual(monitor.panBy(1, 1), false);
  assert.strictEqual(places.length, placeCount);
});

test('the native monitor yields to the editor-only selection pass', async (t) => {
  const previousWindow = global.window;
  t.after(() => {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });
  global.window = { devicePixelRatio: 1 };
  const visibility = [];
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) },
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async (visible) => visibility.push(visible),
    },
  });

  await monitor.attach();
  monitor.setEditing(true);
  monitor.setEditing(false);
  await Promise.resolve();
  assert.deepStrictEqual(visibility, [true, false, true]);
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
    'refreshMedia', 'setEditing',
  ];
  const missing = asked.filter((name) => typeof monitor[name] !== 'function');
  assert.deepStrictEqual(missing, []);
});

test('a ready proxy waits for playback to stop before replacing the native session', async (t) => {
  const previousWindow = global.window;
  t.after(() => {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  });
  global.window = { devicePixelRatio: 1 };
  const calls = [];
  const preview = {
    mode: () => 'timeline',
    total: () => 100,
    pause: () => {},
    clear: () => {},
    clearExact: () => {},
    isPlaying: () => false,
    redraw: () => calls.push('previewRedraw'),
  };
  const api = {
    available: true,
    playbackAttach: async () => {
      calls.push('attach');
      return { engine: 'native' };
    },
    playbackRelease: async () => calls.push('release'),
    playbackVisible: async () => {},
    playbackPlay: async () => ({ position: 0, playing: true }),
    playbackPause: async () => {
      calls.push('pause');
      return { position: 10, playing: false };
    },
  };
  const monitor = createMonitor({
    preview,
    stage: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) },
    api,
    getProject: () => ({ settings: { rate: { numerator: 30, denominator: 1 } } }),
  });

  await monitor.attach();
  await monitor.play();
  await monitor.refreshMedia();
  assert.deepStrictEqual(calls, ['attach']);

  await monitor.pause();
  assert.deepStrictEqual(calls, ['attach', 'pause', 'release', 'attach']);
});

test('a ready proxy does not redraw playing media elements', async () => {
  let playing = true;
  let redraws = 0;
  const preview = new Proxy(
    {},
    {
      get: (_target, name) => {
        if (name === 'mode') return () => 'timeline';
        if (name === 'isPlaying') return () => playing;
        if (name === 'pause') return () => { playing = false; };
        if (name === 'redraw') return () => { redraws += 1; };
        return () => undefined;
      },
    }
  );
  const monitor = createMonitor({ preview, stage: null, api: { available: false } });

  await monitor.refreshMedia();
  assert.strictEqual(redraws, 0);

  await monitor.pause();
  assert.strictEqual(redraws, 1);
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

// --- when the native view may be on screen ---------------------------------
//
// The view sits over the webview and is not in the page's stacking order, so
// anything the page draws on the stage is behind it. Copilot caught the asset
// preview case on PR #762; these cover the whole rule, because the failure is
// invisible in every test that does not have a real window.

const { shouldShowMonitor } = require('../src/monitor.js');

const showing = { native: true, timeline: true, hasContent: true, covered: false };

test('a native monitor showing a timeline with clips on it is visible', () => {
  assert.strictEqual(shouldShowMonitor(showing), true);
});

test('an asset preview hides the view, or it covers the asset', () => {
  assert.strictEqual(shouldShowMonitor({ ...showing, timeline: false }), false);
});

test('an empty timeline hides the view, or it covers the drop hint', () => {
  assert.strictEqual(shouldShowMonitor({ ...showing, hasContent: false }), false);
});

test('a sheet or an open menu hides the view', () => {
  assert.strictEqual(shouldShowMonitor({ ...showing, covered: true }), false);
});

test('with no native session there is nothing to show', () => {
  assert.strictEqual(shouldShowMonitor({ ...showing, native: false }), false);
});

// The reason to make this one rule rather than a call at each covering site:
// two reasons to hide have to survive one of them going away. Closing a sheet
// while an asset is being previewed must not put the monitor back on top of it.
test('one reason going away does not reveal the view while another holds', () => {
  const both = { ...showing, timeline: false, covered: true };
  assert.strictEqual(shouldShowMonitor(both), false);
  assert.strictEqual(shouldShowMonitor({ ...both, covered: false }), false);
  assert.strictEqual(shouldShowMonitor({ ...both, timeline: true }), false);
});

test('the page defaults to the engine that is really playing before Rust answers', () => {
  // DEFAULT_SETTINGS in renderer.js is what is in force before bootstrap lands
  // and in a plain browser, and in both of those there is no IPC to attach a
  // monitor over. Rust's own default is native and overrides it.
  const source = require('node:fs').readFileSync(`${__dirname}/../src/renderer.js`, 'utf8');
  const defaults = source.slice(source.indexOf('const DEFAULT_SETTINGS'));
  const engine = defaults.match(/playbackEngine:\s*'([a-z-]+)'/);
  assert.ok(engine, 'DEFAULT_SETTINGS should carry a playback engine');
  assert.strictEqual(engine[1], 'media-element');
});
