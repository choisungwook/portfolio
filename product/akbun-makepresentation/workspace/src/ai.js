'use strict';

(() => {
  const L = typeof module !== 'undefined' && module.exports
    ? require('./editor.js')
    : globalThis.slidesLib;

  const SESSION_VERSION = 1;
  const MAX_SESSIONS = 3;
  const SESSION_LIMIT_BYTES = 128 * 1024 * 1024;
  const SESSION_RESERVE_BYTES = 4 * 1024;
  const MODES = new Set(['text', 'image', 'slide']);
  const MESSAGE_STATUSES = new Set(['streaming', 'complete', 'stopped', 'error']);
  const SESSION_STATUSES = new Set(['active', 'readonly']);
  const CHANGE_FIELDS = new Set([
    'x', 'y', 'w', 'h', 'stroke', 'strokeWidth', 'dash', 'fill', 'text', 'fontSize',
    'textColor', 'fontFamily', 'bold', 'italic', 'underline', 'textAlign',
    'verticalAlign', 'rotation', 'arrowStart', 'arrowEnd',
  ]);

  function now() {
    return new Date().toISOString();
  }

  function safeText(value, limit = 1_000_000) {
    return typeof value === 'string' ? value.slice(0, limit) : '';
  }

  function sessionTitle(prompt) {
    const title = String(prompt || '').replace(/\s+/g, ' ').trim();
    if (!title) return 'Untitled conversation';
    return title.length > 48 ? `${title.slice(0, 47)}…` : title;
  }

  function createMessage(role, mode, text, status = 'complete') {
    return {
      id: cryptoId(),
      role: role === 'assistant' ? 'assistant' : 'user',
      mode: MODES.has(mode) ? mode : 'text',
      text: safeText(text),
      status: MESSAGE_STATUSES.has(status) ? status : 'complete',
      createdAt: now(),
      images: [],
    };
  }

  function createSession(id, prompt, mode) {
    const createdAt = now();
    return {
      version: SESSION_VERSION,
      id,
      title: sessionTitle(prompt),
      createdAt,
      updatedAt: createdAt,
      status: 'active',
      readonlyReason: null,
      sizeBytes: 0,
      assetBytes: 0,
      messages: [createMessage('user', mode, prompt)],
    };
  }

  function normalizeImage(value) {
    const source = value && typeof value === 'object' ? value : {};
    const fileName = safeText(source.fileName, 140);
    if (!/^[a-zA-Z0-9_-]{1,64}\.(png|jpg|jpeg|webp)$/i.test(fileName)) return null;
    return {
      id: safeText(source.id, 64),
      fileName,
      path: safeText(source.path, 4096),
      sizeBytes: Math.max(0, Number(source.sizeBytes) || 0),
    };
  }

  function normalizeMessage(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      id: safeText(source.id, 64) || cryptoId(),
      role: source.role === 'assistant' ? 'assistant' : 'user',
      mode: MODES.has(source.mode) ? source.mode : 'text',
      text: safeText(source.text),
      status: MESSAGE_STATUSES.has(source.status) ? source.status : 'complete',
      createdAt: safeText(source.createdAt, 40) || now(),
      images: Array.isArray(source.images)
        ? source.images.map(normalizeImage).filter(Boolean).slice(0, 100)
        : [],
    };
  }

  function normalizeSession(value) {
    const source = value && typeof value === 'object' ? value : {};
    const messages = Array.isArray(source.messages)
      ? source.messages.map(normalizeMessage).slice(0, 10_000)
      : [];
    return {
      version: SESSION_VERSION,
      id: safeText(source.id, 64),
      title: safeText(source.title, 80) || 'Untitled conversation',
      createdAt: safeText(source.createdAt, 40) || now(),
      updatedAt: safeText(source.updatedAt, 40) || now(),
      status: SESSION_STATUSES.has(source.status) ? source.status : 'readonly',
      readonlyReason: source.readonlyReason == null ? null : safeText(source.readonlyReason, 80),
      sizeBytes: Math.max(0, Number(source.sizeBytes) || 0),
      assetBytes: Math.max(
        0,
        Number(source.assetBytes) || messages.flatMap((message) => message.images)
          .reduce((sum, image) => sum + image.sizeBytes, 0)
      ),
      messages,
    };
  }

  function byteLength(value) {
    return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`).byteLength;
  }

  function encodedJsonTextBytes(value) {
    const encoded = JSON.stringify(String(value || '')).slice(1, -1);
    return new TextEncoder().encode(encoded).byteLength;
  }

  function canAppendText(currentBytes, delta) {
    return currentBytes + encodedJsonTextBytes(delta) + SESSION_RESERVE_BYTES <= SESSION_LIMIT_BYTES;
  }

  function cryptoId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }

  function slideSnapshot(slide) {
    const copy = structuredClone(slide);
    for (const shape of copy.shapes || []) {
      if (shape.kind === 'image') shape.src = '[existing image preserved by the app]';
    }
    return copy;
  }

  function slidePrompt(prompt, slide, size, slideNumber) {
    return [
      `Modify slide ${slideNumber} according to the request below.`,
      'Return only the JSON object required by the output schema.',
      'Use zero-based shape indices from the supplied slide.',
      'Do not add image shapes. Existing image shapes may be repositioned with update operations.',
      'For update operations, set every unchanged field in changes to null.',
      'For add operations, set fields unused by the shape kind to null. Pen shapes still require points.',
      'Set background to null unless the slide background should change.',
      '',
      `Request: ${prompt}`,
      `Slide size: ${JSON.stringify(size)}`,
      `Slide: ${JSON.stringify(slideSnapshot(slide))}`,
    ].join('\n');
  }

  function baseInstructions(systemPrompts) {
    const prompts = systemPrompts && typeof systemPrompts === 'object' ? systemPrompts : {};
    return [
      'You are the AI assistant inside akbun-makepresentation.',
      'Help with presentation text, generated images, and structured slide edits.',
      'Follow the developer instructions and return only the requested result.',
      '',
      'App-configured system prompts follow. Apply the prompt matching the request mode.',
      `<TEXT_MODE_SYSTEM_PROMPT>${safeText(prompts.text, 20_000)}</TEXT_MODE_SYSTEM_PROMPT>`,
      `<IMAGE_MODE_SYSTEM_PROMPT>${safeText(prompts.image, 20_000)}</IMAGE_MODE_SYSTEM_PROMPT>`,
      `<SLIDE_MODE_SYSTEM_PROMPT>${safeText(prompts.slide, 20_000)}</SLIDE_MODE_SYSTEM_PROMPT>`,
    ].join('\n');
  }

  const colorSchema = { type: 'string', pattern: '^(none|#[0-9a-fA-F]{6})$' };
  const nullable = (schema) => ({ anyOf: [schema, { type: 'null' }] });
  const strictObject = (properties) => ({
    type: 'object',
    additionalProperties: false,
    required: Object.keys(properties),
    properties,
  });
  const shapeProperties = {
    kind: { type: 'string', enum: ['rect', 'ellipse', 'line', 'arrow', 'pen', 'text'] },
    x: { type: 'number' },
    y: { type: 'number' },
    w: { type: 'number' },
    h: { type: 'number' },
    points: {
      type: 'array',
      maxItems: 10_000,
      items: { type: 'array', minItems: 2, maxItems: 2, items: { type: 'number' } },
    },
    stroke: colorSchema,
    strokeWidth: { type: 'number', minimum: 0, maximum: 1000 },
    dash: { type: 'string', enum: ['solid', 'dash', 'dot'] },
    fill: colorSchema,
    text: { type: 'string', maxLength: 100_000 },
    fontSize: { type: 'number', minimum: 1, maximum: 1000 },
    textColor: colorSchema,
    fontFamily: { type: 'string', maxLength: 200 },
    bold: { type: 'boolean' },
    italic: { type: 'boolean' },
    underline: { type: 'boolean' },
    textAlign: { type: 'string', enum: ['left', 'center', 'right'] },
    verticalAlign: { type: 'string', enum: ['top', 'center', 'bottom'] },
    rotation: { type: 'number', minimum: -360000, maximum: 360000 },
    arrowStart: { type: 'string', enum: L.ARROW_ENDS },
    arrowEnd: { type: 'string', enum: L.ARROW_ENDS },
  };
  const nullableChangeProperties = Object.fromEntries(
    Object.entries(shapeProperties)
      .filter(([name]) => CHANGE_FIELDS.has(name))
      .map(([name, schema]) => [name, nullable(schema)])
  );
  const requiredAddFields = new Set(['kind', 'x', 'y', 'w', 'h']);
  const addShapeProperties = Object.fromEntries(
    Object.entries(shapeProperties)
      .map(([name, schema]) => [name, requiredAddFields.has(name) ? schema : nullable(schema)])
  );

  const SLIDE_OUTPUT_SCHEMA = Object.freeze(strictObject({
    summary: { type: 'string', maxLength: 500 },
    background: nullable(colorSchema),
    operations: {
      type: 'array',
      maxItems: 100,
      items: {
        anyOf: [
          strictObject({
            op: { type: 'string', enum: ['update'] },
            index: { type: 'integer', minimum: 0 },
            changes: strictObject(nullableChangeProperties),
          }),
          strictObject({
            op: { type: 'string', enum: ['remove'] },
            index: { type: 'integer', minimum: 0 },
          }),
          strictObject({
            op: { type: 'string', enum: ['add'] },
            shape: strictObject(addShapeProperties),
          }),
        ],
      },
    },
  }));

  function jsonObject(text) {
    const source = String(text || '').trim();
    const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    const candidate = fenced ? fenced[1] : source;
    try {
      const value = JSON.parse(candidate);
      return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
    } catch (_) {
      return null;
    }
  }

  function cleanChanges(value) {
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(
      Object.entries(source).filter(([name, field]) => CHANGE_FIELDS.has(name) && field !== null)
    );
  }

  function parseSlidePatch(text, shapeCount) {
    const value = jsonObject(text);
    if (!value || typeof value.summary !== 'string' || !Array.isArray(value.operations)) {
      return null;
    }
    const operations = [];
    for (const operation of value.operations.slice(0, 100)) {
      if (!operation || typeof operation !== 'object') return null;
      if (operation.op === 'add') {
        const shape = L.parseClipboardShapes(JSON.stringify([operation.shape]))[0];
        if (!shape || shape.kind === 'image') return null;
        operations.push({ op: 'add', shape });
        continue;
      }
      const index = Number(operation.index);
      if (!Number.isInteger(index) || index < 0 || index >= shapeCount) return null;
      if (operation.op === 'remove') {
        operations.push({ op: 'remove', index });
      } else if (operation.op === 'update') {
        operations.push({ op: 'update', index, changes: cleanChanges(operation.changes) });
      } else {
        return null;
      }
    }
    const background = typeof value.background === 'string' &&
      /^(none|#[0-9a-f]{6})$/i.test(value.background)
      ? value.background
      : null;
    return { summary: safeText(value.summary, 500), background, operations };
  }

  function applySlidePatch(sourceSlide, patch) {
    const next = structuredClone(sourceSlide);
    const removed = new Set();
    const additions = [];
    for (const operation of patch.operations) {
      if (operation.op === 'remove') {
        removed.add(operation.index);
      } else if (operation.op === 'update') {
        const candidate = { ...next.shapes[operation.index], ...operation.changes };
        const normalized = L.parseClipboardShapes(JSON.stringify([candidate]))[0];
        if (!normalized) throw new Error(`Invalid shape update at ${operation.index}`);
        next.shapes[operation.index] = normalized;
      } else if (operation.op === 'add') {
        additions.push(structuredClone(operation.shape));
      }
    }
    next.shapes = next.shapes.filter((_, index) => !removed.has(index)).concat(additions);
    if (patch.background) next.background = patch.background;
    return next;
  }

  const exported = {
    SESSION_VERSION,
    MAX_SESSIONS,
    SESSION_LIMIT_BYTES,
    SESSION_RESERVE_BYTES,
    MODES,
    SLIDE_OUTPUT_SCHEMA,
    sessionTitle,
    createMessage,
    createSession,
    normalizeSession,
    byteLength,
    encodedJsonTextBytes,
    canAppendText,
    cryptoId,
    slideSnapshot,
    slidePrompt,
    baseInstructions,
    parseSlidePatch,
    applySlidePatch,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.makepresentationAi = exported;
  }
})();
