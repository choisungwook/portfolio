'use strict';

const test = require('node:test');
const assert = require('node:assert');
const S = require('../src/source.js');
const T = require('../src/time.js');

const rate = T.fps(30);
const video = {
  id: 'v',
  kind: 'video',
  durationMs: 10000,
  hasAudio: true,
};
const project = {
  tracks: [
    { id: 'v1', kind: 'video' },
    { id: 'v2', kind: 'video' },
    { id: 'a1', kind: 'audio' },
  ],
};

test('a new source range uses frame boundaries and the whole asset', () => {
  assert.deepStrictEqual(S.selectionFor(video, rate), { inPoint: 0, outPoint: 300 });
  assert.deepStrictEqual(S.markIn({ inPoint: 0, outPoint: 300 }, 40.6), {
    inPoint: 41,
    outPoint: 300,
  });
  assert.deepStrictEqual(S.markOut({ inPoint: 41, outPoint: 300 }, 200.4, 300), {
    inPoint: 41,
    outPoint: 200,
  });
});

test('in and out cannot cross or leave the source', () => {
  assert.deepStrictEqual(S.markIn({ inPoint: 0, outPoint: 20 }, 99), {
    inPoint: 19,
    outPoint: 20,
  });
  assert.deepStrictEqual(S.markOut({ inPoint: 19, outPoint: 20 }, 999, 300), {
    inPoint: 19,
    outPoint: 300,
  });
});

test('placement names a target per media kind and keeps the chosen range', () => {
  assert.deepStrictEqual(
    S.commandFor('insert', project, video, { inPoint: 30, outPoint: 120 }, {
      video: true,
      audio: true,
      targetTrackId: 'v2',
      start: 90.4,
      rippleAllTracks: true,
    }),
    {
      op: 'insertSource',
      assetId: 'v',
      videoTrackId: 'v2',
      audioTrackId: 'a1',
      inPoint: 30,
      outPoint: 120,
      start: 90,
      rippleAllTracks: true,
    }
  );
});

test('video-only, audio-only and append are explicit commands', () => {
  const selection = { inPoint: 0, outPoint: 60 };
  assert.deepStrictEqual(
    S.commandFor('overwrite', project, video, selection, {
      video: true,
      audio: false,
      start: 10,
    }),
    {
      op: 'overwriteSource',
      assetId: 'v',
      videoTrackId: 'v1',
      audioTrackId: null,
      inPoint: 0,
      outPoint: 60,
      start: 10,
    }
  );
  assert.deepStrictEqual(
    S.commandFor('append', project, video, selection, {
      video: false,
      audio: true,
    }),
    {
      op: 'appendSource',
      assetId: 'v',
      videoTrackId: null,
      audioTrackId: 'a1',
      inPoint: 0,
      outPoint: 60,
    }
  );
});
