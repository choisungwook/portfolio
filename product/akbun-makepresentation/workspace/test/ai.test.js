'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/editor.js');
const A = require('../src/ai.js');

test('session starts with the first user message and a compact title', () => {
  const session = A.createSession('session-1', '  Make   this title intentionally longer than forty eight characters please  ', 'slide');
  assert.equal(session.id, 'session-1');
  assert.equal(session.messages.length, 1);
  assert.equal(session.messages[0].role, 'user');
  assert.equal(session.messages[0].mode, 'slide');
  assert.equal(session.title.length, 48);
  assert.equal(session.status, 'active');
});

test('session normalizer accepts only stored image file names', () => {
  const session = A.normalizeSession({
    id: 'session-1',
    status: 'readonly',
    messages: [{
      role: 'assistant',
      images: [
        { id: 'one', fileName: 'one.png', sizeBytes: 20 },
        { id: 'two', fileName: '../outside.png', sizeBytes: 50 },
      ],
    }],
  });
  assert.deepEqual(session.messages[0].images.map((image) => image.fileName), ['one.png']);
  assert.equal(session.assetBytes, 20);
});

test('text capacity reserves room for the stopped and readonly state', () => {
  const answerBytes = A.encodedJsonTextBytes('answer');
  const available = A.SESSION_LIMIT_BYTES - A.SESSION_RESERVE_BYTES - answerBytes;
  assert.equal(A.canAppendText(available, 'answer'), true);
  assert.equal(A.canAppendText(available + 1, 'answer'), false);
  assert.equal(A.encodedJsonTextBytes('a\n"💡'), 9);
});

test('slide patch changes a clone and preserves the source slide', () => {
  const source = L.createSlide();
  const title = L.createShape('text', 100, 80, {});
  title.w = 500;
  title.h = 100;
  title.text = 'Old title';
  const image = L.createShape('image', 200, 300, {});
  image.w = 400;
  image.h = 250;
  image.src = 'data:image/png;base64,AAAA';
  source.shapes.push(title, image);

  const encoded = JSON.stringify({
    summary: 'Updated title and added a footer.',
    background: '#fff9db',
    operations: [
      { op: 'update', index: 0, changes: { text: 'New title', fontSize: 42 } },
      {
        op: 'add',
        shape: {
          kind: 'text', x: 100, y: 900, w: 600, h: 60, text: 'Footer',
          stroke: 'none', fill: 'none', textColor: '#1a1a1a', fontSize: 24,
        },
      },
    ],
  });
  const patch = A.parseSlidePatch(encoded, source.shapes.length);
  const changed = A.applySlidePatch(source, patch);

  assert.equal(source.shapes[0].text, 'Old title');
  assert.equal(changed.shapes[0].text, 'New title');
  assert.equal(changed.shapes[1].src, image.src);
  assert.equal(changed.shapes[2].text, 'Footer');
  assert.equal(changed.background, '#fff9db');
});

test('slide patch rejects invalid indices and image additions', () => {
  assert.equal(A.parseSlidePatch(JSON.stringify({
    summary: 'bad',
    operations: [{ op: 'remove', index: 4 }],
  }), 1), null);
  assert.equal(A.parseSlidePatch(JSON.stringify({
    summary: 'bad',
    operations: [{
      op: 'add',
      shape: { kind: 'image', x: 0, y: 0, w: 10, h: 10 },
    }],
  }), 1), null);
});
