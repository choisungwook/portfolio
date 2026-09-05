'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const A = require('../src/ai.js');

test('creates an app-owned active session from the first prompt', () => {
  const session = A.createSession('conversation-1', '  Make a concise title sequence  ', 'text');

  assert.equal(session.id, 'conversation-1');
  assert.equal(session.title, 'Make a concise title sequence');
  assert.equal(session.status, 'active');
  assert.equal(session.messages[0].role, 'user');
  assert.equal(session.messages[0].mode, 'text');
});

test('normalizes restored sessions as bounded safe data', () => {
  const restored = A.normalizeSession({
    id: 'saved',
    status: 'unexpected',
    messages: [{
      role: 'assistant',
      mode: 'unknown',
      status: 'streaming',
      images: [
        { id: 'ok', fileName: 'image-1.png', sizeBytes: 32 },
        { id: 'bad', fileName: '../secret.png', sizeBytes: 64 },
      ],
    }],
  });

  assert.equal(restored.status, 'readonly');
  assert.equal(restored.messages[0].mode, 'text');
  assert.deepEqual(restored.messages[0].images.map((image) => image.id), ['ok']);
});

test('keeps a valid saved response longer than one million characters', () => {
  const text = 'a'.repeat(1_000_001);
  const restored = A.normalizeSession({
    id: 'large-response',
    messages: [{ role: 'assistant', text }],
  });

  assert.equal(restored.messages[0].text.length, text.length);
});

test('turns a session interrupted by app exit into read-only stopped history', () => {
  const restored = A.restoreInterruptedSession({
    id: 'interrupted',
    status: 'active',
    messages: [{ role: 'assistant', status: 'streaming', text: 'partial' }],
  });

  assert.equal(restored.status, 'readonly');
  assert.equal(restored.readonlyReason, 'app_closed');
  assert.equal(restored.messages[0].status, 'stopped');
  assert.equal(restored.messages[0].text, 'partial');
});

test('drops stale server state so the next turn can reconnect', () => {
  const connection = A.disconnectedConnection('process exited');

  assert.equal(connection.state, 'unavailable');
  assert.equal(connection.server, null);
  assert.equal(connection.account, null);
  assert.equal(connection.detail, 'process exited');
});

test('accounts for JSON escaping before accepting a streaming delta', () => {
  const almostFull = A.SESSION_LIMIT_BYTES - A.SESSION_RESERVE_BYTES - 1;

  assert.equal(A.canAppendText(almostFull, 'a'), true);
  assert.equal(A.canAppendText(almostFull, '\n'), false);
});

test('project digest exposes counts without file paths or media contents', () => {
  const digest = A.projectDigest({
    settings: { width: 1920, height: 1080, rate: { num: 30000, den: 1001 } },
    assets: [{ path: '/private/video.mov' }],
    markers: [{ frame: 10 }],
    tracks: [{ id: 'v1', name: 'Video 1', kind: 'video', clips: [{ id: 'c1' }] }],
  });

  assert.match(digest, /1920x1080/);
  assert.match(digest, /30000\/1001/);
  assert.match(digest, /Video 1: video, 1 clips/);
  assert.doesNotMatch(digest, /private|video\.mov/);
});

test('turn prompts lock output mode and include the current project summary', () => {
  const turn = A.composeTurn('image', 'Draw a title card', {
    settings: { width: 1080, height: 1920, rate: { num: 30, den: 1 } },
    assets: [],
    markers: [],
    tracks: [],
  });

  assert.match(turn, /^IMAGE MODE\./);
  assert.match(turn, /Current project summary:\nCanvas: 1080x1920/);
  assert.match(turn, /User request:\nDraw a title card/);
});
