'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const P = require('../src/panel.js');

test('clicking the active global action closes the selected panel', () => {
  assert.equal(P.toggledPanel(null, 'inspector'), 'inspector');
  assert.equal(P.toggledPanel('inspector', 'inspector'), null);
  assert.equal(P.toggledPanel('inspector', 'marker'), 'marker');
});

test('markers are listed in timeline order without mutating the project', () => {
  const markers = [
    { id: 'late', frame: 90 },
    { id: 'early-b', frame: 12 },
    { id: 'early-a', frame: 12 },
  ];

  assert.deepEqual(P.orderedMarkers(markers).map((marker) => marker.id), [
    'early-a', 'early-b', 'late',
  ]);
  assert.deepEqual(markers.map((marker) => marker.id), ['late', 'early-b', 'early-a']);
});

test('inspector tabs wrap in both directions', () => {
  assert.equal(P.adjacentTab('video', -1), 'file');
  assert.equal(P.adjacentTab('file', 1), 'video');
});
