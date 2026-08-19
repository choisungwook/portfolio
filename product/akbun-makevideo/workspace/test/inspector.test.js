'use strict';

const test = require('node:test');
const assert = require('node:assert');
const I = require('../src/inspector.js');

function clip(id, assetId, linkGroup = null) {
  return { id, assetId, linkGroup, opacity: 1, volume: 1 };
}

const project = {
  assets: [
    { id: 'movie', kind: 'video', hasAudio: true },
    { id: 'still', kind: 'image', hasAudio: false },
  ],
  tracks: [
    { id: 'v1', kind: 'video', clips: [clip('v', 'movie', 'g1'), clip('still', 'still')] },
    { id: 'a1', kind: 'audio', clips: [clip('a', 'movie', 'g1')] },
  ],
};

test('a linked timeline selection exposes separate video and audio targets', () => {
  const fromVideo = I.clipTargets(project, 'v');
  assert.strictEqual(fromVideo.video.clip.id, 'v');
  assert.strictEqual(fromVideo.audio.clip.id, 'a');
  assert.strictEqual(I.activeTab(fromVideo), 'video');

  const fromAudio = I.clipTargets(project, 'a');
  assert.strictEqual(fromAudio.video.clip.id, 'v');
  assert.strictEqual(fromAudio.audio.clip.id, 'a');
  assert.strictEqual(I.activeTab(fromAudio), 'audio');
});

test('a video-only placement keeps its embedded audio in the audio tab', () => {
  const single = {
    assets: project.assets,
    tracks: [{ id: 'v1', kind: 'video', clips: [clip('v', 'movie')] }],
  };
  const targets = I.clipTargets(single, 'v');
  assert.strictEqual(targets.video.clip.id, 'v');
  assert.strictEqual(targets.audio.clip.id, 'v');
  assert.strictEqual(I.activeTab(targets, 'audio'), 'audio');
});

test('an image has a video tab and no audio tab', () => {
  const targets = I.clipTargets(project, 'still');
  assert.strictEqual(targets.video.clip.id, 'still');
  assert.strictEqual(targets.audio, null);
  assert.strictEqual(I.activeTab(targets, 'audio'), 'video');
});
