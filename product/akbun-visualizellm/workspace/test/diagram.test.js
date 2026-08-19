import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveModel } from '../src/lib/model.js';
import { buildDiagram, annotations } from '../src/lib/diagram.js';
import { sampleById } from '../src/lib/samples.js';

const dense = deriveModel(sampleById('dense-7b').config);
const moe = deriveModel(sampleById('moe-8x7b').config);
const gpt2 = deriveModel(sampleById('gpt2').config);

const nodeIds = (diagram) => diagram.sections.flatMap((section) => section.nodes.map((node) => node.id));

test('the diagram runs from token ids to logits with the layer stack between', () => {
  const diagram = buildDiagram(dense);
  assert.deepEqual(diagram.sections.map((s) => s.id), ['input', 'layer', 'output']);
  assert.equal(diagram.sections[1].repeat, 32);
  const ids = nodeIds(diagram);
  assert.ok(ids.indexOf('tokens') < ids.indexOf('embedding'));
  assert.ok(ids.indexOf('qkv') < ids.indexOf('scores'));
  assert.ok(ids.indexOf('mlp') < ids.indexOf('lm-head'));
  assert.equal(ids.at(-1), 'logits');
});

test('every node carries a role sentence and a shape', () => {
  for (const node of buildDiagram(dense).sections.flatMap((s) => s.nodes)) {
    assert.ok(node.role.length > 40, node.id);
    assert.ok(node.shape.length > 0, node.id);
  }
});

test('a mixture model draws a router and expert copies instead of one MLP', () => {
  const ids = nodeIds(buildDiagram(moe));
  assert.ok(ids.includes('router'));
  assert.ok(ids.includes('experts'));
  assert.ok(!ids.includes('mlp'));
});

test('a model without RoPE draws no rotary block', () => {
  assert.ok(!nodeIds(buildDiagram(gpt2)).includes('rope'));
  assert.ok(nodeIds(buildDiagram(dense)).includes('rope'));
});

test('annotations point a config field at every block its value shaped', () => {
  const diagram = buildDiagram(dense);
  const rows = annotations(dense, diagram);
  const hidden = rows.find((row) => row.field === 'hidden_size');
  assert.equal(hidden.value, 4096);
  assert.ok(hidden.nodes.includes('embedding'));
  assert.ok(hidden.nodes.includes('attn-out'));

  const layers = rows.find((row) => row.field === 'num_hidden_layers');
  assert.deepEqual(layers.nodes, ['layer']);
  assert.ok(rows.every((row) => row.value !== undefined));
});

test('a field the config never spelled produces no annotation', () => {
  const rows = annotations(gpt2, buildDiagram(gpt2));
  assert.ok(!rows.some((row) => row.field === 'rope_theta'));
  assert.ok(rows.some((row) => row.field === 'n_embd'));
});
