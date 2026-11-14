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

const target = (kind) => ({ track: { kind }, clip: {} });

test('a layer shows only its own group, with a title for its kind', () => {
  const text = { content: { kind: 'text' } };

  assert.deepStrictEqual(I.availableTabs({ item: text, targets: null, transition: null }), ['video']);
  assert.equal(I.inspectorTitle({ item: text, subtitle: false, targets: null }), 'Text');
  assert.equal(I.inspectorTitle({ item: text, subtitle: true, targets: null }), 'Subtitle');
  assert.equal(I.inspectorTitle({ item: { content: { kind: 'shape' } }, targets: null }), 'Shape');
  assert.equal(
    I.inspectorTitle({ item: { content: { kind: 'videoOverlay' } }, targets: null }),
    'Picture in Picture',
  );
});

test('a clip shows the groups it carries, and a transition adds its own', () => {
  const video = target('video');
  const audio = target('audio');

  assert.deepStrictEqual(
    I.availableTabs({ item: null, targets: { selected: video, video, audio }, transition: null }),
    ['video', 'audio'],
  );
  assert.deepStrictEqual(
    I.availableTabs({ item: null, targets: { selected: audio, video: null, audio }, transition: null }),
    ['audio'],
  );
  assert.deepStrictEqual(
    I.availableTabs({ item: null, targets: { selected: video, video, audio: null }, transition: {} }),
    ['video', 'transition'],
  );
});

test('a clip is titled by the track it was selected on', () => {
  const video = target('video');
  const audio = target('audio');

  assert.equal(I.inspectorTitle({ item: null, targets: { selected: video, video, audio } }), 'Video clip');
  assert.equal(I.inspectorTitle({ item: null, targets: { selected: audio, video, audio } }), 'Audio clip');
});

test('nothing selected shows no groups and the plain title', () => {
  assert.deepStrictEqual(I.availableTabs({ item: null, targets: null, transition: null }), []);
  assert.equal(I.inspectorTitle({ item: null, subtitle: false, targets: null }), 'Inspector');
});
