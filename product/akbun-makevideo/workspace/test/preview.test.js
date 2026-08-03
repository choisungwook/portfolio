'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  timelineTimeFromMedia,
  playbackRateForDrift,
  HARD_SYNC_THRESHOLD,
} = require('../src/preview.js');

test('media time drives the timeline through clip trims and placement', () => {
  const clip = { startMs: 5000, inMs: 2000 };
  assert.strictEqual(timelineTimeFromMedia(clip, 3.5), 6500);
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
  const videoClip = {
    id: 'c1', assetId: 'video', startMs: 0, inMs: 0, outMs: 10000, opacity: 1, volume: 1,
  };
  const audioClip = {
    id: 'c2', assetId: 'audio', startMs: 0, inMs: 0, outMs: 10000, opacity: 1, volume: 1,
  };
  videoTrack.clips.push(videoClip);
  audioTrack.clips.push(audioClip);
  const assets = {
    video: { id: 'video', path: '/video.mp4', kind: 'video' },
    audio: { id: 'audio', path: '/audio.mp3', kind: 'audio' },
  };
  const project = { settings: { width: 1920, height: 1080 }, tracks: [videoTrack, audioTrack] };
  global.timelineLib = {
    tracksOf: (value, kind) => value.tracks.filter((track) => track.kind === kind),
    clipsAt: (value, timeMs) => value.tracks.flatMap((track) => track.clips
      .filter((clip) => timeMs >= clip.startMs && timeMs < clip.outMs)
      .map((clip) => ({ track, clip, sourceMs: clip.inMs + timeMs - clip.startMs }))),
    findAsset: (value, assetId) => assets[assetId],
    projectDurationMs: () => 10000,
  };

  const ticks = [];
  const preview = require('../src/preview.js').createPreview({
    stage: { style: {} },
    inner: { style: {}, appendChild() {} },
    wrap: null,
    exactCanvas: null,
    getProject: () => project,
    onTick: (position, playing) => ticks.push({ position, playing }),
  });

  const play = preview.play();
  await Promise.resolve();
  assert.strictEqual(ticks.at(-1).playing, true);
  assert.strictEqual(preview.position(), 0);

  startReference();
  await play;
  assert.strictEqual(ticks.some((tick) => tick.playing), true);

  const [reference, follower] = elements;
  reference.currentTime = 0.2;
  follower.currentTime = 0.1;
  frames.shift()();
  assert.strictEqual(preview.position(), 200);
  assert.strictEqual(follower.currentTime, 0.1);
  assert.strictEqual(follower.playbackRate, 1.025);

  reference.paused = true;
  now = 300;
  frames.shift()();
  assert.strictEqual(preview.position(), 300);

  preview.seek(500);
  assert.strictEqual(reference.currentTime, 0.5);
  assert.strictEqual(follower.currentTime, 0.5);
});
