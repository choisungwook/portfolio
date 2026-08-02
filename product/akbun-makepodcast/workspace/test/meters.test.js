'use strict';

const test = require('node:test');
const assert = require('node:assert');

const {
  MIN_DB,
  formatTimecode,
  formatClock,
  timelineTicks,
  toDb,
  meterFraction,
  formatDb,
  sampleRateLabel,
  deviceLabel,
  selectedDeviceId,
  columnCount,
  tailView,
  fitPeaks,
  secondsOfPeaks,
  playheadFraction,
} = require('../src/meters.js');

test('a timecode is minutes, seconds and milliseconds', () => {
  assert.equal(formatTimecode(0), '00:00.000');
  assert.equal(formatTimecode(1.5), '00:01.500');
  assert.equal(formatTimecode(61.25), '01:01.250');
  assert.equal(formatTimecode(3600), '60:00.000');
});

test('a take longer than an hour keeps counting in minutes', () => {
  // An episode is one recording, so 01:03:00 as 63 minutes is easier to match
  // against an editor's timeline than a third field nobody looks at.
  assert.equal(formatTimecode(3780), '63:00.000');
});

test('a missing or negative time reads as zero rather than NaN', () => {
  assert.equal(formatTimecode(undefined), '00:00.000');
  assert.equal(formatTimecode(-4), '00:00.000');
  assert.equal(formatTimecode(NaN), '00:00.000');
});

test('a ruler mark is minutes and seconds only', () => {
  assert.equal(formatClock(0), '00:00');
  assert.equal(formatClock(7), '00:07');
  assert.equal(formatClock(125), '02:05');
});

test('a ruler mark rounds up into the next minute cleanly', () => {
  // 59.7 rounding to 60 would print 00:60, which is not a time.
  assert.equal(formatClock(59.7), '01:00');
});

test('ruler marks are whole multiples, not offsets from the left edge', () => {
  // The recording window scrolls, so offsets would relabel every mark on every
  // frame and no mark would ever be a round number.
  assert.deepEqual(timelineTicks(6.4, 4, 1), [7, 8, 9, 10]);
});

test('a window starting at zero has no mark on the left edge', () => {
  assert.deepEqual(timelineTicks(0, 3.5, 1), [1, 2, 3]);
});

test('a window shorter than the interval has no marks', () => {
  assert.deepEqual(timelineTicks(0, 3, 5), []);
});

test('an empty window produces no marks rather than looping forever', () => {
  assert.deepEqual(timelineTicks(0, 0, 1), []);
  assert.deepEqual(timelineTicks(0, 10, 0), []);
});

test('silence is the bottom of the meter and not negative infinity', () => {
  assert.equal(toDb(0), MIN_DB);
  assert.equal(meterFraction(0), 0);
  assert.equal(formatDb(0), '-60 dB');
});

test('full scale fills the meter', () => {
  assert.ok(Math.abs(toDb(1)) < 0.001);
  assert.ok(Math.abs(meterFraction(1) - 1) < 0.001);
});

test('half amplitude is about minus six dB, in the top tenth of the meter', () => {
  assert.ok(Math.abs(toDb(0.5) + 6.02) < 0.01);
  assert.ok(meterFraction(0.5) > 0.89);
});

test('a level below the floor cannot push the bar negative', () => {
  assert.equal(meterFraction(0.0000001), 0);
});

test('the page and the recorder crate agree on the meter floor', () => {
  // The bar comes from this file and the number under it comes from Rust. A
  // different floor on either side shows a full bar reading -60 dB.
  assert.equal(MIN_DB, -60);
});

test('sample rates read the way an interface prints them', () => {
  assert.equal(sampleRateLabel(48000), '48 kHz');
  assert.equal(sampleRateLabel(44100), '44.1 kHz');
  assert.equal(sampleRateLabel(0), '');
});

test('a device label carries the channel count and the rate', () => {
  const label = deviceLabel({ name: 'Scarlett 2i2', channels: 2, sampleRate: 48000 });
  assert.equal(label, 'Scarlett 2i2 · 2 ch · 48 kHz');
});

test('the system default device says so', () => {
  const label = deviceLabel({ name: 'MacBook Pro Microphone', channels: 1, sampleRate: 44100, isDefault: true });
  assert.equal(label, 'MacBook Pro Microphone · 1 ch · 44.1 kHz (system default)');
});

test('a device with nothing to report still gets a label', () => {
  assert.equal(deviceLabel({}), 'Unknown device');
  assert.equal(deviceLabel(null), '');
});

test('the stored device stays selected while it is present', () => {
  const devices = [
    { id: 'coreaudio:1', isDefault: true },
    { id: 'coreaudio:2' },
  ];
  assert.equal(selectedDeviceId(devices, 'coreaudio:2'), 'coreaudio:2');
});

test('an unplugged device falls back to the one that will actually open', () => {
  const devices = [
    { id: 'coreaudio:1' },
    { id: 'coreaudio:2', isDefault: true },
  ];
  assert.equal(selectedDeviceId(devices, 'coreaudio:gone'), 'coreaudio:2');
});

test('with no default the first device is selected', () => {
  assert.equal(selectedDeviceId([{ id: 'a' }, { id: 'b' }], null), 'a');
});

test('an empty device list selects nothing', () => {
  assert.equal(selectedDeviceId([], 'a'), '');
});

test('columns are whole and never negative', () => {
  assert.equal(columnCount(100, 3), 33);
  assert.equal(columnCount(0, 3), 0);
  assert.equal(columnCount(100, 0), 0);
});

test('while recording the view is the tail of the take', () => {
  const view = tailView([1, 2, 3, 4, 5], 3);
  assert.deepEqual(view.values, [3, 4, 5]);
  assert.equal(view.first, 2);
});

test('a take shorter than the canvas starts at the left edge', () => {
  const view = tailView([1, 2], 5);
  assert.deepEqual(view.values, [1, 2]);
  assert.equal(view.first, 0);
});

test('fitting keeps the loudest column of each group', () => {
  // The point of max over average: a single loud consonant in a quiet passage
  // has to stay visible after the take is fitted to the canvas.
  assert.deepEqual(fitPeaks([0.1, 0.9, 0.1, 0.1], 2), [0.9, 0.1]);
});

test('a take with fewer columns than the canvas is not stretched', () => {
  assert.deepEqual(fitPeaks([0.2, 0.4], 8), [0.2, 0.4]);
});

test('fitting an empty take draws nothing', () => {
  assert.deepEqual(fitPeaks([], 10), []);
  assert.deepEqual(fitPeaks([0.5], 0), []);
});

test('fitting always produces exactly the columns asked for', () => {
  const peaks = new Array(1000).fill(0.3);
  assert.equal(fitPeaks(peaks, 137).length, 137);
});

test('columns become seconds at the sample rate', () => {
  assert.ok(Math.abs(secondsOfPeaks(94, 48000, 512) - 1.0026) < 0.001);
  assert.equal(secondsOfPeaks(94, 0, 512), 0);
});

test('the playhead is a fraction of the take and stays on the canvas', () => {
  assert.equal(playheadFraction(5, 10), 0.5);
  assert.equal(playheadFraction(20, 10), 1);
  assert.equal(playheadFraction(-1, 10), 0);
});

test('an empty take puts the playhead at the start rather than dividing by zero', () => {
  assert.equal(playheadFraction(3, 0), 0);
});
