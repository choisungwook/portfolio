'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/ai-workflow.js');

const project = {
  settings: { width: 1920, height: 1080, rate: { num: 30, den: 1 } },
  assets: [{ id: 'asset-1', name: 'Cat', path: '/private/cat.mp4', kind: 'video', durationMs: 1000 }],
  tracks: [{ id: 'v1', kind: 'video', clips: [{ id: 'c1', lutPath: '/private/lut.cube' }], visualItems: [{
    id: 'title', start: 20, duration: 60, zIndex: 1,
    content: { kind: 'text', text: 'Hello', style: { fontSize: 64 } },
    transform: { x: 100, y: 50, width: 400, height: 100, rotation: 0, opacity: 1 },
    animation: { x: { keyframes: [{ frame: 0, value: 0 }, { frame: 30, value: 100, easing: 'easeOut' }] } },
  }] }],
};

test('editing context keeps transcript and IDs but removes filesystem metadata', () => {
  const text = W.context(project, { clipId: 'c1' }, [{ assetId: 'other', observations: [{ description: 'private' }] }]);
  assert.doesNotMatch(text, /private|lutPath|\/cat.mp4/);
  assert.match(text, /Hello/);
  assert.match(text, /asset-1/);
  assert.deepEqual(JSON.parse(text).broll, []);
});

test('model output is data: reject file operations and nested transactions', () => {
  for (const command of [{ op: 'addAssets', assets: [] }, { op: 'transaction', commands: [] }, { op: 'addOverlayVisualItem', content: { kind: 'adjustment' } }]) {
    assert.throws(() => W.parsePlan(JSON.stringify({ summary: 'bad', operations: [{ reason: '', command: JSON.stringify(command) }] })));
  }
  assert.throws(() => W.parsePlan('```json\n{}\n```'));
  assert.deepEqual(W.parsePlan('{"summary":"Need captions","operations":[]}').operations, []);
});

test('sample analysis rejects invented timestamps and excessive output', () => {
  const sample = { assetId: 'asset-1', frames: [{ timeMs: 0 }, { timeMs: 125 }] };
  assert.throws(() => W.parseAnalysis('{"observations":[{"timeMs":124,"description":"cat"}]}', sample));
  const analysis = W.parseAnalysis('{"observations":[{"timeMs":125,"description":"cat"}]}', sample);
  assert.equal(analysis.observations[0].description, 'cat');
});

test('saved graphics are independent, retimed and scaled for another project', () => {
  const saved = W.saveTemplate(project, 'title', 'Opening');
  saved.item.content.text = 'Copy';
  assert.equal(project.tracks[0].visualItems[0].content.text, 'Hello');
  const destination = { ...project, settings: { width: 960, height: 540, rate: { num: 60, den: 1 } } };
  const commands = W.templateCommands(saved, destination, 500, 'new-title');
  assert.equal(commands[0].start, 500);
  assert.equal(commands[0].duration, 120);
  assert.equal(commands[0].transform.width, 200);
  assert.equal(commands[0].content.style.fontSize, 32);
  assert.equal(commands[2].frame, 60);
  assert.equal(commands[2].value, 50);
  assert.equal(commands[2].itemId, 'new-title');
});

test('caption styles need a subtitle track and apply without replacing words', () => {
  const template = { kind: 'captions', item: { content: { style: { fontSize: 42 } } } };
  assert.throws(() => W.templateCommands(template, project, 0, 'unused'));
  const commands = W.templateCommands(template, { tracks: [{ id: 'subs', kind: 'subtitle' }] }, 0, 'unused');
  assert.deepEqual(commands, [{ op: 'setSubtitleStyle', trackId: 'subs', style: { fontSize: 42 } }]);
});
