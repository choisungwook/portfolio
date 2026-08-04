'use strict';

const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/time.js');

// The same rates the Rust crate runs its tests over, because the project file
// passes between the two and a rate the page rounds differently is a clip that
// moves when it is saved.
const RATES = T.STANDARD_RATES;

test('the broadcast rates are ratios rather than decimals', () => {
  assert.deepStrictEqual(T.ntsc(30), { num: 30000, den: 1001 });
  assert.deepStrictEqual(T.ntsc(24), { num: 24000, den: 1001 });
  assert.deepStrictEqual(T.ntsc(60), { num: 60000, den: 1001 });
});

test('a rate is reduced, so the same rate is one value', () => {
  assert.deepStrictEqual(T.rate(60000, 2002), T.ntsc(30));
  assert.deepStrictEqual(T.rate(60, 2), T.fps(30));
  // Nothing usable in the file: opening it matters more than refusing it.
  assert.deepStrictEqual(T.rate(0, 0), T.fps(30));
});

test('every offered rate reads and writes the way people write it', () => {
  const expected = ['23.976', '24', '25', '29.97', '30', '50', '59.94', '60'];
  RATES.forEach((rate, index) => {
    assert.strictEqual(T.rateLabel(rate), expected[index]);
    assert.deepStrictEqual(T.parseRate(expected[index]), rate);
    assert.deepStrictEqual(T.parseRate(T.rateRatio(rate)), rate);
  });
  assert.strictEqual(T.rateRatio(T.ntsc(30)), '30000/1001');
});

test('a decimal frame rate snaps back to the ratio it meant', () => {
  assert.deepStrictEqual(T.nearestRate(29.97), T.ntsc(30));
  assert.deepStrictEqual(T.nearestRate(23.976), T.ntsc(24));
  assert.deepStrictEqual(T.nearestRate(30), T.fps(30));
  assert.deepStrictEqual(T.nearestRate(0), T.fps(30));
});

test('a frame index is its own time, so nothing accumulates', () => {
  // The millisecond model rounded here and the error added up. Ten thousand
  // frames on has to be exactly ten thousand frames on, at every rate.
  for (const rate of RATES) {
    let running = T.time(0, rate);
    for (let index = 0; index < 10000; index += 1) {
      running = T.add(running, T.time(1, rate));
    }
    assert.strictEqual(running.value, 10000, T.rateLabel(rate));
  }
});

test('milliseconds go in and the nearest frame comes out', () => {
  assert.strictEqual(T.framesFromMillis(1000, T.fps(30)), 30);
  assert.strictEqual(T.framesFromMillis(1000, T.ntsc(30)), 30);
  assert.strictEqual(T.framesFromMillis(1001, T.ntsc(30)), 30);
  assert.strictEqual(T.framesFromMillis(0, T.ntsc(24)), 0);
  assert.strictEqual(T.framesFromMillis(-1000, T.fps(25)), -25);
});

test('milliseconds come back within half a frame on every rate', () => {
  // Not within a millisecond: ten seconds is 239.76 frames of 23.976 and there
  // is no such frame. Landing on the nearest one and staying there is the
  // bargain; what must not happen is drifting further than that.
  for (const rate of RATES) {
    const back = T.framesToMillis(T.framesFromMillis(10000, rate), rate);
    const halfFrame = 500 / T.rateToNumber(rate);
    assert.ok(Math.abs(back - 10000) <= halfFrame + 1, `${T.rateLabel(rate)} gave ${back}`);
  }
});

test('seconds keep their fraction, because a media clock is not on a frame', () => {
  assert.strictEqual(T.framesToSeconds(30, T.fps(30)), 1);
  assert.ok(Math.abs(T.framesToSeconds(30, T.ntsc(30)) - 1.001) < 1e-9);
  assert.ok(Math.abs(T.secondsToFrames(1.001, T.ntsc(30)) - 30) < 1e-9);
});

test('rescaling is exact when the rates divide', () => {
  assert.strictEqual(T.rescale(90, T.fps(30), T.fps(60)), 180);
  assert.strictEqual(T.rescale(180, T.fps(60), T.fps(30)), 90);
  // 23.976 runs slower, so a thousand of its frames is a thousand and one of 24.
  assert.strictEqual(T.rescale(1000, T.ntsc(24), T.fps(24)), 1001);
});

test('rescaling holds the instant still on every pair of rates', () => {
  for (const from of RATES) {
    for (const to of RATES) {
      const moved = T.rescale(600, from, to);
      const error = Math.abs(T.framesToSeconds(moved, to) - T.framesToSeconds(600, from));
      assert.ok(
        error <= 0.5 / T.rateToNumber(to) + 1e-9,
        `${T.rateLabel(from)} to ${T.rateLabel(to)} moved by ${error}`
      );
    }
  }
});

test('times compare as instants rather than as counts', () => {
  assert.strictEqual(T.compare(T.time(1, T.fps(30)), T.time(2, T.fps(60))), 0);
  assert.strictEqual(T.compare(T.time(1, T.fps(30)), T.time(1, T.fps(25))), -1);
  // 29.97 runs slower than 30, so the same frame number is later on it.
  assert.strictEqual(T.compare(T.time(100, T.ntsc(30)), T.time(100, T.fps(30))), 1);
});

test('adding a length on another rate answers on this one', () => {
  const start = T.time(30, T.fps(30));
  const length = T.time(60, T.fps(60));
  const end = T.add(start, length);
  assert.deepStrictEqual(end, T.time(60, T.fps(30)));
  assert.deepStrictEqual(T.sub(end, length), start);
});

test('clamping answers on the clamped time own rate', () => {
  const rate = T.ntsc(30);
  const low = T.time(0, rate);
  const high = T.time(100, rate);
  assert.strictEqual(T.clamp(T.time(-5, rate), low, high).value, 0);
  assert.strictEqual(T.clamp(T.time(500, rate), low, high).value, 100);
  assert.strictEqual(T.clamp(T.time(50, rate), low, high).value, 50);
  // An upside down pair does not throw.
  assert.strictEqual(T.clamp(T.time(50, rate), high, low).value, 100);
});

test('audio lands on a sample rather than on a millisecond', () => {
  assert.strictEqual(T.framesToSamples(60, T.fps(30), 48000), 96000);
  assert.strictEqual(T.framesToSamples(60, T.ntsc(30), 48000), 96096);
});

test('timecode counts frames, which is what a two frame trim is visible in', () => {
  assert.strictEqual(T.formatTimecode(0, T.fps(30)), '0:00:00:00');
  assert.strictEqual(T.formatTimecode(45, T.fps(30)), '0:00:01:15');
  assert.strictEqual(T.formatTimecode(30 * 60 * 60, T.fps(30)), '1:00:00:00');
  // Non drop: 29.97 counts thirty frames to the timecode second.
  assert.strictEqual(T.formatTimecode(30, T.ntsc(30)), '0:00:01:00');
  assert.strictEqual(T.formatTimecode(23, T.ntsc(24)), '0:00:00:23');
  assert.strictEqual(T.formatTimecode(24, T.ntsc(24)), '0:00:01:00');
});
