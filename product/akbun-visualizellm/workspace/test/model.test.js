import test from 'node:test';
import assert from 'node:assert/strict';
import { parseConfig, deriveModel, readField, attentionKind, humanCount, summary } from '../src/lib/model.js';
import { SAMPLES, sampleById } from '../src/lib/samples.js';

const dense = sampleById('dense-7b').config;

test('parseConfig rejects text that is not JSON', () => {
  assert.throws(() => parseConfig('hidden_size: 4096'), /Not valid JSON/);
});

test('parseConfig rejects JSON that is not a model config', () => {
  assert.throws(() => parseConfig('{"name": "hello"}'), /does not look like a model config/);
  assert.throws(() => parseConfig('[1, 2]'), /JSON object/);
  assert.throws(() => parseConfig('   '), /Paste a config/);
});

test('parseConfig unwraps the language model of a multimodal config', () => {
  const config = parseConfig(JSON.stringify({
    model_type: 'vision-language',
    vision_config: { hidden_size: 1024 },
    text_config: { hidden_size: 4096, num_hidden_layers: 32 },
  }));
  assert.equal(config.hidden_size, 4096);
  assert.equal(config.num_hidden_layers, 32);
});

test('readField reports which alias supplied the value', () => {
  assert.deepEqual(readField({ n_embd: 768 }, 'hidden'), { value: 768, source: 'n_embd' });
  assert.equal(readField({}, 'hidden'), null);
});

test('deriveModel reads the legacy GPT-2 field names', () => {
  const model = deriveModel(sampleById('gpt2').config);
  assert.equal(model.dims.hidden, 768);
  assert.equal(model.dims.layers, 12);
  assert.equal(model.dims.heads, 12);
  assert.equal(model.dims.intermediate, 3072);
  assert.equal(model.sources.hidden, 'n_embd');
  assert.equal(model.sources.context, 'n_positions');
  assert.equal(model.flags.normKind, 'LayerNorm');
  assert.equal(model.flags.gated, false);
});

test('deriveModel fills head_dim and kv heads when the config omits them', () => {
  const model = deriveModel({ hidden_size: 4096, num_hidden_layers: 32, num_attention_heads: 32 });
  assert.equal(model.dims.headDim, 128);
  assert.equal(model.dims.kvHeads, 32);
  assert.equal(model.sources.headDim, null);
});

test('attentionKind names the scheme from the head counts', () => {
  assert.equal(attentionKind(32, 32), 'MHA');
  assert.equal(attentionKind(32, 8), 'GQA');
  assert.equal(attentionKind(32, 1), 'MQA');
});

test('the dense 7B sample estimates close to 7B parameters', () => {
  const model = deriveModel(dense);
  assert.equal(model.flags.attention, 'MHA');
  assert.equal(model.flags.gated, true);
  assert.ok(model.params.total > 6.5e9 && model.params.total < 7.1e9, `got ${model.params.total}`);
});

test('tied output weights drop the lm head from the count', () => {
  const model = deriveModel(sampleById('gqa-1_5b').config);
  assert.equal(model.flags.tied, true);
  assert.equal(model.params.lmHead, 0);
  assert.equal(model.flags.slidingWindow, 4096);
});

test('the mixture model counts every expert, not just the active ones', () => {
  const model = deriveModel(sampleById('moe-8x7b').config);
  assert.deepEqual(model.flags.moe, { experts: 8, topK: 2 });
  assert.ok(model.params.total > 4e10 && model.params.total < 5e10, `got ${model.params.total}`);
});

test('humanCount formats the way model cards do', () => {
  assert.equal(humanCount(6.7e9), '6.7B');
  assert.equal(humanCount(1.24e8), '124M');
  assert.equal(humanCount(4.67e10), '47B');
  assert.equal(humanCount(512), '512');
});

test('summary links each row back to the config field it came from', () => {
  const rows = summary(deriveModel(dense));
  const layers = rows.find((row) => row.label === 'Layers');
  assert.equal(layers.field, 'num_hidden_layers');
  assert.equal(rows.find((row) => row.label === 'Parameters').field, null);
});

test('every sample derives without throwing', () => {
  for (const sample of SAMPLES) {
    const model = deriveModel(parseConfig(JSON.stringify(sample.config)));
    assert.ok(model.params.total > 0, sample.id);
  }
});

test('a dimension that is present but unusable is rejected by name', () => {
  assert.throws(
    () => parseConfig('{"hidden_size": "4096", "num_hidden_layers": 32}'),
    /hidden_size has to be a positive number/,
  );
  assert.throws(
    () => parseConfig('{"hidden_size": 4096, "n_layer": 0}'),
    /n_layer has to be a positive number/,
  );
});

test('a zero head count falls back instead of producing NaN', () => {
  const model = deriveModel({ hidden_size: 4096, num_hidden_layers: 32, num_attention_heads: 0 });
  assert.equal(model.dims.heads, 1);
  assert.equal(model.dims.headDim, 4096);
  assert.ok(Number.isFinite(model.params.total));
});
