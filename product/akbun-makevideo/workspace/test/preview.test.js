'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  timelineTimeFromMedia,
  playbackRateForDrift,
  HARD_SYNC_THRESHOLD,
} = require('../src/preview.js');
const T = require('../src/time.js');

test('media time drives the timeline through clip trims and placement', () => {
  // The clip starts five seconds in and is taken from two seconds into its
  // source, so 3.5s of media is 6.5s of timeline: frame 195 of 30.
  const clip = { start: 150, in: 60 };
  assert.strictEqual(timelineTimeFromMedia(clip, 3.5, T.fps(30)), 195);
});

test('a broadcast rate counts the media clock in its own frames', () => {
  // 30000/1001 frames a second, so 1.001s of media is frame 30. The media
  // clock is a float and stops wherever it likes, so the position keeps its
  // fraction and is only rounded where a frame index is actually wanted.
  const clip = { start: 0, in: 0 };
  assert.strictEqual(Math.round(timelineTimeFromMedia(clip, 1.001, T.ntsc(30))), 30);
});

test('small follower drift keeps the normal playback rate', () => {
  assert.strictEqual(playbackRateForDrift(0.02), 1);
  assert.strictEqual(playbackRateForDrift(-0.02), 1);
});

test('follower drift is corrected without large playback rate changes', () => {
  assert.strictEqual(playbackRateForDrift(0.1), 1.025);
  assert.strictEqual(playbackRateForDrift(-0.1), 0.975);
  assert.strictEqual(playbackRateForDrift(10), 1.05);
  assert.strictEqual(playbackRateForDrift(-10), 0.95);
  assert.strictEqual(HARD_SYNC_THRESHOLD, 1);
});

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

  contains(value) {
    return this.values.has(value);
  }
}

function fakeMedia(tagName, start) {
  let currentTime = 0;
  return {
    tagName,
    paused: true,
    playbackRate: 1,
    classList: new FakeClassList(),
    style: {},
    get currentTime() {
      return currentTime;
    },
    set currentTime(value) {
      currentTime = value;
    },
    play() {
      return start().then(() => {
        this.paused = false;
      });
    },
    pause() {
      this.paused = true;
    },
    remove() {},
    removeAttribute() {},
  };
}

test('pre-roll waits for media and followers correct drift without seeking', async (context) => {
  const original = {
    document: global.document,
    window: global.window,
    timelineLib: global.timelineLib,
    requestAnimationFrame: global.requestAnimationFrame,
    performance: global.performance,
  };
  context.after(() => Object.assign(global, original));

  let startReference;
  const referenceStarted = new Promise((resolve) => {
    startReference = resolve;
  });
  const elements = [];
  const frames = [];
  let now = 0;
  global.document = {
    createElement(tagName) {
      const start = elements.length === 0 ? () => referenceStarted : () => Promise.resolve();
      const element = fakeMedia(tagName.toUpperCase(), start);
      elements.push(element);
      return element;
    },
  };
  global.window = { api: { fileUrl: (path) => path } };
  global.requestAnimationFrame = (callback) => frames.push(callback);
  global.performance = { now: () => now };

  const videoTrack = { id: 'v1', kind: 'video', clips: [], hidden: false, muted: false };
  const audioTrack = { id: 'a1', kind: 'audio', clips: [], hidden: false, muted: false };
  // Ten seconds at 30, which is what the fake project below is on.
  const videoClip = {
    id: 'c1', assetId: 'video', start: 0, in: 0, out: 300, opacity: 1, volume: 1,
  };
  const audioClip = {
    id: 'c2', assetId: 'audio', start: 0, in: 0, out: 300, opacity: 1, volume: 1,
  };
  videoTrack.clips.push(videoClip);
  audioTrack.clips.push(audioClip);
  const assets = {
    video: { id: 'video', path: '/video.mp4', kind: 'video' },
    audio: { id: 'audio', path: '/audio.mp3', kind: 'audio' },
  };
  const project = {
    settings: { width: 1920, height: 1080, rate: T.fps(30) },
    tracks: [videoTrack, audioTrack],
  };
  global.timelineLib = {
    tracksOf: (value, kind) => value.tracks.filter((track) => track.kind === kind),
    clipsAt: (value, frame) => value.tracks.flatMap((track) => track.clips
      .filter((clip) => frame >= clip.start && frame < clip.out)
      .map((clip) => ({ track, clip, sourceFrame: clip.in + frame - clip.start }))),
    findAsset: (value, assetId) => assets[assetId],
    projectDurationFrames: () => 300,
  };

  const ticks = [];
  const preview = require('../src/preview.js').createPreview({
    stage: { style: {} },
    inner: { style: {}, appendChild() {} },
    wrap: null,
    exactCanvas: null,
    getProject: () => project,
    playbackPath: (asset) => asset.id === 'video' ? '/proxy/video.mp4' : asset.path,
    onTick: (position, playing) => ticks.push({ position, playing }),
  });

  const play = preview.play();
  await Promise.resolve();
  assert.strictEqual(ticks.at(-1).playing, true);
  assert.strictEqual(preview.position(), 0);
  assert.strictEqual(elements[0].src, '/proxy/video.mp4');
  assert.strictEqual(assets.video.path, '/video.mp4');

  startReference();
  await play;
  assert.strictEqual(ticks.some((tick) => tick.playing), true);

  const [reference, follower] = elements;
  reference.currentTime = 0.2;
  follower.currentTime = 0.1;
  frames.shift()();
  assert.strictEqual(preview.position(), 6, '0.2s is frame 6 of 30');
  assert.strictEqual(follower.currentTime, 0.1);
  assert.strictEqual(follower.playbackRate, 1.025);

  reference.paused = true;
  now = 300;
  frames.shift()();
  assert.strictEqual(preview.position(), 9, 'the wall clock takes over at 0.3s');

  preview.seek(15);
  assert.strictEqual(reference.currentTime, 0.5);
  assert.strictEqual(follower.currentTime, 0.5);
});

test('an asset measured after it was shown still gets its own shape', async (context) => {
  // ffprobe cannot always report a file's size, and what the browser measures
  // afterwards arrives as a new project rather than as a change to the object
  // the preview was handed. Reading the shape off the stale object left the
  // Source Monitor on the project's shape for as long as the asset stayed
  // selected, which is the double letterbox this fit exists to remove.
  const original = {
    document: global.document,
    window: global.window,
    timelineLib: global.timelineLib,
    requestAnimationFrame: global.requestAnimationFrame,
  };
  context.after(() => Object.assign(global, original));

  global.requestAnimationFrame = () => 0;
  global.document = { createElement: (tagName) => fakeMedia(tagName.toUpperCase(), () => Promise.resolve()) };
  global.window = { api: { fileUrl: (path) => path } };
  global.timelineLib = { tracksOf: () => [], clipsAt: () => [], projectDurationFrames: () => 0 };

  const unmeasured = { id: 'a', kind: 'video', path: '/a.mp4', width: 0, height: 0 };
  const settings = { width: 1920, height: 1080, rate: T.fps(30) };
  let project = { settings, tracks: [], assets: [unmeasured] };
  const stage = { style: {} };
  const preview = require('../src/preview.js').createPreview({
    stage,
    inner: { style: {}, appendChild() {} },
    wrap: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) },
    exactCanvas: null,
    getProject: () => project,
    onTick: () => {},
  });

  preview.showAsset(unmeasured);
  assert.strictEqual(stage.style.width, '800px', 'an unmeasured asset falls back to the project');
  assert.strictEqual(stage.style.height, '450px');

  // The measurement lands as a whole new project, exactly as describe_asset
  // returns it. The asset object the preview holds is not touched.
  project = {
    settings,
    tracks: [],
    assets: [{ ...unmeasured, width: 1080, height: 1080 }],
  };
  preview.layout();
  assert.strictEqual(stage.style.width, '600px', 'the square asset fills the height');
  assert.strictEqual(stage.style.height, '600px');
});

test('clearing the timeline pool keeps the asset preview alive', (context) => {
  const original = {
    document: global.document,
    window: global.window,
    timelineLib: global.timelineLib,
    requestAnimationFrame: global.requestAnimationFrame,
    performance: global.performance,
  };
  context.after(() => Object.assign(global, original));

  const elements = [];
  global.requestAnimationFrame = () => 0;
  global.performance = { now: () => 0 };
  global.document = {
    createElement(tagName) {
      const element = fakeMedia(tagName.toUpperCase(), () => Promise.resolve());
      element.removed = false;
      element.sourceRemoved = false;
      element.remove = () => {
        element.removed = true;
      };
      element.removeAttribute = (name) => {
        if (name === 'src') element.sourceRemoved = true;
      };
      elements.push(element);
      return element;
    },
  };
  global.window = { api: { fileUrl: (path) => path } };

  const timelineAsset = { id: 'timeline', path: '/timeline.mp4', kind: 'video' };
  const shownAsset = { id: 'shown', path: '/shown.mp4', kind: 'video' };
  const track = {
    id: 'v1',
    kind: 'video',
    hidden: false,
    muted: false,
    clips: [{
      id: 'c1',
      assetId: timelineAsset.id,
      start: 0,
      in: 0,
      out: 30,
      opacity: 1,
      volume: 1,
    }],
  };
  const project = {
    settings: { width: 1920, height: 1080, rate: T.fps(30) },
    tracks: [track],
    assets: [timelineAsset, shownAsset],
  };
  global.timelineLib = {
    tracksOf: (value, kind) => value.tracks.filter((item) => item.kind === kind),
    clipsAt: (_value, frame) => frame < 30
      ? [{ track, clip: track.clips[0], sourceFrame: frame }]
      : [],
    findAsset: (_value, assetId) => project.assets.find((asset) => asset.id === assetId),
    projectDurationFrames: () => 30,
  };

  const preview = require('../src/preview.js').createPreview({
    stage: { style: {} },
    inner: { style: {}, appendChild() {} },
    wrap: null,
    exactCanvas: null,
    getProject: () => project,
    onTick: () => {},
  });

  preview.seek(0);
  preview.showAsset(shownAsset);
  const [timelineElement, assetElement] = elements;
  preview.clearTimeline();

  assert.strictEqual(timelineElement.removed, true);
  assert.strictEqual(timelineElement.sourceRemoved, true);
  assert.strictEqual(assetElement.removed, false);
  assert.strictEqual(assetElement.sourceRemoved, false);
  assert.strictEqual(preview.mode(), 'asset');
});
