import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUrl } from '../worker/lib/normalize-url.js';

test('drops fragment, tracking params, and default port', () => {
  const input = 'HTTPS://Example.com:443/post/?utm_source=x&fbclid=y&b=2&a=1#top';
  assert.equal(normalizeUrl(input), 'https://example.com/post?a=1&b=2');
});

test('orders repeated keys by value so input order does not matter', () => {
  assert.equal(normalizeUrl('https://example.com/?a=2&a=1'), normalizeUrl('https://example.com/?a=1&a=2'));
  assert.equal(normalizeUrl('https://example.com/?a=2&a=1'), 'https://example.com/?a=1&a=2');
});

test('keeps the root slash and non-tracking params', () => {
  assert.equal(normalizeUrl('https://example.com/?q=k8s'), 'https://example.com/?q=k8s');
});

test('two shares of the same page normalize to one key', () => {
  const fromSafari = 'https://blog.example.com/a/b?utm_campaign=share';
  const fromShortcut = 'https://blog.example.com/a/b/';
  assert.equal(normalizeUrl(fromSafari), normalizeUrl(fromShortcut));
});

test('rejects non-http schemes and relative paths', () => {
  assert.throws(() => normalizeUrl('ftp://example.com/x'), /http/);
  assert.throws(() => normalizeUrl('/relative/path'), /absolute/);
});
