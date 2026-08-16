'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/editor.js');
const A = require('../src/ai.js');

function assertStrictObjects(schema, path = 'schema') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') {
    const properties = Object.keys(schema.properties || {}).sort();
    assert.equal(schema.additionalProperties, false, `${path} allows extra properties`);
    assert.deepEqual([...(schema.required || [])].sort(), properties, `${path} has optional fields`);
  }
  for (const [name, child] of Object.entries(schema)) {
    if (Array.isArray(child)) {
      child.forEach((item, index) => assertStrictObjects(item, `${path}.${name}[${index}]`));
    } else if (child && typeof child === 'object') {
      assertStrictObjects(child, `${path}.${name}`);
    }
  }
}

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

test('slide output schema makes every object field required', () => {
  assertStrictObjects(A.SLIDE_OUTPUT_SCHEMA);
});

test('slide prompt explains nullable strict fields', () => {
  const prompt = A.slidePrompt('Polish this slide.', L.createSlide(), { width: 1280, height: 720 }, 4);
  assert.match(prompt, /unchanged field in changes to null/);
  assert.match(prompt, /fields unused by the shape kind to null/);
  assert.match(prompt, /background to null unless/);
});

test('add shape schema keeps core geometry required and allows unused fields to be null', () => {
  const shapeSchema = A.SLIDE_OUTPUT_SCHEMA.properties.operations.items.anyOf[2]
    .properties.shape;
  for (const name of ['kind', 'x', 'y', 'w', 'h']) {
    assert.equal(shapeSchema.properties[name].anyOf, undefined);
  }
  for (const name of ['points', 'stroke', 'text', 'bold', 'arrowEnd']) {
    assert.deepEqual(shapeSchema.properties[name].anyOf.at(-1), { type: 'null' });
  }
});

test('AI base instructions carry each configured system prompt', () => {
  const instructions = A.baseInstructions({
    text: 'Text rules',
    image: 'Image rules',
    slide: 'Slide rules',
  });
  assert.match(instructions, /<TEXT_MODE_SYSTEM_PROMPT>Text rules<\/TEXT_MODE_SYSTEM_PROMPT>/);
  assert.match(instructions, /<IMAGE_MODE_SYSTEM_PROMPT>Image rules<\/IMAGE_MODE_SYSTEM_PROMPT>/);
  assert.match(instructions, /<SLIDE_MODE_SYSTEM_PROMPT>Slide rules<\/SLIDE_MODE_SYSTEM_PROMPT>/);
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

test('null update fields mean unchanged in strict structured output', () => {
  const source = L.createSlide();
  const arrow = L.createShape('arrow', 10, 20, {});
  arrow.w = 200;
  arrow.h = 100;
  arrow.arrowEnd = 'diamond';
  source.shapes.push(arrow);

  const changeSchema = A.SLIDE_OUTPUT_SCHEMA.properties.operations.items.anyOf[0]
    .properties.changes;
  const changes = Object.fromEntries(changeSchema.required.map((name) => [name, null]));
  changes.x = 40;
  const patch = A.parseSlidePatch(JSON.stringify({
    summary: 'Moved the arrow.',
    background: null,
    operations: [{
      op: 'update',
      index: 0,
      changes,
    }],
  }), 1);
  const changed = A.applySlidePatch(source, patch);

  assert.equal(changed.shapes[0].x, 40);
  assert.equal(changed.shapes[0].arrowEnd, 'diamond');
  assert.equal(changed.background, source.background);
});
