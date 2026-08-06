import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseSpec,
  specTitle,
  specJson,
  specFileName,
  listOperations,
  filterOperations,
  pageCount,
  pageSlice,
  resolveRef,
  schemaText,
  serverUrl,
  schemaExample,
  snippet,
} from '../src/lib/spec.js';
import { SAMPLE_SPEC } from '../src/lib/sample.js';


const MINIMAL = {
  openapi: '3.0.3',
  info: { title: 'T', version: '2' },
  paths: {
    '/pets': {
      parameters: [{ name: 'trace', in: 'header' }],
      get: { summary: 'List pets', operationId: 'listPets', tags: ['pets'] },
      post: { summary: 'Create a pet' },
      description: 'not an operation',
    },
    '/orders': {
      get: { summary: 'List orders', deprecated: true },
    },
  },
  components: {
    schemas: {
      Pet: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string' },
          friend: { $ref: '#/components/schemas/Pet' },
          tags: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

test('parseSpec accepts JSON and YAML', () => {
  assert.equal(parseSpec(JSON.stringify(MINIMAL)).info.title, 'T');
  assert.equal(parseSpec('openapi: 3.0.3\npaths:\n  /a:\n    get: {}\n').openapi, '3.0.3');
  assert.equal(parseSpec(SAMPLE_SPEC).info.title, 'Petstore Sample');
});

test('parseSpec rejects what is not an OpenAPI document', () => {
  assert.throws(() => parseSpec(''), /empty/);
  assert.throws(() => parseSpec('[1, 2]'), /object/);
  assert.throws(() => parseSpec('{"hello": 1}'), /openapi/);
  assert.throws(() => parseSpec('{"openapi": "3.0.3"}'), /paths/);
});

test('parseSpec caps YAML alias expansion', () => {
  const fine = 'openapi: "3"\npaths:\n  /a:\n    get: {}\nx-anchor: &a 1\nx-alias: *a\n';
  assert.equal(parseSpec(fine)['x-alias'], 1);

  const bomb = `openapi: "3"\npaths: {}\nx-anchor: &a 1\nx-bomb: [${Array(1001).fill('*a').join(',')}]\n`;
  assert.throws(() => parseSpec(bomb), /maxAliases/);
});

test('specTitle joins title and version with fallbacks', () => {
  assert.equal(specTitle(MINIMAL), 'T 2');
  assert.equal(specTitle({}), 'OpenAPI');
});

test('specJson round-trips a YAML spec into indented JSON', () => {
  const yaml = 'openapi: "3.0.3"\ninfo:\n  title: T\n  version: "2"\npaths:\n  /a:\n    get: {}\n';
  const json = specJson(parseSpec(yaml));

  assert.deepEqual(JSON.parse(json), parseSpec(yaml));
  // one indent step per level, so top-level keys sit at 2 and info.title at 4
  assert.match(json, /\n {2}"openapi": "3\.0\.3"/);
  assert.match(json, /\n {4}"title": "T"/);
  assert.ok(json.endsWith('\n'));
});

test('specFileName reduces the title to something a disk accepts', () => {
  assert.equal(specFileName(MINIMAL), 't-2.json');
  assert.equal(specFileName(parseSpec(SAMPLE_SPEC)), 'petstore-sample-1.0.0.json');
  assert.equal(specFileName({ info: { title: 'Orders / Billing API!', version: 'v2' } }), 'orders-billing-api-v2.json');
  assert.equal(specFileName({ info: { title: 'T' } }), 't.json');
  assert.equal(specFileName({ info: { title: '///' } }), 'openapi.json');
  assert.equal(specFileName({}), 'openapi.json');
});

test('listOperations flattens methods and merges path-level parameters', () => {
  const ops = listOperations(MINIMAL);
  assert.deepEqual(ops.map((op) => op.id), ['get /pets', 'post /pets', 'get /orders']);
  assert.equal(ops[0].method, 'GET');
  assert.deepEqual(ops[0].parameters.map((p) => p.name), ['trace']);
  assert.equal(ops[2].deprecated, true);
});

test('filterOperations matches every word, case-insensitively', () => {
  const ops = listOperations(MINIMAL);
  assert.equal(filterOperations(ops, '').length, 3);
  assert.equal(filterOperations(ops, 'GET pets').length, 1);
  assert.equal(filterOperations(ops, 'listpets').length, 1);
  assert.equal(filterOperations(ops, 'nothing here').length, 0);
});

test('paging clamps out-of-range pages', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  assert.equal(pageCount(25, 10), 3);
  assert.equal(pageCount(0, 10), 1);
  assert.deepEqual(pageSlice(items, 2, 10).items, items.slice(10, 20));
  assert.equal(pageSlice(items, 99, 10).page, 3);
  assert.equal(pageSlice(items, -1, 10).page, 1);
});

test('resolveRef walks local pointers only', () => {
  assert.equal(resolveRef(MINIMAL, '#/components/schemas/Pet').type, 'object');
  assert.equal(resolveRef(MINIMAL, '#/nope/nothing'), null);
  assert.equal(resolveRef(MINIMAL, 'https://example.com/spec.json#/x'), null);
});

test('schemaText marks required, resolves refs and stops circles', () => {
  const text = schemaText(MINIMAL, { $ref: '#/components/schemas/Pet' });
  assert.match(text, /^Pet — object/);
  assert.match(text, /name\*: string/);
  assert.match(text, /friend: Pet \(circular\)/);
  assert.match(text, /tags: array of string/);
});

test('schemaText labels scalars with format and enum', () => {
  assert.equal(schemaText({}, { type: 'integer', format: 'int64' }), 'integer(int64)');
  assert.equal(schemaText({}, { type: 'string', enum: ['a', 'b'] }), 'string enum[a, b]');
  assert.equal(schemaText({}, null), 'any');
});

// ===== Request snippets =====

const SAMPLE = parseSpec(SAMPLE_SPEC);
const opById = (spec, id) => listOperations(spec).find((op) => op.id === id);

test('serverUrl takes the first server without its trailing slash', () => {
  assert.equal(serverUrl({ servers: [{ url: 'https://api.dev/v1/' }] }), 'https://api.dev/v1');
  assert.equal(serverUrl({ servers: [] }), 'https://api.example.com');
  assert.equal(serverUrl({}), 'https://api.example.com');
});

test('schemaExample fills a body and stops at cycles', () => {
  assert.deepEqual(schemaExample(SAMPLE, { $ref: '#/components/schemas/Pet' }), {
    id: 0,
    name: 'string',
    tag: 'string',
    status: 'available',
  });
  assert.deepEqual(schemaExample(MINIMAL, { $ref: '#/components/schemas/Pet' }), {
    name: 'string',
    friend: null,
    tags: ['string'],
  });
  assert.equal(schemaExample({}, { type: 'boolean' }), true);
  assert.deepEqual(schemaExample({}, { allOf: [{ properties: { a: { type: 'string' } } }, { properties: { b: { type: 'boolean' } } }] }), { a: 'string', b: true });
});

test('schemaExample stops descending a chain of distinct $refs', () => {
  // Every ref is a different name, so the cycle guard never fires and the depth
  // limit is the only thing that can stop the descent.
  const schemas = { S9: { type: 'string' } };
  for (let i = 0; i < 9; i += 1) {
    schemas[`S${i}`] = { type: 'object', properties: { next: { $ref: `#/components/schemas/S${i + 1}` } } };
  }
  const chain = { components: { schemas } };

  assert.deepEqual(schemaExample(chain, { $ref: '#/components/schemas/S0' }), {
    next: { next: { next: null } },
  });
});

test('curl carries method, headers and body, on one line or several', () => {
  const post = opById(SAMPLE, 'post /pets');

  const oneLine = snippet(SAMPLE, post, 'curl', false);
  assert.equal(oneLine.split('\n').length, 1);
  assert.match(oneLine, /^curl -X POST 'https:\/\/api\.example\.com\/pets'/);
  assert.match(oneLine, /-H 'Content-Type: application\/json'/);
  assert.match(oneLine, /-d '\{"id":0,"name":"string"/);

  const pretty = snippet(SAMPLE, post, 'curl', true);
  assert.match(pretty, /curl -X POST '[^']+' \\\n {2}-H /);
  assert.match(pretty, /-d '\{\n {2}"id": 0/);
});

test('curl leaves path placeholders and adds required query parameters', () => {
  const get = snippet(SAMPLE, opById(SAMPLE, 'get /pets/{petId}'), 'curl', false);
  assert.match(get, /'https:\/\/api\.example\.com\/pets\/\{petId\}'/);
  assert.doesNotMatch(get, / -d /);

  const spec = parseSpec(JSON.stringify({
    openapi: '3.0.3',
    servers: [{ url: 'https://api.dev' }],
    paths: {
      '/search': {
        get: {
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string' } },
            { name: 'page', in: 'query', schema: { type: 'integer' } },
            { name: 'X-Key', in: 'header', required: true, example: 'abc', schema: { type: 'string' } },
          ],
        },
      },
    },
  }));
  const code = snippet(spec, opById(spec, 'get /search'), 'curl', false);
  assert.match(code, /'https:\/\/api\.dev\/search\?q=string'/);
  assert.match(code, /-H 'X-Key: abc'/);
});

test('curl escapes a single quote inside the payload', () => {
  const spec = parseSpec(JSON.stringify({
    openapi: '3.0.3',
    paths: {
      '/notes': {
        post: {
          requestBody: {
            content: { 'application/json': { schema: { properties: { text: { type: 'string', example: "it's" } } } } },
          },
        },
      },
    },
  }));
  const code = snippet(spec, opById(spec, 'post /notes'), 'curl', false);
  assert.match(code, /-d '\{"text":"it'\\''s"\}'/);
});

test('python snippets pick the client and the wrapping', () => {
  const post = opById(SAMPLE, 'post /pets');

  const pretty = snippet(SAMPLE, post, 'httpx', true);
  assert.match(pretty, /^import httpx\n\nresponse = httpx\.post\(\n/);
  assert.match(pretty, /\n {4}"https:\/\/api\.example\.com\/pets",\n/);
  assert.match(pretty, /json=\{\n {8}"id": 0,/);
  assert.ok(pretty.endsWith('\n)\nprint(response.json())'));

  const oneLine = snippet(SAMPLE, post, 'requests', false);
  assert.equal(oneLine.split('\n').length, 1);
  assert.match(oneLine, /^import requests; print\(requests\.post\("https:/);
  assert.match(oneLine, /json=\{"id": 0, "name": "string"/);
});

test('python writes True/False/None, not the JSON spellings', () => {
  const spec = parseSpec(JSON.stringify({
    openapi: '3.0.3',
    paths: {
      '/flags': {
        post: {
          requestBody: {
            content: {
              'application/json': {
                schema: { properties: { on: { type: 'boolean' }, note: {} } },
              },
            },
          },
        },
      },
    },
  }));
  const code = snippet(spec, opById(spec, 'post /flags'), 'httpx', false);
  assert.match(code, /json=\{"on": True, "note": None\}/);
});

test('a method without a named python function goes through request()', () => {
  const spec = parseSpec(JSON.stringify({
    openapi: '3.0.3',
    paths: { '/echo': { trace: {} } },
  }));
  assert.match(snippet(spec, opById(spec, 'trace /echo'), 'httpx', false), /httpx\.request\("TRACE", "https:/);
});
