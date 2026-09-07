import test from 'node:test';
import assert from 'node:assert/strict';
import { channel, channels, remaining } from '../src/channels.js';

test('every channel has a positive limit and image rule', () => {
  for (const item of channels) {
    assert.ok(item.maxLength > 0, item.id);
    assert.ok(item.maxImages > 0, item.id);
    assert.equal(typeof item.imageRequired, 'boolean', item.id);
  }
});

test('remaining counts code points so an emoji is one character', () => {
  assert.equal(remaining('', 'x'), 280);
  assert.equal(remaining('a'.repeat(281), 'x'), -1);
  assert.equal(remaining('😀', 'threads'), 499);
});

test('unknown channel is an error, not a silent default', () => {
  assert.throws(() => channel('mastodon'), /unknown channel/);
});
