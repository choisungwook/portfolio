import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, DEFAULT_INPUT, validateInput } from '../src/lib/calculator.js';

test('calculates replicas and leaves an incomplete tensor-parallel group unused', () => {
  const result = calculate({ ...DEFAULT_INPUT, totalGpus: 5, tensorParallel: 2 });
  assert.equal(result.replicas, 2);
  assert.equal(result.allocatedGpus, 4);
  assert.equal(result.unusedGpus, 1);
});

test('takes the smaller prefill or decode request budget', () => {
  const result = calculate(DEFAULT_INPUT);
  assert.equal(result.prefillRps, 6.5625);
  assert.equal(result.decodeRps, 4.25);
  assert.equal(result.maxRps, 4.25);
  assert.equal(result.bottleneck, 'decode');
  assert.equal(result.totalTps, 5440);
});

test('applies safety reserve to capacity but reports raw target utilization', () => {
  const result = calculate(DEFAULT_INPUT);
  assert.equal(result.safeFactor, 0.8);
  assert.equal(result.safePrefillTps, 6720);
  assert.equal(result.safeDecodeTps, 1088);
  assert.ok(Math.abs(result.prefillUtilization - (1536 / 8400)) < 1e-12);
  assert.ok(Math.abs(result.decodeUtilization - (384 / 1360)) < 1e-12);
  assert.equal(result.targetFits, true);
});

test('estimates latency from per-replica rates and measured concurrency', () => {
  const result = calculate(DEFAULT_INPUT);
  assert.ok(Math.abs(result.ttftMs - 243.8095238) < 0.001);
  assert.ok(Math.abs(result.itlMs - 23.5294117) < 0.001);
  assert.ok(Math.abs(result.generationMs - 6000) < 0.001);
  assert.ok(Math.abs(result.e2eMs - 6268.8095238) < 0.001);
});

test('rounds context to a KV block and calculates standard KV memory', () => {
  const result = calculate({ ...DEFAULT_INPUT, promptTokens: 1025, outputTokens: 256 });
  assert.equal(result.contextTokens, 1281);
  assert.equal(result.roundedContextTokens, 1296);
  assert.equal(result.kvBytesPerToken, 131072);
  assert.equal(result.kvRequestMib, 162);
  assert.equal(result.kvSequencesPerReplica, 151);
  assert.equal(result.kvSequencesSystem, 302);
});

test('recommends enough complete replicas for a target above current capacity', () => {
  const result = calculate({ ...DEFAULT_INPUT, targetRps: 10 });
  assert.equal(result.targetFits, false);
  assert.equal(result.recommendedReplicas, 5);
  assert.equal(result.recommendedGpus, 10);
});

test('rejects invalid numeric and topology inputs', () => {
  assert.deepEqual(validateInput({ ...DEFAULT_INPUT, tensorParallel: 8 }), ['Tensor parallel cannot exceed total GPUs']);
  assert.match(validateInput({ ...DEFAULT_INPUT, reservePercent: 100 })[0], /reservePercent/);
  assert.match(validateInput({ ...DEFAULT_INPUT, promptTokens: 0 })[0], /promptTokens/);
  assert.match(validateInput({ ...DEFAULT_INPUT, totalGpus: 1.5 })[0], /whole number/);
});
