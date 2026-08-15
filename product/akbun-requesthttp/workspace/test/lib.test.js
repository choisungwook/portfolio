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

test('createState always includes an empty default folder', () => {
  const state = L.createState();
  assert.strictEqual(state.folders.length, 1);
  assert.deepStrictEqual(state.folders[0], {
    id: L.DEFAULT_FOLDER_ID,
    name: 'Default',
    isDefault: true,
    requests: [],
  });
});

test('normalizeState migrates flat requests into the default folder', () => {
  const state = L.normalizeState({
    requests: [{ id: 'r1', name: 'One', method: 'GET', url: '', headers: [], body: '' }],
    variables: [{ key: 'host', value: 'https://old.example.com' }],
    scenarios: [{ id: 'removed' }],
  });
  assert.deepStrictEqual(state.globalVariables, [
    { key: 'host', value: 'https://old.example.com' },
  ]);
  assert.strictEqual(state.folders[0].id, L.DEFAULT_FOLDER_ID);
  assert.strictEqual(state.folders[0].name, 'Default');
  assert.deepStrictEqual(state.folders[0].requests[0].localVariables, []);
  assert.strictEqual(Object.hasOwn(state, 'requests'), false);
  assert.strictEqual(Object.hasOwn(state, 'scenarios'), false);
  assert.strictEqual(Object.hasOwn(state, 'variables'), false);
});

test('normalizeState restores the default folder when only named folders were saved', () => {
  const state = L.normalizeState({
    folders: [{ id: 'team', name: 'Team API', requests: [] }],
  });
  assert.strictEqual(state.folders[0].id, L.DEFAULT_FOLDER_ID);
  assert.strictEqual(state.folders[1].name, 'Team API');
});

test('duplicateRequest copies mutable fields and appends copy to the name', () => {
  const source = L.createRequest('List users');
  source.headers.push({ key: 'X-One', value: '1' });
  source.localVariables.push({ key: 'user', value: '7' });
  const copy = L.duplicateRequest(source);
  assert.strictEqual(copy.name, 'List users copy');
  assert.notStrictEqual(copy.id, source.id);
  assert.deepStrictEqual(copy.headers, source.headers);
  assert.deepStrictEqual(copy.localVariables, source.localVariables);
  assert.notStrictEqual(copy.headers, source.headers);
  assert.notStrictEqual(copy.localVariables, source.localVariables);
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

test('resolveRequest uses local variables before globals', () => {
  const request = L.createRequest('Local override');
  request.url = '{{host}}/{{user}}';
  request.localVariables = [{ key: 'user', value: 'local-user' }];
  const globals = [
    { key: 'host', value: 'https://api.example.com' },
    { key: 'user', value: 'global-user' },
  ];
  assert.strictEqual(
    L.resolveRequest(request, globals).url,
    'https://api.example.com/local-user'
  );
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

// -------------------------------------------------------------------- .http

test('httpFolderName keeps the imported file name', () => {
  assert.strictEqual(L.httpFolderName('/tmp/github.http'), 'github.http');
  assert.strictEqual(L.httpFolderName('service.HTTP'), 'service.HTTP');
});

test('parseHttpFile creates a request for each separator section', () => {
  const requests = L.parseHttpFile(`
@host = https://api.example.com
@token = secret

### List users
GET {{host}}/users HTTP/1.1
Authorization: Bearer {{token}}

### Create user
# @name create-user
POST {{host}}/users
Content-Type: application/json

{"name":"akbun"}
`);
  assert.strictEqual(requests.length, 2);
  assert.deepStrictEqual(
    {
      name: requests[0].name,
      method: requests[0].method,
      url: requests[0].url,
      headers: requests[0].headers,
      body: requests[0].body,
      localVariables: requests[0].localVariables,
    },
    {
      name: 'List users',
      method: 'GET',
      url: '{{host}}/users',
      headers: [{ key: 'Authorization', value: 'Bearer {{token}}' }],
      body: '',
      localVariables: [
        { key: 'host', value: 'https://api.example.com' },
        { key: 'token', value: 'secret' },
      ],
    }
  );
  assert.strictEqual(requests[1].name, 'create-user');
  assert.strictEqual(requests[1].method, 'POST');
  assert.strictEqual(requests[1].body, '{"name":"akbun"}');
});

test('parseHttpFile ignores sections without a request', () => {
  assert.deepStrictEqual(L.parseHttpFile('### Notes\n# nothing here'), []);
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
