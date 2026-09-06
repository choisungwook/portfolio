'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSearchIndex, searchSlides } = require('../src/editor/search');

test('search spans slides, shape text and code with normalized case and Unicode', () => {
  const deck = { slides: [
    { shapes: [{ kind: 'rect', text: '한글 Hello' }, { kind: 'image', text: '' }] },
    { shapes: [{ kind: 'code', text: 'const ＨＥＬＬＯ = 1;\nreturn hello;' }] },
  ] };
  const index = buildSearchIndex(deck);
  assert.deepEqual(searchSlides(index, 'hello').map(({ slideIndex, shapeIndex }) => [slideIndex, shapeIndex]), [[0, 0], [1, 0]]);
  assert.equal(searchSlides(index, '한글')[0].shapeIndex, 0);
  assert.equal(searchSlides(index, '1; return').length, 1);
  assert.deepEqual(searchSlides(index, '  '), []);
  deck.slides[0].shapes[0].text = 'updated';
  assert.equal(searchSlides(buildSearchIndex(deck), 'hello').length, 1);
});

test('search can navigate all matches beyond the UI page size', () => {
  const deck = { slides: Array.from({ length: 1000 }, (_, i) => ({ shapes: [{ text: `slide ${i} needle` }] })) };
  assert.equal(searchSlides(buildSearchIndex(deck), 'needle').length, 1000);
});
