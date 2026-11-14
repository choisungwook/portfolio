'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/editor.js');

// An opaque image filled by `fill(x, y)`, which returns [r, g, b].
function image(width, height, fill) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = fill(x, y);
      rgba.set([r, g, b, 255], (y * width + x) * 4);
    }
  }
  return rgba;
}

const alphaAt = (rgba, width, x, y) => rgba[(y * width + x) * 4 + 3];
const WHITE = [255, 255, 255];
const RED = [255, 0, 0];
// A 10x10 image with a red square at 3..6.
const inSquare = (x, y) => x >= 3 && x <= 6 && y >= 3 && y <= 6;

test('a solid white background around a red square is cleared and the square stays', () => {
  const rgba = image(10, 10, (x, y) => (inSquare(x, y) ? RED : WHITE));
  const { removed } = L.removeBackground(rgba, 10, 10);
  assert.strictEqual(removed, 100 - 16);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 10; x += 1) {
      assert.strictEqual(alphaAt(rgba, 10, x, y), inSquare(x, y) ? 255 : 0, `${x},${y}`);
    }
  }
});

test('a white region enclosed by the subject stays opaque', () => {
  // A red square 3..11 with a white hole 6..8, in a 15x15 white image.
  const rgba = image(15, 15, (x, y) => {
    if (x >= 6 && x <= 8 && y >= 6 && y <= 8) return WHITE;
    return x >= 3 && x <= 11 && y >= 3 && y <= 11 ? RED : WHITE;
  });
  L.removeBackground(rgba, 15, 15);
  assert.strictEqual(alphaAt(rgba, 15, 7, 7), 255);
  assert.strictEqual(alphaAt(rgba, 15, 0, 0), 0);
  assert.strictEqual(alphaAt(rgba, 15, 4, 4), 255);
});

test('a noisy background (+-6 per channel) is still removed', () => {
  let seed = 7;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed % 13) - 6;
  };
  const rgba = image(20, 20, (x, y) => (
    x >= 7 && x <= 12 && y >= 7 && y <= 12
      ? RED
      : WHITE.map((value) => Math.max(0, Math.min(255, value + noise())))
  ));
  const { removed } = L.removeBackground(rgba, 20, 20);
  assert.strictEqual(removed, 400 - 36);
  assert.strictEqual(alphaAt(rgba, 20, 9, 9), 255);
});

test('a 1px 50% blend ring turns semi-transparent and its colour moves towards the subject', () => {
  const blend = [255, 128, 128];
  const rgba = image(10, 10, (x, y) => {
    if (inSquare(x, y)) return RED;
    return x >= 2 && x <= 7 && y >= 2 && y <= 7 ? blend : WHITE;
  });
  L.removeBackground(rgba, 10, 10);
  const i = (2 * 10 + 5) * 4;
  assert.ok(rgba[i + 3] > 0 && rgba[i + 3] < 255, `alpha ${rgba[i + 3]}`);
  // The green channel of the blend was 128; pure red has 0.
  assert.ok(rgba[i + 1] < 128, `green ${rgba[i + 1]}`);
  assert.strictEqual(alphaAt(rgba, 10, 4, 4), 255);
  assert.strictEqual(alphaAt(rgba, 10, 0, 0), 0);
});

test('an image whose border is already transparent is left alone', () => {
  const rgba = image(8, 8, (x, y) => (inSquare(x, y) ? RED : WHITE));
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (x === 0 || y === 0 || x === 7 || y === 7) rgba[(y * 8 + x) * 4 + 3] = 0;
    }
  }
  const before = Uint8ClampedArray.from(rgba);
  const { removed } = L.removeBackground(rgba, 8, 8);
  assert.strictEqual(removed, 0);
  assert.deepStrictEqual(rgba, before);
});

test('a gently graded background (white to #f0f0f0) is removed', () => {
  const rgba = image(20, 20, (x, y) => {
    if (x >= 8 && x <= 11 && y >= 8 && y <= 11) return RED;
    const v = Math.round(255 - (15 * x) / 19);
    return [v, v, v];
  });
  const { removed } = L.removeBackground(rgba, 20, 20);
  assert.strictEqual(removed, 400 - 16);
  assert.strictEqual(alphaAt(rgba, 20, 19, 0), 0);
  assert.strictEqual(alphaAt(rgba, 20, 9, 9), 255);
});

test('1x1 and 2x2 images do not throw', () => {
  const one = image(1, 1, () => WHITE);
  assert.doesNotThrow(() => L.removeBackground(one, 1, 1));
  const two = image(2, 2, (x) => (x === 0 ? WHITE : RED));
  assert.doesNotThrow(() => L.removeBackground(two, 2, 2));
  assert.doesNotThrow(() => L.removeBackground(new Uint8ClampedArray(0), 0, 0));
});
