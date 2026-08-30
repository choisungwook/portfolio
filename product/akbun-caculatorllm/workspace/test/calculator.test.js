import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateVram,
  DEFAULT_INPUT,
  DEFAULT_MODEL,
  detectModelBytes,
  modelFromConfig,
  validateInput,
} from '../src/lib/calculator.js';

const QWEN_CONFIG = {
  _name_or_path: 'Qwen/Qwen2.5-7B-Instruct',
  model_type: 'qwen2',
  hidden_size: 3584,
  intermediate_size: 18944,
  num_attention_heads: 28,
  num_hidden_layers: 28,
  num_key_value_heads: 4,
  tie_word_embeddings: false,
  torch_dtype: 'bfloat16',
  vocab_size: 152064,
};

test('calculates model, KV cache, alpha, and total VRAM', () => {
  const result = calculateVram(DEFAULT_INPUT, DEFAULT_MODEL);
  assert.equal(result.errors.length, 0);
  assert.ok(Math.abs(result.kvGib - 0.4375) < 1e-12);
  assert.ok(Math.abs(result.alphaGib - ((result.modelGib + result.kvGib) * 0.2)) < 1e-12);
  assert.ok(Math.abs(result.totalGib - (result.modelGib + result.kvGib + result.alphaGib)) < 1e-12);
});

test('shows that the default 7B BF16 serving estimate exceeds 16 GiB', () => {
  const result = calculateVram(DEFAULT_INPUT, DEFAULT_MODEL);
  assert.equal(result.fits, false);
  assert.ok(result.totalGib > 16);
  assert.ok(result.overflowGib > 0);
  assert.equal(result.remainingGib, 0);
});

test('lower model precision can make the same model fit', () => {
  const result = calculateVram({ ...DEFAULT_INPUT, modelBytes: 0.5 }, DEFAULT_MODEL);
  assert.equal(result.fits, true);
  assert.ok(result.remainingGib > 0);
  assert.equal(result.overflowGib, 0);
});

test('uses exact Hugging Face parameter metadata when available', () => {
  const model = modelFromConfig(QWEN_CONFIG, 7_615_616_512);
  assert.equal(model.parameterCount, 7_615_616_512);
  assert.equal(model.parameterSource, 'Hugging Face metadata');
  assert.equal(model.headDim, 128);
});

test('estimates common decoder-only parameter counts from config.json', () => {
  const model = modelFromConfig(QWEN_CONFIG);
  assert.equal(model.parameterSource, 'Estimated from config.json');
  assert.ok(model.parameterCount > 7e9);
  assert.ok(model.parameterCount < 9e9);
});

test('requires manual parameters for an unsupported architecture', () => {
  const model = modelFromConfig({
    ...QWEN_CONFIG,
    model_type: 'custom_model',
    tie_word_embeddings: true,
  });
  assert.equal(model.parameterCount, null);
  assert.equal(model.parameterSource, 'Manual input required');
});

test('detects common model precisions from config', () => {
  assert.equal(detectModelBytes(QWEN_CONFIG), 2);
  assert.equal(detectModelBytes({ quantization_config: { bits: 8 } }), 1);
  assert.equal(detectModelBytes({ quantization_config: { bits: 4 } }), 0.5);
});

test('rejects invalid workload and missing parameter count', () => {
  const errors = validateInput(
    { ...DEFAULT_INPUT, contextTokens: 0, concurrentRequests: 1.5 },
    { ...DEFAULT_MODEL, parameterCount: null },
  );
  assert.match(errors.join(' '), /Max context/);
  assert.match(errors.join(' '), /whole number/);
  assert.match(errors.join(' '), /parameter count/);
});
