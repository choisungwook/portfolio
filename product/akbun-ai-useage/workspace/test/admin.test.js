'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const {
  parseAnthropicCostPage,
  parseAnthropicUsagePage,
  parseOpenAICostPage,
  parseOpenAIUsagePage,
} = require('../src/admin');

test('Anthropic usage buckets sum uncached, cache read and both cache writes', () => {
  const [record] = parseAnthropicUsagePage({
    data: [
      {
        starting_at: '2026-09-22T00:00:00Z',
        results: [
          {
            uncached_input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 400,
            cache_creation: { ephemeral_1h_input_tokens: 10, ephemeral_5m_input_tokens: 20 },
          },
          { uncached_input_tokens: 1, output_tokens: 2 },
        ],
      },
    ],
  });
  assert.deepStrictEqual(record, {
    ts: Date.parse('2026-09-22T00:00:00Z'),
    input: 101,
    output: 52,
    cacheRead: 400,
    cacheWrite: 30,
  });
});

test('Anthropic cost amounts are cents', () => {
  const [cost] = parseAnthropicCostPage({
    data: [{ starting_at: '2026-09-22T00:00:00Z', results: [{ amount: '1234.5' }, { amount: '100' }] }],
  });
  assert.strictEqual(cost.usd, 13.345);
});

test('OpenAI usage splits cached input out of input tokens', () => {
  const [record] = parseOpenAIUsagePage({
    data: [{ start_time: 1790000000, results: [{ input_tokens: 1000, input_cached_tokens: 600, output_tokens: 70 }] }],
  });
  assert.deepStrictEqual(record, { ts: 1790000000000, input: 400, output: 70, cacheRead: 600, cacheWrite: 0 });
});

test('OpenAI cost amounts are dollars', () => {
  const [cost] = parseOpenAICostPage({
    data: [{ start_time: 1790000000, results: [{ amount: { value: 1.25, currency: 'usd' } }, { amount: { value: 0.5 } }] }],
  });
  assert.strictEqual(cost.usd, 1.75);
});
