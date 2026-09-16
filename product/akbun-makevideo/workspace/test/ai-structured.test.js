'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/ai.js');

function client(models = [{ id: 'gpt-6-astra' }]) {
  let deliver;
  let stopped;
  let turnNumber = 0;
  let startedTurnId;
  const calls = [];
  global.document = { getElementById: () => null };
  global.makevideoAiLib = A;
  global.makevideoAiStructured = require('../src/ai-structured.js');
  global.window = { api: {
    available: true,
    onAiServerMessage: async (handler) => { deliver = handler; },
    onAiServerState: async (handler) => { stopped = handler; },
    aiStartServer: async () => ({ version: 'test' }),
    aiRuntimeDirectory: async () => '/tmp/isolated',
    aiSendRpc: async (message) => {
      calls.push(message);
      if (message.id == null) return;
      const result = {
        initialize: {}, 'account/read': { account: { type: 'chatgpt' } },
        'modelProvider/capabilities/read': {}, 'model/list': { data: models },
        'config/read': { config: { mcp_servers: { untrusted: {} } } },
        'thread/start': { thread: { id: `thread-${calls.length}` } },
        'turn/start': { turn: { id: `turn-${++turnNumber}` } },
        'turn/interrupt': {},
      }[message.method];
      if (message.method === 'turn/start') startedTurnId = result.turn.id;
      queueMicrotask(() => deliver({ id: message.id, result }));
    },
  } };
  delete require.cache[require.resolve('../src/ai-panel.js')];
  const panel = require('../src/ai-panel.js');
  return {
    panel, calls,
    finish(text) {
      const start = calls.findLast((call) => call.method === 'turn/start');
      deliver({ method: 'item/completed', params: { threadId: start.params.threadId, item: { type: 'agentMessage', phase: 'final_answer', text } } });
      deliver({ method: 'turn/completed', params: { threadId: start.params.threadId, turn: { id: startedTurnId, status: 'completed' } } });
    },
    stopped: () => stopped(),
  };
}

async function untilStarted(fixture) {
  for (let index = 0; index < 30; index += 1) {
    if (fixture.calls.some((call) => call.method === 'turn/start')) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Turn did not start');
}

test('structured editing uses Astra with schema and image input in an isolated thread', async () => {
  const fixture = client();
  const pending = fixture.panel.requestStructured('Analyze', { type: 'object' }, ['data:image/jpeg;base64,AA==']);
  await untilStarted(fixture);
  const request = fixture.calls.find((call) => call.method === 'turn/start').params;
  assert.equal(request.model, 'gpt-6-astra');
  assert.equal(request.effort, 'high');
  assert.equal(request.input[1].type, 'image');
  const thread = fixture.calls.find((call) => call.method === 'thread/start').params;
  assert.equal(thread.ephemeral, true);
  assert.equal(thread.config.mcp_servers.untrusted.enabled, false);
  await assert.rejects(fixture.panel.requestStructured('Overlap', {}), /Finish or stop/);
  fixture.finish('{"ok":true}');
  assert.equal(await pending, '{"ok":true}');
});

test('Astra unavailable fails instead of using a different subscription model', async () => {
  const fixture = client([{ id: 'gpt-5.6-luna' }]);
  await assert.rejects(fixture.panel.requestStructured('Edit', {}), /Astra is not available/);
  assert.equal(fixture.calls.some((call) => call.method === 'turn/start'), false);
});

test('stopping structured generation rejects its result and interrupts the turn', async () => {
  const fixture = client();
  const pending = fixture.panel.requestStructured('Edit', {});
  const rejection = assert.rejects(pending, /Request stopped/);
  await untilStarted(fixture);
  await fixture.panel.cancelStructured();
  await rejection;
  assert.ok(fixture.calls.some((call) => call.method === 'turn/interrupt'));
});

test('server exit rejects an active structured request without waiting for timeout', async () => {
  const fixture = client();
  const pending = fixture.panel.requestStructured('Edit', {});
  const rejection = assert.rejects(pending, /Server stopped/);
  await untilStarted(fixture);
  fixture.stopped();
  await rejection;
});
