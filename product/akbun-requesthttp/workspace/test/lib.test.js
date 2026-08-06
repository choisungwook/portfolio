'use strict';

const test = require('node:test');
const assert = require('node:assert');
const L = require('../src/lib.js');

// ---------------------------------------------------------------- variables

test('substitute replaces known variables and leaves unknown ones visible', () => {
  const map = { host: 'https://api.example.com', token: 'abc' };
  assert.strictEqual(
    L.substitute('{{host}}/users?t={{token}}&x={{missing}}', map),
    'https://api.example.com/users?t=abc&x={{missing}}'
  );
});

test('resolveRequest substitutes url, headers and body, and drops empty header rows', () => {
  const request = {
    method: 'POST',
    url: '{{host}}/login',
    headers: [
      { key: 'Authorization', value: 'Bearer {{token}}' },
      { key: '', value: 'ignored' },
    ],
    body: '{"user": "{{user}}"}',
  };
  const variables = [
    { key: 'host', value: 'https://api.example.com' },
    { key: 'token', value: 't1' },
    { key: 'user', value: 'akbun' },
  ];
  assert.deepStrictEqual(L.resolveRequest(request, variables), {
    method: 'POST',
    url: 'https://api.example.com/login',
    headers: [{ key: 'Authorization', value: 'Bearer t1' }],
    body: '{"user": "akbun"}',
  });
});

test('upsertVariable updates in place or appends', () => {
  const variables = [{ key: 'a', value: '1' }];
  L.upsertVariable(variables, 'a', '2');
  L.upsertVariable(variables, 'b', '3');
  assert.deepStrictEqual(variables, [
    { key: 'a', value: '2' },
    { key: 'b', value: '3' },
  ]);
});

// --------------------------------------------------------------------- curl

test('toCurl renders method, headers, body and quoting', () => {
  const resolved = {
    method: 'POST',
    url: 'https://api.example.com/it?a=1',
    headers: [{ key: 'content-type', value: 'application/json' }],
    body: '{"it\'s": true}',
  };
  assert.strictEqual(
    L.toCurl(resolved, { verifySsl: true }),
    `curl -X POST -H 'content-type: application/json' --data '{"it'\\''s": true}' 'https://api.example.com/it?a=1'`
  );
});

test('toCurl adds -k when TLS verification is off and skips -X for GET', () => {
  const resolved = { method: 'GET', url: 'https://x.test/', headers: [], body: '' };
  assert.strictEqual(L.toCurl(resolved, { verifySsl: false }), "curl -k 'https://x.test/'");
});

test('parseCurl reads method, url, headers and data', () => {
  const parsed = L.parseCurl(
    `curl -X PUT 'https://api.example.com/users/1' -H 'content-type: application/json' --data '{"name":"a b"}'`
  );
  assert.deepStrictEqual(parsed, {
    method: 'PUT',
    url: 'https://api.example.com/users/1',
    headers: [{ key: 'content-type', value: 'application/json' }],
    body: '{"name":"a b"}',
  });
});

test('parseCurl infers POST from --data and survives line continuations', () => {
  const parsed = L.parseCurl('curl https://x.test/a \\\n  -d "k=v" \\\n  -H "X-One: 1"');
  assert.strictEqual(parsed.method, 'POST');
  assert.strictEqual(parsed.url, 'https://x.test/a');
  assert.strictEqual(parsed.body, 'k=v');
  assert.deepStrictEqual(parsed.headers, [{ key: 'X-One', value: '1' }]);
});

test('parseCurl skips unknown flags without losing the url', () => {
  const parsed = L.parseCurl('curl -s --compressed -o out.txt https://x.test/file');
  assert.strictEqual(parsed.url, 'https://x.test/file');
  assert.strictEqual(parsed.method, 'GET');
});

// ---------------------------------------------------------------- scenario

test('getByPath walks objects and arrays', () => {
  const data = { items: [{ id: 7, tags: ['a', 'b'] }] };
  assert.strictEqual(L.getByPath(data, 'items.0.id'), 7);
  assert.strictEqual(L.getByPath(data, 'items.0.tags.1'), 'b');
  assert.strictEqual(L.getByPath(data, 'items.9.id'), undefined);
});

test('runAssertions checks status and body substring only when filled in', () => {
  const response = { status: 201, body: '{"ok":true}' };
  assert.deepStrictEqual(
    L.runAssertions({ expectStatus: '201', bodyContains: '"ok"' }, response),
    { passed: true, failures: [] }
  );
  const failed = L.runAssertions({ expectStatus: '200', bodyContains: 'nope' }, response);
  assert.strictEqual(failed.passed, false);
  assert.strictEqual(failed.failures.length, 2);
  assert.deepStrictEqual(L.runAssertions({ expectStatus: '', bodyContains: '' }, response), {
    passed: true,
    failures: [],
  });
});

test('runAssertions reports a non-numeric expected status instead of comparing NaN', () => {
  const verdict = L.runAssertions({ expectStatus: 'ok', bodyContains: '' }, { status: 200, body: '' });
  assert.strictEqual(verdict.passed, false);
  assert.deepStrictEqual(verdict.failures, ['expected status "ok" is not a number']);
});

test('applyExtracts pulls JSON values into variables', () => {
  const variables = [];
  const step = {
    extracts: [
      { path: 'data.token', var: 'token' },
      { path: 'data.count', var: 'count' },
      { path: 'data.missing', var: 'nope' },
    ],
  };
  const response = { body: '{"data":{"token":"t9","count":3}}' };
  const extracted = L.applyExtracts(step, response, variables);
  assert.deepStrictEqual(variables, [
    { key: 'token', value: 't9' },
    { key: 'count', value: '3' },
  ]);
  assert.strictEqual(extracted.length, 2);
});

test('applyExtracts does nothing on a non-JSON body', () => {
  const variables = [];
  const extracted = L.applyExtracts(
    { extracts: [{ path: 'a', var: 'a' }] },
    { body: '<html>' },
    variables
  );
  assert.deepStrictEqual(extracted, []);
  assert.deepStrictEqual(variables, []);
});

// ------------------------------------------------------------- formatting

test('prettyBody pretty-prints only JSON responses', () => {
  const headers = [{ key: 'Content-Type', value: 'application/json; charset=utf-8' }];
  assert.strictEqual(L.prettyBody('{"a":1}', headers), '{\n  "a": 1\n}');
  assert.strictEqual(
    L.prettyBody('{"a":1}', [{ key: 'Content-Type', value: 'Application/JSON' }]),
    '{\n  "a": 1\n}'
  );
  assert.strictEqual(L.prettyBody('<html>', [{ key: 'Content-Type', value: 'text/html' }]), '<html>');
  assert.strictEqual(L.prettyBody('not json', headers), 'not json');
});
