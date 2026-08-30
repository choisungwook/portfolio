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

test('a rejected visibility change is retried while the same cover remains', async () => {
  const visibility = [];
  let rejectedHide = false;
  const monitor = createMonitor({
    preview: strictPreviewStub({ mode: () => 'timeline', total: () => 1 }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async (visible) => {
        visibility.push(visible);
        if (!visible && !rejectedHide) {
          rejectedHide = true;
          throw new Error('view was being replaced');
        }
      },
    },
  });

  await monitor.attach();
  monitor.setVisible(false);
  await new Promise((resolve) => setImmediate(resolve));
  monitor.place();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(visibility, [true, false, false]);
});

test('visibility changes reach the backend in the order the page chose them', async () => {
  const visibility = [];
  let finishHide;
  const hideAnswer = new Promise((resolve) => {
    finishHide = resolve;
  });
  const monitor = createMonitor({
    preview: strictPreviewStub({ mode: () => 'timeline', total: () => 1 }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: (visible) => {
        visibility.push(visible);
        return visible || visibility.length === 1 ? Promise.resolve() : hideAnswer;
      },
    },
  });

  await monitor.attach();
  await new Promise((resolve) => setImmediate(resolve));
  monitor.setVisible(false);
  monitor.setVisible(true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(visibility, [true, false]);

  finishHide();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(visibility, [true, false, true]);
});

test('a page overlay keeps the preview in the webview', async () => {
  let attached = 0;
  let released = 0;
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
      playbackRelease: async () => {
        released += 1;
      },
      playbackSeek: async () => {},
      playbackVisible: async () => {},
    },
    pageOverlayActive: () => overlayActive,
  });

  await monitor.attach();
  await monitor.seek(1);
  overlayActive = true;
  assert.strictEqual(await monitor.attach(), false);
  assert.strictEqual(attached, 1);
  assert.strictEqual(released, 1);
  assert.strictEqual(monitor.usesNativeMonitor(), false);
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

test('a rejected placement is retried for the unchanged box', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  let attempts = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({ mode: () => 'timeline', total: () => 1 }),
    wrap: panel.element,
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async () => {},
      playbackPlace: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('surface was busy');
      },
    },
  });

  await monitor.attach();
  panel.moveTo(100, 0);
  monitor.place();
  await new Promise((resolve) => setImmediate(resolve));
  monitor.place();
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(attempts, 2);
});

test('a backing scale change places the unchanged viewport again', async () => {
  const previousWindow = global.window;
  global.window = { devicePixelRatio: 1 };
  try {
    const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
    const { monitor, places } = await nativeMonitorOn(panel);

    global.window.devicePixelRatio = 2;
    monitor.place();
    assert.strictEqual(places.length, 1);
    assert.strictEqual(places[0].backingScale, 2);
  } finally {
    if (previousWindow === undefined) delete global.window;
    else global.window = previousWindow;
  }
});

test('slow native placement keeps only the newest measured box', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const places = [];
  let attachedAt;
  let finishFirst;
  const firstPlace = new Promise((resolve) => { finishFirst = resolve; });
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
      playbackPlace: async (place) => {
        places.push(place);
        if (places.length === 1) await firstPlace;
      },
    },
  });

  await monitor.attach();
  panel.moveTo(100, 0);
  monitor.place();
  panel.moveTo(200, 0);
  monitor.place();
  panel.moveTo(300, 0);
  monitor.place();
  assert.strictEqual(places.length, 1);

  finishFirst();
  await new Promise((resolve) => setImmediate(resolve));
  assert.strictEqual(places.length, 2);
  assert.strictEqual(places[1].stage.x - attachedAt.stage.x, 300);
});

test('release discards an old pending placement before the replacement attach', async () => {
  const panel = movablePanel({ left: 0, top: 0, width: 640, height: 360 });
  const places = [];
  let finishFirst;
  const firstPlace = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 1,
    }),
    wrap: panel.element,
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackVisible: async () => {},
      playbackPlace: async (place) => {
        places.push(place);
        if (places.length === 1) await firstPlace;
      },
    },
  });

  await monitor.attach();
  panel.moveTo(100, 0);
  monitor.place();
  panel.moveTo(200, 0);
  monitor.place();

  await monitor.release();
  panel.moveTo(300, 0);
  await monitor.attach();
  finishFirst();
  await new Promise((resolve) => setImmediate(resolve));

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
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(visibility, [true, false, true]);
});

test('a stale visibility command is corrected on the replacement session', async () => {
  let finishHidden;
  const hiddenAnswer = new Promise((resolve) => {
    finishHidden = resolve;
  });
  let delayedHidden = true;
  const visibility = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 1,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackVisible: (visible) => {
        visibility.push(visible);
        if (!visible && delayedHidden) {
          delayedHidden = false;
          return hiddenAnswer;
        }
        return Promise.resolve();
      },
    },
  });

  await monitor.attach();
  monitor.setVisible(false);
  await monitor.release();
  await monitor.attach();
  finishHidden();
  await new Promise((resolve) => setImmediate(resolve));
  monitor.place();

  assert.deepStrictEqual(visibility, [true, false, true, true]);
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

test('release invalidates a late native attach answer', async () => {
  let answerAttach;
  const attachAnswer = new Promise((resolve) => {
    answerAttach = resolve;
  });
  const mediaCalls = [];
  const notices = [];
  const monitor = createMonitor({
    preview: {
      mode: () => 'timeline',
      total: () => 1,
      pause: () => mediaCalls.push('pause'),
      clear: () => mediaCalls.push('clear'),
      clearExact: () => mediaCalls.push('clearExact'),
    },
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: () => attachAnswer,
      playbackRelease: async () => {},
      playbackVisible: async () => {},
    },
    onNotice: (notice) => notices.push(notice),
  });

  const pendingAttach = monitor.attach();
  await monitor.release();
  answerAttach({ engine: 'native', fellBack: 'late answer' });

  assert.strictEqual(await pendingAttach, false);
  assert.strictEqual(monitor.usesNativeMonitor(), false);
  assert.deepStrictEqual(mediaCalls, []);
  assert.deepStrictEqual(notices, []);
});

test('concurrent releases share one backend release before a new attach', async () => {
  let finishRelease;
  const releaseAnswer = new Promise((resolve) => {
    finishRelease = resolve;
  });
  let attached = 0;
  let released = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 1,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => {
        attached += 1;
        return { engine: 'native' };
      },
      playbackRelease: () => {
        released += 1;
        return releaseAnswer;
      },
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  const first = monitor.release();
  const second = monitor.release();
  assert.strictEqual(released, 1);
  finishRelease();
  await Promise.all([first, second]);
  await monitor.attach();

  assert.strictEqual(attached, 2);
  assert.strictEqual(monitor.usesNativeMonitor(), true);
});

test('an idempotent native attach adopts backend status when no input raced it', async () => {
  let attaches = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => 0,
      isPlaying: () => false,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => {
        attaches += 1;
        return attaches === 1
          ? { engine: 'native', status: { position: 12, playing: true } }
          : { engine: 'native', status: { position: 19, playing: false } };
      },
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  assert.strictEqual(monitor.position(), 12);
  assert.strictEqual(monitor.isPlaying(), true);
  await monitor.attach();
  assert.strictEqual(monitor.position(), 19);
  assert.strictEqual(monitor.isPlaying(), false);
});

test('a rejected idempotent attach keeps the existing native session as the only owner', async () => {
  let attaches = 0;
  const mediaSeeks = [];
  let mediaPlays = 0;
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => 0,
      isPlaying: () => false,
      seek: (target) => mediaSeeks.push(target),
      play: () => {
        mediaPlays += 1;
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => {
        attaches += 1;
        if (attaches === 2) throw new Error('placement request failed');
        return { engine: 'native', status: { ...backend } };
      },
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        backend.position = target;
        return { ...backend };
      },
      playbackPlay: async () => {
        backend.playing = true;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  await monitor.seek(42);
  await monitor.play();

  assert.strictEqual(await monitor.attach(), true);
  assert.strictEqual(monitor.usesNativeMonitor(), true);
  assert.strictEqual(monitor.position(), 42);
  assert.strictEqual(monitor.isPlaying(), true);
  assert.deepStrictEqual(mediaSeeks, []);
  assert.strictEqual(mediaPlays, 0);
});

test('an idempotent timeline attach does not stop the asset preview', async () => {
  let mode = 'timeline';
  let mediaPosition = 0;
  let mediaPlaying = false;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => mode,
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      seek: (target) => {
        mediaPosition = target;
      },
      play: () => {
        mediaPlaying = true;
      },
      pause: () => {
        mediaPlaying = false;
      },
      clear: () => {
        mediaPosition = 0;
        mediaPlaying = false;
      },
      showAsset: () => {
        mode = 'asset';
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({
        engine: 'native',
        status: { position: 0, playing: false },
      }),
      playbackVisible: async () => {},
      playbackPause: async () => ({ position: 0, playing: false }),
    },
  });

  await monitor.attach();
  monitor.showAsset({ id: 'asset' });
  monitor.seek(37);
  monitor.play();
  await monitor.attach();

  assert.strictEqual(monitor.position(), 37);
  assert.strictEqual(monitor.isPlaying(), true);
  assert.deepStrictEqual({ position: mediaPosition, playing: mediaPlaying }, {
    position: 37,
    playing: true,
  });
});

test('an asset preview cannot restart a paused fallback timeline during native attach', async () => {
  let mode = 'timeline';
  let mediaPosition = 0;
  let mediaPlaying = false;
  let attaches = 0;
  let clearedTimeline = 0;
  const calls = [];
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => mode,
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      seek: (target) => {
        mediaPosition = target;
      },
      play: () => {
        mediaPlaying = true;
      },
      pause: () => {
        mediaPlaying = false;
      },
      showAsset: () => {
        mediaPlaying = false;
        mediaPosition = 0;
        mode = 'asset';
      },
      clearTimeline: () => {
        clearedTimeline += 1;
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async (_place, frame) => {
        attaches += 1;
        if (attaches === 1) return { engine: 'media-element' };
        backend.position = frame;
        backend.playing = false;
        return { engine: 'native', status: { ...backend } };
      },
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        calls.push(`seek:${target}`);
        backend.position = target;
        return { ...backend };
      },
      playbackPlay: async () => {
        calls.push('play');
        backend.playing = true;
        return { ...backend };
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  assert.strictEqual(await monitor.attach(), false);
  monitor.seek(12);
  monitor.play();
  monitor.showAsset({ id: 'asset' });
  assert.strictEqual(await monitor.attach(), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(calls, ['seek:12', 'pause']);
  assert.deepStrictEqual(backend, { position: 12, playing: false });
  assert.strictEqual(mediaPlaying, false);
  assert.strictEqual(clearedTimeline, 1);
});

test('returning from an asset resets the native timeline before it plays', async () => {
  let mode = 'timeline';
  let mediaPosition = 0;
  let mediaPlaying = false;
  const calls = [];
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => mode,
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      pause: () => {
        mediaPlaying = false;
      },
      clear: () => {
        mediaPosition = 0;
        mediaPlaying = false;
      },
      showAsset: () => {
        mode = 'asset';
        mediaPosition = 0;
        mediaPlaying = false;
      },
      showTimeline: () => {
        mode = 'timeline';
        mediaPosition = 0;
        mediaPlaying = false;
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({
        engine: 'native',
        status: { ...backend },
      }),
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        calls.push(`seek:${target}`);
        backend.position = target;
        return { ...backend };
      },
      playbackPlay: async () => {
        calls.push('play');
        backend.playing = true;
        return { ...backend };
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  await monitor.seek(42);
  monitor.showAsset({ id: 'asset' });
  await new Promise((resolve) => setImmediate(resolve));
  monitor.showTimeline();
  await new Promise((resolve) => setImmediate(resolve));
  await monitor.play();

  assert.deepStrictEqual(calls, ['seek:42', 'pause', 'seek:0', 'pause', 'play']);
  assert.deepStrictEqual(backend, { position: 0, playing: true });
  assert.strictEqual(monitor.position(), 0);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('returning from an asset queues its reset behind an in-flight native seek', async () => {
  let mode = 'timeline';
  let answerOldSeek;
  const oldSeekAnswer = new Promise((resolve) => {
    answerOldSeek = resolve;
  });
  const calls = [];
  let seekCalls = 0;
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => mode,
      total: () => 100,
      showAsset: () => {
        mode = 'asset';
      },
      showTimeline: () => {
        mode = 'timeline';
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native', status: { ...backend } }),
      playbackVisible: async () => {},
      playbackSeek: (target) => {
        calls.push(`seek:${target}`);
        seekCalls += 1;
        if (seekCalls === 1) return oldSeekAnswer;
        backend.position = target;
        return Promise.resolve({ ...backend });
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  const oldSeek = monitor.seek(42);
  await new Promise((resolve) => setImmediate(resolve));
  monitor.showAsset({ id: 'asset' });
  monitor.showTimeline();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(calls, ['seek:42']);

  backend.position = 42;
  answerOldSeek({ ...backend });
  await oldSeek;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(calls, ['seek:42', 'pause', 'seek:0', 'pause']);
  assert.deepStrictEqual(backend, { position: 0, playing: false });
  assert.strictEqual(monitor.position(), 0);
  assert.strictEqual(monitor.isPlaying(), false);
});

test('release for a replacement keeps the native playhead instead of the cleared preview', async () => {
  let mediaPosition = 0;
  let mediaPlaying = false;
  const attachedFrames = [];
  const replacementCalls = [];
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      seek: (target) => { mediaPosition = target; },
      play: () => { mediaPlaying = true; },
      pause: () => { mediaPlaying = false; },
      clear: () => {
        mediaPosition = 0;
        mediaPlaying = false;
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async (_place, frame) => {
        attachedFrames.push(frame);
        backend.position = frame;
        backend.playing = false;
        return { engine: 'native', status: { ...backend } };
      },
      playbackRelease: async () => {},
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        replacementCalls.push(`seek:${target}`);
        backend.position = target;
        return { ...backend };
      },
      playbackPlay: async () => {
        replacementCalls.push('play');
        backend.playing = true;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  await monitor.seek(42);
  await monitor.play();
  replacementCalls.length = 0;
  await monitor.release();
  assert.strictEqual(monitor.position(), 42);
  assert.strictEqual(monitor.isPlaying(), true);
  await monitor.attach();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(attachedFrames, [0, 42]);
  assert.deepStrictEqual(replacementCalls, ['seek:42', 'play']);
  assert.deepStrictEqual(backend, { position: 42, playing: true });
});

test('a pending seek cannot make a replacement forget that playback was running', async () => {
  let answerOldSeek;
  const oldSeekAnswer = new Promise((resolve) => {
    answerOldSeek = resolve;
  });
  const calls = [];
  let seekCalls = 0;
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => 0,
      isPlaying: () => false,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async (_place, frame) => {
        calls.push(`attach:${frame}`);
        backend.position = frame;
        backend.playing = false;
        return { engine: 'native', status: { ...backend } };
      },
      playbackRelease: async () => {
        calls.push('release');
        backend.playing = false;
      },
      playbackVisible: async () => {},
      playbackSeek: (target) => {
        calls.push(`seek:${target}`);
        seekCalls += 1;
        if (seekCalls === 1) return oldSeekAnswer;
        backend.position = target;
        return Promise.resolve({ ...backend });
      },
      playbackPlay: async () => {
        calls.push('play');
        backend.playing = true;
        return { ...backend };
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  await monitor.play();
  const pendingSeek = monitor.seek(42);
  await new Promise((resolve) => setImmediate(resolve));
  await monitor.release();
  await monitor.attach();
  answerOldSeek({ position: 42, playing: true });
  await pendingSeek;
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(calls, [
    'attach:0',
    'play',
    'seek:42',
    'release',
    'attach:42',
    'seek:42',
    'play',
  ]);
  assert.deepStrictEqual(backend, { position: 42, playing: true });
  assert.strictEqual(monitor.position(), 42);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('a paused replacement applies only the newest rapid seek', async () => {
  let answerOldSeek;
  const oldSeekAnswer = new Promise((resolve) => {
    answerOldSeek = resolve;
  });
  const calls = [];
  let seekCalls = 0;
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async (_place, frame) => {
        calls.push(`attach:${frame}`);
        backend.position = frame;
        backend.playing = false;
        return { engine: 'native', status: { ...backend } };
      },
      playbackRelease: async () => {
        calls.push('release');
      },
      playbackVisible: async () => {},
      playbackSeek: (target) => {
        calls.push(`seek:${target}`);
        seekCalls += 1;
        if (seekCalls === 1) return oldSeekAnswer;
        backend.position = target;
        return Promise.resolve({ ...backend });
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  await monitor.attach();
  const oldSeek = monitor.seek(10);
  const latestSeek = monitor.seek(20);
  await new Promise((resolve) => setImmediate(resolve));
  await monitor.release();
  await monitor.attach();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(calls, [
    'attach:0',
    'seek:10',
    'release',
    'attach:20',
    'seek:20',
    'pause',
  ]);
  assert.deepStrictEqual(backend, { position: 20, playing: false });

  answerOldSeek({ position: 10, playing: false });
  await Promise.all([oldSeek, latestSeek]);
  assert.deepStrictEqual(backend, { position: 20, playing: false });
  assert.strictEqual(monitor.position(), 20);
  assert.strictEqual(monitor.isPlaying(), false);
});

test('a rejected replacement attach hands the preserved native state to the preview', async () => {
  let mediaPosition = 0;
  let mediaPlaying = false;
  let attaches = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      seek: (target) => { mediaPosition = target; },
      play: () => { mediaPlaying = true; },
      pause: () => { mediaPlaying = false; },
      clear: () => {
        mediaPosition = 0;
        mediaPlaying = false;
      },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => {
        attaches += 1;
        if (attaches === 2) throw new Error('native surface unavailable');
        return { engine: 'native', status: { position: 0, playing: false } };
      },
      playbackRelease: async () => {},
      playbackVisible: async () => {},
      playbackSeek: async (target) => ({ position: target, playing: false }),
      playbackPlay: async () => ({ position: 42, playing: true }),
    },
  });

  await monitor.attach();
  await monitor.seek(42);
  await monitor.play();
  await monitor.release();
  assert.strictEqual(await monitor.attach(), false);

  assert.deepStrictEqual({ position: mediaPosition, playing: mediaPlaying }, {
    position: 42,
    playing: true,
  });
  assert.strictEqual(monitor.position(), 42);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('timeline input and playback progress during attach are reasserted natively', async () => {
  let mediaPosition = 0;
  let mediaPlaying = false;
  let answerAttach;
  const attachAnswer = new Promise((resolve) => {
    answerAttach = resolve;
  });
  const calls = [];
  const backend = { position: 0, playing: false };
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      play: () => { mediaPlaying = true; },
      pause: () => { mediaPlaying = false; },
      seek: (target) => { mediaPosition = target; },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: (_place, frame) => {
        calls.push(`attach:${frame}`);
        return attachAnswer;
      },
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        calls.push(`seek:${target}`);
        backend.position = target;
        return { ...backend };
      },
      playbackPlay: async () => {
        calls.push('play');
        backend.playing = true;
        return { ...backend };
      },
      playbackPause: async () => {
        calls.push('pause');
        backend.playing = false;
        return { ...backend };
      },
    },
  });

  const attaching = monitor.attach();
  monitor.play();
  monitor.seek(42);
  assert.deepStrictEqual({ position: mediaPosition, playing: mediaPlaying }, {
    position: 42,
    playing: true,
  });
  mediaPosition = 57;

  answerAttach({ engine: 'native', status: { position: 0, playing: false } });
  assert.strictEqual(await attaching, true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(calls, ['attach:0', 'seek:57', 'play']);
  assert.deepStrictEqual(backend, { position: 57, playing: true });
  assert.strictEqual(monitor.position(), 57);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('fallback playback progress becomes the next native attach snapshot', async () => {
  let mediaPosition = 0;
  let mediaPlaying = false;
  const attachedFrames = [];
  const calls = [];
  let attaches = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
      position: () => mediaPosition,
      isPlaying: () => mediaPlaying,
      play: () => { mediaPlaying = true; },
      pause: () => { mediaPlaying = false; },
      seek: (target) => { mediaPosition = target; },
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async (_place, frame) => {
        attachedFrames.push(frame);
        attaches += 1;
        return attaches === 1
          ? { engine: 'media-element', status: null }
          : { engine: 'native', status: { position: frame, playing: false } };
      },
      playbackVisible: async () => {},
      playbackSeek: async (target) => {
        calls.push(`seek:${target}`);
        return { position: target, playing: false };
      },
      playbackPlay: async () => {
        calls.push('play');
        return { position: mediaPosition, playing: true };
      },
      playbackPause: async () => ({ position: mediaPosition, playing: false }),
    },
  });

  assert.strictEqual(await monitor.attach(), false);
  monitor.seek(42);
  monitor.play();
  mediaPosition = 57;
  assert.strictEqual(await monitor.attach(), true);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(attachedFrames, [0, 57]);
  assert.deepStrictEqual(calls, ['seek:57', 'play']);
  assert.strictEqual(monitor.position(), 57);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('a late transport answer cannot overwrite a newly attached session', async () => {
  let answerPause;
  const pauseAnswer = new Promise((resolve) => {
    answerPause = resolve;
  });
  let pauses = 0;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackPause: () => {
        pauses += 1;
        return pauses === 1
          ? pauseAnswer
          : Promise.resolve({ position: 5, playing: false });
      },
      playbackSeek: async () => {},
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  const oldPause = monitor.pause();
  await monitor.release();
  await monitor.attach();
  const newSeek = monitor.seek(5);
  answerPause({ position: 77, playing: false });
  await Promise.all([oldPause, newSeek]);

  assert.strictEqual(monitor.position(), 5);
});

test('a stale seek command is corrected to the replacement playhead', async () => {
  let answerOldSeek;
  const oldSeekAnswer = new Promise((resolve) => {
    answerOldSeek = resolve;
  });
  const seeks = [];
  const ticks = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackSeek: (target) => {
        seeks.push(target);
        if (seeks.length === 1) return oldSeekAnswer;
        if (seeks.length === 3) {
          return Promise.resolve({ position: 20, playing: false });
        }
        return Promise.resolve({ position: target, playing: false });
      },
      playbackVisible: async () => {},
    },
    onTick: (position, playing) => ticks.push([position, playing]),
  });

  await monitor.attach();
  const oldSeek = monitor.seek(77);
  await new Promise((resolve) => setImmediate(resolve));
  monitor.clear();
  await monitor.release();
  await monitor.attach();
  const newSeek = monitor.seek(5);
  answerOldSeek({ position: 77, playing: false });
  await Promise.all([oldSeek, newSeek]);
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepStrictEqual(seeks, [77, 5]);
  assert.strictEqual(monitor.position(), 5);
  assert.ok(!ticks.some(([position]) => position === 20));
});

test('a newer seek wins while an old session correction is queued', async () => {
  let answerOldSeek;
  const oldSeekAnswer = new Promise((resolve) => {
    answerOldSeek = resolve;
  });
  const seeks = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackSeek: (target) => {
        seeks.push(target);
        return seeks.length === 1
          ? oldSeekAnswer
          : Promise.resolve({ position: target, playing: false });
      },
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  const oldSeek = monitor.seek(77);
  await new Promise((resolve) => setImmediate(resolve));
  await monitor.release();
  await monitor.attach();
  const latestSeek = monitor.seek(9);
  answerOldSeek({ position: 77, playing: false });
  await Promise.all([oldSeek, latestSeek]);

  assert.deepStrictEqual(seeks, [77, 77, 9]);
  assert.strictEqual(monitor.position(), 9);
});

test('a rejected old play is reasserted on the replacement session', async () => {
  let rejectOldPlay;
  const oldPlayAnswer = new Promise((_resolve, reject) => {
    rejectOldPlay = reject;
  });
  let plays = 0;
  let backendPlaying = false;
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackRelease: async () => {},
      playbackPlay: () => {
        plays += 1;
        if (plays === 1) return oldPlayAnswer;
        backendPlaying = true;
        return Promise.resolve({ position: 0, playing: true });
      },
      playbackVisible: async () => {},
    },
  });

  await monitor.attach();
  const oldPlay = monitor.play();
  await new Promise((resolve) => setImmediate(resolve));
  await monitor.release();
  await monitor.attach();
  rejectOldPlay(new Error('old session stopped'));
  await oldPlay;
  await new Promise((resolve) => setImmediate(resolve));

  assert.strictEqual(plays, 2);
  assert.strictEqual(backendPlaying, true);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('acknowledged native commands confirm the optimistic transport state', async () => {
  const ticks = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async () => {},
      playbackSeek: async () => ({ position: 40, playing: false }),
      playbackPlay: async () => ({ position: 40, playing: true }),
      playbackPause: async () => ({ position: 40, playing: false }),
    },
    onTick: (position, playing) => ticks.push([position, playing]),
  });

  await monitor.attach();
  await monitor.seek(40);
  assert.deepStrictEqual(ticks.at(-1), [40, false]);
  assert.strictEqual(monitor.position(), 40);

  await monitor.play();
  assert.deepStrictEqual(ticks.at(-1), [40, true]);
  assert.strictEqual(monitor.isPlaying(), true);

  await monitor.pause();
  assert.deepStrictEqual(ticks.at(-1), [40, false]);
  assert.strictEqual(monitor.isPlaying(), false);
});

test('a same-turn seek is applied before the following play', async () => {
  let answerSeek;
  const seekAnswer = new Promise((resolve) => {
    answerSeek = resolve;
  });
  const calls = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: async () => ({ engine: 'native' }),
      playbackVisible: async () => {},
      playbackSeek: (target) => {
        calls.push(`seek:${target}`);
        return seekAnswer;
      },
      playbackPlay: async () => {
        calls.push('play');
        return { position: 40, playing: true };
      },
    },
  });

  await monitor.attach();
  const seeking = monitor.seek(40);
  const playing = monitor.play();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(calls, ['seek:40']);

  answerSeek({ position: 40, playing: false });
  await Promise.all([seeking, playing]);
  assert.deepStrictEqual(calls, ['seek:40', 'play']);
  assert.strictEqual(monitor.position(), 40);
  assert.strictEqual(monitor.isPlaying(), true);
});

test('a status poll started before a seek cannot rewind the new intent', async () => {
  const previousAnimationFrame = global.requestAnimationFrame;
  let nextFrame;
  global.requestAnimationFrame = (callback) => {
    nextFrame = callback;
  };
  let answerStatus;
  const statusAnswer = new Promise((resolve) => {
    answerStatus = resolve;
  });

  try {
    const monitor = createMonitor({
      preview: strictPreviewStub({
        mode: () => 'timeline',
        total: () => 100,
      }),
      wrap: panelStub(),
      api: {
        available: true,
        playbackAttach: async () => ({ engine: 'native' }),
        playbackVisible: async () => {},
        playbackStatus: () => statusAnswer,
        playbackSeek: async () => ({ position: 40, playing: false }),
      },
    });

    await monitor.attach();
    nextFrame();
    await monitor.seek(40);
    answerStatus({ position: 3, playing: false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(monitor.position(), 40);
  } finally {
    if (previousAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousAnimationFrame;
  }
});

test('a status poll cannot outrun an unacknowledged seek command', async () => {
  const previousAnimationFrame = global.requestAnimationFrame;
  let nextFrame;
  global.requestAnimationFrame = (callback) => {
    nextFrame = callback;
  };
  let answerStatus;
  let answerSeek;
  const statusAnswer = new Promise((resolve) => {
    answerStatus = resolve;
  });
  const seekAnswer = new Promise((resolve) => {
    answerSeek = resolve;
  });

  try {
    const monitor = createMonitor({
      preview: strictPreviewStub({
        mode: () => 'timeline',
        total: () => 100,
      }),
      wrap: panelStub(),
      api: {
        available: true,
        playbackAttach: async () => ({ engine: 'native' }),
        playbackVisible: async () => {},
        playbackStatus: () => statusAnswer,
        playbackSeek: () => seekAnswer,
      },
    });

    await monitor.attach();
    const seeking = monitor.seek(40);
    nextFrame();
    answerStatus({ position: 3, playing: false });
    await new Promise((resolve) => setImmediate(resolve));
    assert.strictEqual(monitor.position(), 40);

    answerSeek({ position: 40, playing: false });
    await seeking;
  } finally {
    if (previousAnimationFrame === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousAnimationFrame;
  }
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

test('a ready proxy refreshes a playing native session without replacing it', async () => {
  const calls = [];
  const ticks = [];
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
    playbackRefresh: async () => {
      calls.push('refresh');
      return { position: 12, playing: true };
    },
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
    onTick: (position, playing) => ticks.push([position, playing]),
  });

  await monitor.attach();
  await monitor.play();
  await monitor.refreshMedia();
  assert.deepStrictEqual(calls, ['attach', 'refresh']);
  assert.strictEqual(monitor.position(), 12);
  assert.strictEqual(monitor.isPlaying(), true);
  assert.deepStrictEqual(ticks.at(-1), [12, true]);

  await monitor.pause();
  assert.deepStrictEqual(calls, ['attach', 'refresh', 'pause']);
});

test('a proxy ready during attach still reaches the backend session gate', async () => {
  let answerAttach;
  let answerRefresh;
  const attachAnswer = new Promise((resolve) => {
    answerAttach = resolve;
  });
  const refreshAnswer = new Promise((resolve) => {
    answerRefresh = resolve;
  });
  const calls = [];
  const monitor = createMonitor({
    preview: strictPreviewStub({
      mode: () => 'timeline',
      total: () => 100,
    }),
    wrap: panelStub(),
    api: {
      available: true,
      playbackAttach: () => {
        calls.push('attach');
        return attachAnswer;
      },
      playbackRefresh: () => {
        calls.push('refresh');
        return refreshAnswer;
      },
      playbackVisible: async () => {},
    },
  });

  const attaching = monitor.attach();
  const refreshing = monitor.refreshMedia();
  assert.deepStrictEqual(calls, ['attach', 'refresh']);

  answerAttach({ engine: 'native' });
  answerRefresh({ position: 0, playing: false });
  assert.strictEqual(await attaching, true);
  await refreshing;
});

// Every method createPreview actually returns, and nothing else. A stub that
// answers any name at all is what let `preview.redraw()` — a method the media
// element preview has never had — sit in the refresh path until it threw in
// front of a user opening a project.
const PREVIEW_API = [
  'layout', 'play', 'pause', 'toggle', 'isPlaying', 'seek', 'position', 'total',
  'mode', 'prune', 'clearTimeline', 'clear', 'showAsset', 'showTimeline', 'setQuality',
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

  // A media element notices its changed path in the animation pass. The router
  // must not reach for a method that is not on the real preview object.
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
