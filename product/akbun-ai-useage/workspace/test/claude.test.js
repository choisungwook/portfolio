'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { collectClaudeRecords, parseClaudeLimits, parseClaudeLog } = require('../src/claude');

function assistant(id, ts, usage, model = 'claude-opus-5-5') {
  return JSON.stringify({ type: 'assistant', timestamp: ts, requestId: `req_${id}`, message: { id: `msg_${id}`, model, usage } });
}

test('parseClaudeLog keeps assistant usage and skips everything else', () => {
  const text = [
    JSON.stringify({ type: 'user', timestamp: '2026-09-23T01:00:00Z', message: { content: 'hi' } }),
    assistant('a', '2026-09-23T01:00:01Z', {
      input_tokens: 10,
      output_tokens: 20,
      cache_read_input_tokens: 300,
      cache_creation_input_tokens: 40,
    }),
    assistant('b', '2026-09-23T01:00:02Z', { input_tokens: 1, output_tokens: 1 }, '<synthetic>'),
    'not json',
    '',
  ].join('\n');

  const records = parseClaudeLog(text);
  assert.strictEqual(records.length, 1);
  assert.deepStrictEqual(
    { input: records[0].input, output: records[0].output, cacheRead: records[0].cacheRead, cacheWrite: records[0].cacheWrite },
    { input: 10, output: 20, cacheRead: 300, cacheWrite: 40 }
  );
});

test('collectClaudeRecords counts a message logged in two sessions once', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-test-'));
  const dir = path.join(root, 'projects', 'p');
  fs.mkdirSync(dir, { recursive: true });
  const line = assistant('same', '2026-09-23T01:00:00Z', { input_tokens: 5, output_tokens: 5 });
  fs.writeFileSync(path.join(dir, 'one.jsonl'), line);
  fs.writeFileSync(path.join(dir, 'resumed.jsonl'), `${line}\n${assistant('other', '2026-09-23T01:01:00Z', { input_tokens: 1, output_tokens: 1 })}`);

  try {
    const records = await collectClaudeRecords(0, new Map(), { CLAUDE_CONFIG_DIR: root });
    assert.strictEqual(records.length, 2);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('parseClaudeLimits reads the windows that are present', () => {
  const windows = parseClaudeLimits({
    five_hour: { utilization: 33, resets_at: '2026-04-11T07:00:00.528743+00:00' },
    seven_day: { utilization: 13, resets_at: '2026-04-17T00:59:59.951713+00:00' },
    seven_day_opus: null,
    seven_day_sonnet: { utilization: 1, resets_at: '2026-04-16T03:00:00Z' },
  });
  assert.deepStrictEqual(windows.map((w) => [w.label, w.percent]), [['5h', 33], ['7d', 13], ['7d Sonnet', 1]]);
  assert.strictEqual(windows[0].resetsAt, Date.parse('2026-04-11T07:00:00.528Z'));
});
