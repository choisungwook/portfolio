'use strict';

// The worker's pure part, tested with node's own fetch globals. The fetch
// handler in worker/index.js is a thin wrapper around these functions.

const test = require('node:test');
const assert = require('node:assert');

const proxyModule = import('../worker/proxy.js');

test('validateSpec rejects broken and non-http URLs', async () => {
  const { validateSpec } = await proxyModule;
  assert.strictEqual(validateSpec({ url: 'not a url' }), 'invalid URL');
  assert.strictEqual(
    validateSpec({ url: 'file:///etc/passwd' }),
    'only http and https URLs are allowed'
  );
  assert.strictEqual(validateSpec({ url: 'https://x.test/a' }), null);
});

test('specToInit maps method, headers, body and redirect policy', async () => {
  const { specToInit } = await proxyModule;
  const init = specToInit(
    {
      method: 'post',
      headers: [{ key: 'X-One', value: '1' }, { key: '', value: 'dropped' }],
      body: '{"a":1}',
    },
    { followRedirects: false }
  );
  assert.strictEqual(init.method, 'POST');
  assert.strictEqual(init.headers.get('X-One'), '1');
  assert.strictEqual(init.body, '{"a":1}');
  assert.strictEqual(init.redirect, 'manual');
});

test('specToInit drops the body for GET and follows redirects by default', async () => {
  const { specToInit } = await proxyModule;
  const init = specToInit({ method: 'GET', headers: [], body: 'ignored' }, {});
  assert.strictEqual(init.body, undefined);
  assert.strictEqual(init.redirect, 'follow');
});

test('requestTimeoutMs uses the global timeout and defaults to 60 seconds', async () => {
  const { requestTimeoutMs } = await proxyModule;
  assert.strictEqual(requestTimeoutMs({ timeoutSecs: 90 }), 90_000);
  assert.strictEqual(requestTimeoutMs({}), 60_000);
});

test('resultFrom matches the desktop engine response shape', async () => {
  const { resultFrom } = await proxyModule;
  // A string body would make Response add its own content-type header.
  const response = new Response(null, {
    status: 201,
    statusText: 'Created',
    headers: { 'x-a': '1' },
  });
  const result = resultFrom(response, 'body', 12, 4);
  assert.deepStrictEqual(result, {
    status: 201,
    statusText: 'Created',
    headers: [{ key: 'x-a', value: '1' }],
    body: 'body',
    elapsedMs: 12,
    sizeBytes: 4,
  });
});
