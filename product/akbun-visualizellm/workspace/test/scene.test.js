import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveModel } from '../src/lib/model.js';
import { buildScene, sceneParams, side } from '../src/lib/scene.js';
import { sampleById } from '../src/lib/samples.js';

const dense = deriveModel(sampleById('dense-7b').config);
const moe = deriveModel(sampleById('moe-8x7b').config);

test('side compresses a 1000x range into a drawable one', () => {
  assert.ok(side(128) < side(4096));
  assert.ok(side(150000) <= 9);
  assert.ok(side(1) >= 0.5);
});

test('the scene holds one block per matrix of every layer', () => {
  const scene = buildScene(dense);
  const perLayer = scene.blocks.filter((block) => block.layer === 0);
  assert.deepEqual(perLayer.map((b) => b.id.replace('layer0-', '')),
    ['norm-in', 'q', 'k', 'v', 'scores', 'o', 'norm-post', 'gate', 'up', 'down']);
  assert.equal(scene.layers, 32);
  assert.equal(scene.blocks.filter((b) => b.layer !== undefined).length, 32 * 10);
});

test('blocks are laid out in flow order and never overlap', () => {
  const scene = buildScene(dense);
  for (let i = 1; i < scene.blocks.length; i += 1) {
    const prev = scene.blocks[i - 1];
    const next = scene.blocks[i];
    assert.ok(next.x - next.w / 2 >= prev.x + prev.w / 2 - 1e-9, `${prev.id} overlaps ${next.id}`);
  }
  assert.ok(scene.span > 0);
  assert.ok(scene.layerSpan > 0);
});

test('the embedding and the lm head bracket the layer stack', () => {
  const scene = buildScene(dense);
  assert.equal(scene.blocks[0].id, 'embedding');
  assert.equal(scene.blocks.at(-1).id, 'lm-head');
  assert.equal(scene.blocks.at(-2).id, 'norm-final');
});

test('the attention score square is marked as run time, not as a weight', () => {
  const block = buildScene(dense).blocks.find((b) => b.id === 'layer0-scores');
  assert.equal(block.kind, 'activation');
  assert.equal(block.params, 0);
});

test('expert MLPs are drawn as copies of one block', () => {
  const scene = buildScene(moe);
  const gate = scene.blocks.find((b) => b.id === 'layer0-gate');
  assert.equal(gate.copies, 8);
  assert.ok(scene.blocks.some((b) => b.id === 'layer0-router'));
});

test('the scene weights add up to the estimate from the config', () => {
  for (const model of [dense, moe]) {
    const counted = sceneParams(buildScene(model));
    const ratio = counted / model.params.total;
    assert.ok(ratio > 0.99 && ratio < 1.01, `${model.name}: ${counted} vs ${model.params.total}`);
  }
});
