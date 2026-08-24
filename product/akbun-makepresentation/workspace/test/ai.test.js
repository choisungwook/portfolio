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

test('slide mode turn explains nullable strict fields', () => {
  const turn = A.composeTurn({
    mode: 'slide',
    prompt: 'Polish this slide.',
    slide: L.createSlide(),
    size: { width: 1280, height: 720 },
    slideNumber: 4,
  });
  assert.match(turn, /set every field you are not changing to null/);
  assert.match(turn, /Set fields the kind does not use to null/);
  assert.match(turn, /Set background only when/);
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
  const { patch } = A.parseSlidePatch(encoded, source.shapes.length);
  const changed = A.applySlidePatch(source, patch);

  assert.equal(source.shapes[0].text, 'Old title');
  assert.equal(changed.shapes[0].text, 'New title');
  assert.equal(changed.shapes[1].src, image.src);
  assert.equal(changed.shapes[2].text, 'Footer');
  assert.equal(changed.background, '#fff9db');
});

test('slide patch rejects invalid indices and image additions, and says why', () => {
  const outOfRange = A.parseSlidePatch(JSON.stringify({
    summary: 'bad',
    operations: [{ op: 'remove', index: 4 }],
  }), 1);
  assert.equal(outOfRange.patch, null);
  assert.match(outOfRange.reason, /index 4.*1 shape.*0 to 0/);

  const image = A.parseSlidePatch(JSON.stringify({
    summary: 'bad',
    operations: [{
      op: 'add',
      shape: { kind: 'image', x: 0, y: 0, w: 10, h: 10 },
    }],
  }), 1);
  assert.equal(image.patch, null);
  assert.match(image.reason, /image shape/);

  const notJson = A.parseSlidePatch('Sure, here is the slide!', 1);
  assert.equal(notJson.patch, null);
  assert.match(notJson.reason, /not a single JSON object/);
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
  const { patch } = A.parseSlidePatch(JSON.stringify({
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

// --- slide recognition -------------------------------------------------------------------------

function slideWith(...shapes) {
  const slide = L.createSlide();
  slide.shapes.push(...shapes);
  return slide;
}

function sized(kind, x, y, w, h, extra = {}) {
  const shape = L.createShape(kind, x, y, {});
  shape.w = w;
  shape.h = h;
  return Object.assign(shape, extra);
}

test('slide digest states the coordinate system, the z-order and every index', () => {
  const digest = A.slideDigest(
    slideWith(sized('rect', 100, 200, 400, 180, { text: 'API Gateway' }), sized('arrow', 520, 290, 240, 0)),
    { size: { width: 1920, height: 1080 }, slideNumber: 2, slideCount: 5 }
  );
  assert.match(digest, /Slide 2 of 5/);
  assert.match(digest, /Origin \(0,0\) is the top-left corner/);
  assert.match(digest, /a later index draws on top of an earlier one/);
  assert.match(digest, /\[0\] rect x 100–500 \(w 400\) y 200–380 \(h 180\) centre \(300,290\)/);
  assert.match(digest, /"API Gateway"/);
  assert.match(digest, /\[1\] arrow from \(520,290\) to \(760,290\) · horizontal, length 240/);
});

test('slide digest says an empty slide has no indices rather than listing nothing', () => {
  const digest = A.slideDigest(L.createSlide(), { size: { width: 1920, height: 1080 } });
  assert.match(digest, /The slide is empty/);
  assert.doesNotMatch(digest, /listed back to front/);
});

test('slide digest measures the overlaps and strays a tidy-up is asked to fix', () => {
  const digest = A.slideDigest(
    slideWith(
      sized('rect', 100, 100, 400, 200),
      sized('rect', 300, 150, 400, 200),
      sized('rect', 1800, 900, 400, 300)
    ),
    { size: { width: 1920, height: 1080 } }
  );
  assert.match(digest, /shapes 0 and 1 overlap by about \d+%/);
  assert.match(digest, /shape 2 runs outside the canvas/);
});

test('slide digest flags near misses that read as sloppiness', () => {
  const digest = A.slideDigest(
    slideWith(sized('rect', 100, 100, 300, 120), sized('rect', 104, 400, 306, 118)),
    { size: { width: 1920, height: 1080 } }
  );
  assert.match(digest, /within 12px of a shared left edge but not aligned/);
  assert.match(digest, /nearly the same size but not identical/);
});

test('a clean slide reports no findings instead of inventing them', () => {
  const digest = A.slideDigest(
    slideWith(sized('rect', 100, 100, 300, 120), sized('rect', 500, 100, 300, 120)),
    { size: { width: 1920, height: 1080 } }
  );
  assert.match(digest, /Measured issues on this slide: none found/);
});

test('an image shape is named as untouchable pixels with a movable box', () => {
  const digest = A.slideDigest(
    slideWith(sized('image', 10, 20, 100, 80, { src: 'data:image/png;base64,AAAA' })),
    { size: { width: 1920, height: 1080 } }
  );
  assert.match(digest, /The app keeps the pixels/);
  assert.doesNotMatch(digest, /base64/);
});

// --- turn composition --------------------------------------------------------------------------

test('every mode carries its own rules and no other mode\'s', () => {
  const options = { prompt: 'hello', slide: L.createSlide(), size: { width: 1920, height: 1080 } };
  const text = A.composeTurn({ ...options, mode: 'text' });
  const image = A.composeTurn({ ...options, mode: 'image' });
  const slide = A.composeTurn({ ...options, mode: 'slide' });
  assert.match(text, /^TEXT MODE/);
  assert.doesNotMatch(text, /SLIDE MODE|IMAGE MODE/);
  assert.match(image, /^\$imagegen IMAGE MODE/);
  assert.doesNotMatch(image, /TEXT MODE|SLIDE MODE/);
  assert.match(slide, /^SLIDE MODE/);
  assert.doesNotMatch(slide, /TEXT MODE|IMAGE MODE/);
});

test('text mode is given the slide, image mode is not', () => {
  const slide = slideWith(sized('rect', 0, 0, 100, 100, { text: 'Only on this slide' }));
  const options = { prompt: 'go', slide, size: { width: 1920, height: 1080 } };
  assert.match(A.composeTurn({ ...options, mode: 'text' }), /Only on this slide/);
  assert.doesNotMatch(A.composeTurn({ ...options, mode: 'image' }), /Only on this slide/);
});

test('a chip reaches the prompt only through its instructions, never as a label', () => {
  const turn = A.composeTurn({
    mode: 'slide',
    prompt: '주문 처리 흐름',
    chipIds: ['arch-draw'],
    slide: L.createSlide(),
    size: { width: 1920, height: 1080 },
  });
  assert.match(turn, /Draw the requested system as an IT architecture diagram/);
  assert.match(turn, /User request: 주문 처리 흐름/);
});

test('chips of another mode are ignored so a stale toggle cannot leak', () => {
  const turn = A.composeTurn({
    mode: 'text',
    prompt: 'go',
    chipIds: ['style-webtoon', 'arch-draw', 'text-polish'],
    slide: L.createSlide(),
    size: { width: 1920, height: 1080 },
  });
  assert.match(turn, /works on a projector/);
  assert.doesNotMatch(turn, /webtoon/i);
  assert.doesNotMatch(turn, /architecture diagram/);
});

test('diagram style appears only when a chip asks for it', () => {
  const options = {
    mode: 'slide',
    prompt: 'go',
    slide: L.createSlide(),
    size: { width: 1920, height: 1080 },
    style: { layout: 'flow', palette: 'ocean' },
  };
  assert.doesNotMatch(A.composeTurn(options), /Palette "Ocean"/);
  const styled = A.composeTurn({ ...options, chipIds: ['arch-draw'] });
  assert.match(styled, /Layout "Left to right flow"/);
  assert.match(styled, /Palette "Ocean"/);
  assert.match(styled, /#0369a1/);
});

test('an unknown layout or palette falls back instead of emitting an empty rule', () => {
  const turn = A.composeTurn({
    mode: 'slide',
    prompt: 'go',
    chipIds: ['arch-draw'],
    slide: L.createSlide(),
    size: { width: 1920, height: 1080 },
    style: { layout: 'nope', palette: 'also-nope' },
  });
  assert.match(turn, /Layout "Layered tiers"/);
  assert.match(turn, /Palette "Slate & Amber"/);
});

test('every palette is a complete set of six-digit hex colours', () => {
  assert.ok(A.PALETTES.length >= 8, 'at least eight palettes to choose between');
  const keys = ['background', 'surface', 'surfaceAlt', 'border', 'accent', 'connector', 'text', 'textOnAccent', 'muted'];
  for (const palette of A.PALETTES) {
    for (const key of keys) {
      assert.match(palette[key], /^#[0-9a-f]{6}$/, `${palette.id}.${key} is not a slide colour`);
    }
  }
  const ids = A.PALETTES.map((palette) => palette.id);
  assert.equal(new Set(ids).size, ids.length, 'palette ids are not unique');
});

test('every layout writes concrete coordinates inside the zone it was given', () => {
  for (const layout of A.LAYOUTS) {
    const turn = A.composeTurn({
      mode: 'slide',
      prompt: 'go',
      chipIds: ['arch-draw'],
      slide: L.createSlide(),
      size: { width: 1920, height: 1080 },
      style: { layout: layout.id, palette: 'mono' },
    });
    assert.match(turn, new RegExp(`Layout "${layout.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
    assert.match(turn, /x=\d+|x \d+–\d+|column c, row r/, `${layout.id} states no coordinates`);
  }
});

test('the retry carries the parser reason and the answer it is replacing', () => {
  const retry = A.retryTurn('SLIDE MODE. original request', 'operation 0 uses index 9');
  assert.match(retry, /could not be applied/);
  assert.match(retry, /Reason: operation 0 uses index 9/);
  assert.match(retry, /SLIDE MODE\. original request/);
});

test('base instructions tell the model the slide reading is all it gets', () => {
  const instructions = A.baseInstructions({ text: 'T', image: 'I', slide: 'S' });
  assert.match(instructions, /You never see the deck file/);
  assert.match(instructions, /Treat that reading as authoritative/);
});
