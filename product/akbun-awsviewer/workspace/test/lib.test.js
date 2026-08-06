'use strict';

const test = require('node:test');
const assert = require('node:assert');
const {
  filterInstances,
  sortInstances,
  formatProtocol,
  formatPortRange,
  sessionLabel,
} = require('../src/lib.js');

const instances = [
  { instanceId: 'i-0aaa', name: 'web-1', state: 'running', privateIp: '10.0.1.10' },
  { instanceId: 'i-0bbb', name: 'batch', state: 'stopped', privateIp: '10.0.1.2' },
  { instanceId: 'i-0ccc', name: null, state: 'running', privateIp: null },
];

test('filter matches instance id', () => {
  const found = filterInstances(instances, '0bbb');
  assert.deepStrictEqual(found.map((i) => i.instanceId), ['i-0bbb']);
});

test('filter matches the Name tag case-insensitively', () => {
  const found = filterInstances(instances, 'WEB');
  assert.deepStrictEqual(found.map((i) => i.instanceId), ['i-0aaa']);
});

test('empty filter returns a copy of everything', () => {
  const found = filterInstances(instances, '  ');
  assert.deepStrictEqual(found, instances);
  assert.notStrictEqual(found, instances);
});

test('sort is ascending then reversible', () => {
  const asc = sortInstances(instances, 'name', 'asc');
  assert.deepStrictEqual(asc.map((i) => i.instanceId), ['i-0bbb', 'i-0aaa', 'i-0ccc']);
  const desc = sortInstances(instances, 'name', 'desc');
  assert.deepStrictEqual(desc.map((i) => i.instanceId), ['i-0aaa', 'i-0bbb', 'i-0ccc']);
});

test('missing values sort last in both directions', () => {
  const asc = sortInstances(instances, 'privateIp', 'asc');
  assert.strictEqual(asc[asc.length - 1].instanceId, 'i-0ccc');
  const desc = sortInstances(instances, 'privateIp', 'desc');
  assert.strictEqual(desc[desc.length - 1].instanceId, 'i-0ccc');
});

test('the wildcard protocol renders as all', () => {
  assert.strictEqual(formatProtocol('-1'), 'all');
  assert.strictEqual(formatProtocol('tcp'), 'tcp');
  assert.strictEqual(formatProtocol(null), 'all');
});

test('port ranges collapse when both ends match', () => {
  assert.strictEqual(formatPortRange(443, 443), '443');
  assert.strictEqual(formatPortRange(1024, 2048), '1024 - 2048');
  assert.strictEqual(formatPortRange(null, null), 'all');
  assert.strictEqual(formatPortRange(0, 0), '0');
});

test('session label states', () => {
  assert.strictEqual(sessionLabel(null), 'Not logged in');
  assert.strictEqual(sessionLabel({ loggedIn: false }), 'Not logged in');
  assert.strictEqual(
    sessionLabel({ loggedIn: true, expiresAt: '2026-08-06T12:00:00Z' }),
    'Session until 2026-08-06T12:00:00Z',
  );
});
