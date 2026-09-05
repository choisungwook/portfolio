'use strict';

(function (root, factory) {
  const exported = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = exported;
  else root.makevideoAiLib = exported;
})(globalThis, function () {
  const SESSION_VERSION = 1;
  const MAX_SESSIONS = 3;
  const SESSION_LIMIT_BYTES = 128 * 1024 * 1024;
  const SESSION_RESERVE_BYTES = 4 * 1024;
  const MODES = new Set(['text', 'image']);
  const MESSAGE_STATUSES = new Set(['streaming', 'complete', 'stopped', 'error']);
  const SESSION_STATUSES = new Set(['active', 'readonly']);

  function now() {
    return new Date().toISOString();
  }

  function safeText(value, limit = SESSION_LIMIT_BYTES) {
    return typeof value === 'string' ? value.slice(0, limit) : '';
  }

  function cryptoId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

  function restoreInterruptedSession(value) {
    const session = normalizeSession(value);
    session.status = 'readonly';
    session.readonlyReason = 'app_closed';
    session.updatedAt = now();
    for (const message of session.messages) {
      if (message.status === 'streaming') message.status = 'stopped';
    }
    return session;
  }

  function disconnectedConnection(detail) {
    return {
      state: 'unavailable',
      account: null,
      server: null,
      detail: String(detail || 'Codex App Server stopped.'),
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

  function projectDigest(project) {
    if (!project || typeof project !== 'object') return 'No video project is open.';
    const settings = project.settings || {};
    const rate = settings.rate || {};
    const lines = [
      `Canvas: ${Number(settings.width) || 0}x${Number(settings.height) || 0}`,
      `Frame rate: ${Number(rate.num) || 0}/${Number(rate.den) || 1}`,
      `Assets: ${(project.assets || []).length}`,
      `Markers: ${(project.markers || []).length}`,
    ];
    for (const track of project.tracks || []) {
      lines.push(`Track ${safeText(track.name, 120) || track.id}: ${track.kind}, ${(track.clips || []).length} clips`);
    }
    return lines.join('\n');
  }

  function baseInstructions() {
    return [
      'You are the AI assistant inside akbun-makevideo, a desktop video editor.',
      'You can explain editing choices, draft narration and captions, and generate still images.',
      'You cannot change the project. Give instructions the user can review and apply.',
      'Every request is labelled TEXT MODE or IMAGE MODE. Obey the labelled mode.',
    ].join(' ');
  }

  function composeTurn(mode, prompt, project) {
    const selected = MODES.has(mode) ? mode : 'text';
    const rules = selected === 'image'
      ? 'IMAGE MODE. Generate exactly one image with the built-in image generation capability. Do not return editing commands.'
      : 'TEXT MODE. Return text only. Do not call image generation or any other tool.';
    return [rules, '', 'Current project summary:', projectDigest(project), '', 'User request:', safeText(prompt, 100_000)].join('\n');
  }

  return {
    SESSION_VERSION,
    MAX_SESSIONS,
    SESSION_LIMIT_BYTES,
    SESSION_RESERVE_BYTES,
    MODES,
    sessionTitle,
    createMessage,
    createSession,
    normalizeSession,
    restoreInterruptedSession,
    disconnectedConnection,
    byteLength,
    encodedJsonTextBytes,
    canAppendText,
    cryptoId,
    projectDigest,
    baseInstructions,
    composeTurn,
  };
});
