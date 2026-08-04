'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_QUALITY_LIMITS,
  percentile,
  evaluateQuality,
  createQualityMonitor,
  sampleMemorySafely,
} = require('../src/quality.js');

test('percentile uses the nearest rank', () => {
  assert.strictEqual(percentile([40, 10, 30, 20], 0.5), 20);
  assert.strictEqual(percentile([40, 10, 30, 20], 0.99), 40);
  assert.strictEqual(percentile([], 0.5), null);
});

test('quality checks keep the six acceptance criteria separate', () => {
  const metrics = {
    frameIntervalP50Ms: 33,
    frameIntervalP99Ms: 50,
    droppedFrames: 0,
    totalFrames: 300,
    avDriftP99Ms: 20,
    startupDelayP99Ms: 200,
    memoryGrowthBytes: 1024,
  };
  const result = evaluateQuality(metrics, DEFAULT_QUALITY_LIMITS);
  assert.strictEqual(result.pass, true);
  assert.deepStrictEqual(Object.keys(result.checks), [
    'frameIntervalP50Ms',
    'frameIntervalP99Ms',
    'droppedFrames',
    'avDriftP99Ms',
    'startupDelayP99Ms',
    'memoryGrowthBytes',
  ]);
});

test('monitor records frame timing, drops, drift, startup and memory', () => {
  let callback;
  let now = 100;
  const classes = new Set(['on']);
  const counters = { droppedVideoFrames: 1, totalVideoFrames: 10 };
  const video = {
    classList: { contains: (value) => classes.has(value) },
    style: { zIndex: '1' },
    requestVideoFrameCallback(next) { callback = next; },
    getVideoPlaybackQuality() { return counters; },
  };
  const monitor = createQualityMonitor({ now: () => now });
  monitor.watchVideo(video);
  monitor.start('continuous', 30);
  monitor.sampleMemory(1000);
  monitor.playbackRequested();
  now = 130;
  callback(130, { presentedFrames: 11, mediaTime: 0.1 });
  callback(163, { presentedFrames: 14, mediaTime: 0.2 });
  monitor.sampleDrift(24);
  monitor.sampleMemory(4000);
  counters.droppedVideoFrames = 3;
  counters.totalVideoFrames = 70;
  now = 60100;
  const report = monitor.finish();

  assert.strictEqual(report.metrics.frameIntervalP50Ms, 33);
  assert.strictEqual(report.metrics.droppedFrames, 2);
  assert.strictEqual(report.metrics.totalFrames, 60);
  assert.strictEqual(report.metrics.avDriftP99Ms, 24);
  assert.strictEqual(report.metrics.startupDelayP99Ms, 30);
  assert.strictEqual(report.metrics.memoryGrowthBytes, 3000);
  assert.strictEqual(report.metrics.memoryGrowthBytesPerMinute, 3000);
});

test('a seek discontinuity is not counted as thousands of dropped frames', () => {
  let callback;
  let now = 0;
  const video = {
    classList: { contains: () => true },
    style: {},
    requestVideoFrameCallback(next) { callback = next; },
  };
  const monitor = createQualityMonitor({ now: () => now });
  monitor.watchVideo(video);
  monitor.start('seek', 30);
  callback(0, { presentedFrames: 1, mediaTime: 0 });
  callback(33, { presentedFrames: 2, mediaTime: 14 });
  now = 1000;
  monitor.sampleMemory(1000);
  monitor.sampleDrift(0);
  monitor.playbackRequested();
  callback(1033, { presentedFrames: 3, mediaTime: 14.033 });
  const report = monitor.finish();
  assert.strictEqual(report.metrics.droppedFrames, 0);
  assert.strictEqual(report.metrics.totalFrames, 3);
});

test('memory sampling failures are recorded without escaping', async () => {
  const samples = [];
  await sampleMemorySafely(
    async () => { throw new Error('unavailable'); },
    { sampleMemory: (value) => samples.push(value) },
  );
  assert.deepStrictEqual(samples, [null]);
});
