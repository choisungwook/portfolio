'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createTimelineInteractions } = require('../src/timeline-interactions.js');

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(value) {
    this.values.add(value);
  }

  remove(value) {
    this.values.delete(value);
  }

  toggle(value, active) {
    if (active) this.values.add(value);
    else this.values.delete(value);
  }

  contains(value) {
    return this.values.has(value);
  }
}

test('a Source Monitor drag inserts its selected range at the dropped frame', async (context) => {
  const originalDocument = global.document;
  context.after(() => {
    global.document = originalDocument;
  });

  const track = { id: 'v2', kind: 'video' };
  const lane = { dataset: { trackId: track.id }, classList: new FakeClassList() };
  const ghost = { style: {}, remove() {} };
  global.document = {
    body: { appendChild() {}, classList: new FakeClassList() },
    createElement: () => ghost,
    elementFromPoint: () => ({ closest: (selector) => selector === '.lane' ? lane : null }),
  };

  const source = {
    asset: { id: 'asset-1', name: 'take.mp4', kind: 'video', hasAudio: true },
    selection: { inPoint: 30, outPoint: 120 },
    video: true,
    audio: false,
    rippleAllTracks: false,
  };
  const inserted = [];
  const interactions = createTimelineInteractions({
    HANDLE_PX: 8,
    L: {
      canAccept: () => true,
      findTrack: () => track,
      snapTime: (_project, frame) => frame,
    },
    api: {},
    baseName: (path) => path,
    dom: {
      lanes: { querySelectorAll: () => [lane] },
      sourcePanel: { classList: new FakeClassList() },
    },
    edit: async () => {},
    frameAtClientX: () => 75,
    getPreview: () => ({ position: () => 0 }),
    getSourceDrag: () => source,
    hydrateDuration() {},
    insertSourceAt: async (...args) => inserted.push(args),
    probePaths: async () => [],
    rate: () => ({ num: 30, den: 1 }),
    renderTimeline() {},
    selectAsset() {},
    selectClip() {},
    selectVisualItem() {},
    snapTolerance: () => 0,
    syncEditorOverlay() {},
    addText: async () => {},
    addShape: async () => {},
    state: { project: {} },
  });

  const down = { button: 0, clientX: 10, clientY: 10, preventDefault() {} };
  interactions.beginSourceDrag(down);
  interactions.updateSourceDrag({ clientX: 20, clientY: 20 });
  await interactions.endSourceDrag({ clientX: 120, clientY: 20 });

  assert.deepStrictEqual(inserted, [[source, track.id, 75]]);
  assert.strictEqual(lane.classList.contains('drop-target'), false);
});
