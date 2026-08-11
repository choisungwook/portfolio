'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { createMonitor, readChoice } = require('../src/monitor.js');

// The page's half of the native viewport: *when* to place a view, not where.
// Where is geometry.js, and it is tested there.
//
// Everything below drives the router itself. The rest of monitor.js needs a
// window, an IPC bridge and a graphics device, so what is exercised here is the
// part that can be got wrong silently — a command sent for a box that did not
// move, an attach that gave up on a panel that had not been laid out yet, a
// fallback reported as a failure.

/** A panel big enough to fit a picture in, which is all the monitor needs from
 *  the page to place a view over it. */
function panelStub(width = 640, height = 360, left = 0, top = 0) {
  return { getBoundingClientRect: () => ({ left, top, width, height }) };
}

test('panning against an edge does not place the unchanged viewport', async () => {
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
  const monitor = createMonitor({ preview, wrap: panelStub(), api });

  await monitor.attach();
  monitor.zoomTo(2);
  assert.strictEqual(monitor.panBy(10_000, 10_000), true);
  const placeCount = places.length;
  assert.strictEqual(monitor.panBy(1, 1), false);
  assert.strictEqual(places.length, placeCount);
});

test('the native monitor yields to the editor-only selection pass', async () => {
  const visibility = [];
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    wrap: panelStub(),
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

test('a page overlay keeps the preview in the webview', async () => {
  let attached = 0;
  const seeks = [];
  let overlayActive = false;
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
      seek: (frame) => seeks.push(frame),
    },
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => {
        attached += 1;
        return { engine: 'native' };
      },
      playbackSeek: async () => {},
      playbackVisible: async () => {},
    },
    pageOverlayActive: () => overlayActive,
  });

  await monitor.attach();
  monitor.seek(1);
  overlayActive = true;
  assert.strictEqual(await monitor.attach(), false);
  assert.strictEqual(attached, 1);
  assert.deepStrictEqual(seeks, [1]);
});

test('leaving native editing clears the page exact frame', async () => {
  let cleared = 0;
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => { cleared += 1; },
    },
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  monitor.setEditing(true);
  monitor.setEditing(false);
  const beforeClear = cleared;
  monitor.clearExact();
  assert.strictEqual(cleared, beforeClear + 1);
});

// --- the box moving without changing size ----------------------------------
//
// This is the failure the placement was rewritten for. A `ResizeObserver` on
// the stage fires on size and not on position, so a panel widening beside the
// preview, the inspector opening, or a scrollbar appearing left the native view
// where it was. It is over the webview and clipped by nothing, so it stayed on
// top of the timeline until something happened to resize it.

/** A panel whose box the test can move between calls, standing in for every
 *  reason a page can move a box without resizing it. */
function movablePanel(box) {
  const state = { ...box };
  return {
    element: { getBoundingClientRect: () => ({ ...state }) },
    moveTo(left, top) {
      state.left = left;
      state.top = top;
    },
    resizeTo(width, height) {
      state.width = width;
      state.height = height;
    },
  };
}

async function nativeMonitorOn(panel) {
  const places = [];
  let attachedAt = null;
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    wrap: panel.element,
    api: {
      available: true,
      playbackAttach: async (place) => {
        attachedAt = place;
        return { engine: 'native' };
      },
      playbackVisible: async () => {},
      playbackPlace: async (place) => places.push(place),
    },
  });
  await monitor.attach();
  return { monitor, places, attachedAt: () => attachedAt };
}

test('a stage that moves without resizing is placed again', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const { monitor, places, attachedAt } = await nativeMonitorOn(panel);
  const before = attachedAt().stage;

  panel.moveTo(240, 80);
  monitor.place();
  assert.strictEqual(places.length, 1);
  const after = places[0].stage;
  assert.deepStrictEqual(
    { dx: after.x - before.x, dy: after.y - before.y },
    { dx: 240, dy: 80 }
  );
  assert.strictEqual(after.width, before.width);
  assert.strictEqual(after.height, before.height);
});

test('the same box twice is one command, so a drag is not a command per frame', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const { monitor, places } = await nativeMonitorOn(panel);

  panel.resizeTo(600, 360);
  monitor.place();
  monitor.place();
  monitor.place();
  assert.strictEqual(places.length, 1);
});

test('the placement keeps the project shape as the panel changes', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    wrap: panel.element,
    getProject: () => ({ settings: { width: 1000, height: 1000 } }),
    api: {
      available: true,
      playbackAttach: async (place) => {
        assert.strictEqual(place.stage.width, place.stage.height);
        return { engine: 'native' };
      },
      playbackVisible: async () => {},
      playbackPlace: async (place) => {
        assert.strictEqual(place.stage.width, place.stage.height);
      },
    },
  });

  await monitor.attach();
  for (const [width, height] of [[900, 360], [200, 700], [1200, 1200]]) {
    panel.resizeTo(width, height);
    monitor.place();
  }
});

test('a panel dragged shut takes the view off screen, and reopening puts it back', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const visibility = [];
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    wrap: panel.element,
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async (visible) => visibility.push(visible),
      playbackPlace: async () => {},
    },
  });

  await monitor.attach();
  assert.deepStrictEqual(visibility, [true]);

  panel.resizeTo(0, 0);
  monitor.place();
  assert.deepStrictEqual(visibility, [true, false]);

  panel.resizeTo(640, 360);
  monitor.place();
  assert.deepStrictEqual(visibility, [true, false, true]);
});

// A panel with no room in it used to be a permanent fallback to the media
// elements: attach gave up and nothing asked again. The layout genuinely does
// settle over several frames when a project opens.
test('an attach with no room to draw in is finished once there is', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 0, height: 0 });
  let attached = 0;
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => {},
      clear: () => {},
      clearExact: () => {},
    },
    wrap: panel.element,
    api: {
      available: true,
      playbackAttach: async () => {
        attached += 1;
        return { engine: 'native' };
      },
      playbackVisible: async () => {},
      playbackPlace: async () => {},
    },
  });

  assert.strictEqual(await monitor.attach(), false);
  assert.strictEqual(attached, 0);
  assert.strictEqual(monitor.usesNativeMonitor(), false);

  panel.resizeTo(640, 360);
  assert.strictEqual(await monitor.attach(), true);
  assert.strictEqual(attached, 1);
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

test('a ready proxy waits for playback to stop before replacing the native session', async () => {
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
    wrap: panelStub(),
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

// Every method createPreview actually returns, and nothing else. A stub that
// answers any name at all is what let `preview.redraw()` — a method the media
// element preview has never had — sit in the refresh path until it threw in
// front of a user opening a project.
const PREVIEW_API = [
  'layout', 'play', 'pause', 'toggle', 'isPlaying', 'seek', 'position', 'total',
  'mode', 'prune', 'clear', 'showAsset', 'showTimeline', 'setQuality',
  'setScrubbing', 'setMuteWhileScrubbing', 'showExact', 'clearExact', 'isExact',
];

function strictPreviewStub(overrides) {
  const stub = {};
  for (const name of PREVIEW_API) stub[name] = () => undefined;
  return Object.assign(stub, overrides);
}

test('a ready proxy refreshes media elements without calling anything they do not have', async () => {
  let playing = true;
  const preview = strictPreviewStub({
    mode: () => 'timeline',
    isPlaying: () => playing,
    pause: () => {
      playing = false;
    },
  });
  const monitor = createMonitor({ preview, stage: null, api: { available: false } });

  // Playing: deferred. Stopped: taken. Neither may reach for a method that is
  // not on the object, which on a real preview is a TypeError.
  await monitor.refreshMedia();
  await monitor.pause();
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

const showing = {
  native: true, timeline: true, hasContent: true, roomy: true, covered: false,
};

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

// A panel dragged shut has no box to place a view at, and a view placed at
// nothing is a pixel of black in the corner rather than an absence.
test('a panel with no room in it hides the view', () => {
  assert.strictEqual(shouldShowMonitor({ ...showing, roomy: false }), false);
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

test('the page default compositor is not a value the setting can hold', () => {
  // DEFAULT_SETTINGS in renderer.js is what is in force before bootstrap lands
  // and in a plain browser, and in both of those there is no IPC to attach a
  // monitor over. The first attach is triggered by this differing from whatever
  // Rust sends back, so a real value here would mean a settings file holding
  // that same value never attaches at all.
  const source = require('node:fs').readFileSync(`${__dirname}/../src/renderer.js`, 'utf8');
  const defaults = source.slice(source.indexOf('const DEFAULT_SETTINGS'));
  const compositor = defaults.match(/compositor:\s*'([a-z-]*)'/);
  assert.ok(compositor, 'DEFAULT_SETTINGS should carry a compositor');
  assert.ok(
    !['gpu', 'cpu'].includes(compositor[1]),
    `DEFAULT_SETTINGS.compositor is "${compositor[1]}", which Rust can send back`
  );
});
