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
