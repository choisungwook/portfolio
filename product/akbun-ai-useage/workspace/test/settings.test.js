'use strict';

const assert = require('node:assert');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DEFAULTS, loadSettings } = require('../src/settings');

test('loadSettings writes defaults on first run with owner-only permissions', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
  const file = path.join(dir, 'settings.json');
  try {
    assert.deepStrictEqual(loadSettings(file), DEFAULTS);
    assert.ok(fs.existsSync(file));
    if (process.platform !== 'win32') assert.strictEqual(fs.statSync(file).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('loadSettings fills missing keys and survives broken JSON', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-test-'));
  const file = path.join(dir, 'settings.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ claude: { limits: true }, openaiAdmin: { apiKey: 'k' } }));
    const settings = loadSettings(file);
    assert.strictEqual(settings.claude.limits, true);
    assert.strictEqual(settings.claude.enabled, true);
    assert.strictEqual(settings.openaiAdmin.apiKey, 'k');
    assert.strictEqual(settings.refreshMinutes, 5);

    fs.writeFileSync(file, '{ broken');
    assert.deepStrictEqual(loadSettings(file), DEFAULTS);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
