'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  filterInstances,
  sortInstances,
  formatProtocol,
  formatPortRange,
  formatAge,
  stateClass,
  capacityClass,
  sessionLabel,
} = require('../src/lib.js');

test('publishes the browser API when a CommonJS module global exists', () => {
  const source = fs.readFileSync(require.resolve('../src/lib.js'), 'utf8');
  const context = { module: { exports: {} } };

  vm.runInNewContext(source, context);

  assert.strictEqual(typeof context.awsviewerLib.filterInstances, 'function');
});

// The page loads its scripts as classic script tags, so every top-level
// declaration lands in one shared global scope. A `const` in one file named
// like a function in another is a SyntaxError that kills the whole file
// before it wires a single listener — v0.1.0 and v0.1.1 shipped frozen
// because of exactly that. Run the files in one context the way the page
// does; missing browser globals (window, document) are expected and fine,
// a redeclaration is not.
test('page scripts share one global scope without redeclaring names', () => {
  // Just enough of a DOM that the wiring code runs to completion; every
  // element answers every call with a no-op. Runtime errors from the missing
  // Tauri bridge are expected and fine — only a SyntaxError is the bug.
  const element = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (prop === 'classList') return { toggle() {}, add() {}, remove() {} };
        if (prop === 'dataset') return {};
        if (prop === 'open' || prop === 'disabled' || prop === 'checked') return false;
        if (prop === 'textContent') return '';
        return () => {};
      },
      set: () => true,
    },
  );
  const context = vm.createContext({
    window: { addEventListener() {} },
    document: { querySelector: () => element, querySelectorAll: () => [] },
  });
  const load = (name) => fs.readFileSync(require.resolve(`../src/${name}`), 'utf8');
  for (const name of ['api.js', 'lib.js', 'renderer.js']) {
    try {
      vm.runInContext(load(name), context, { filename: name });
    } catch (error) {
      assert.notStrictEqual(
        error.name,
        'SyntaxError',
        `${name} breaks the shared global scope: ${error.message}`,
      );
    }
  }
});

const instances = [
  {
    instanceId: 'i-0aaa',
    name: 'web-1',
    state: 'running',
    privateIp: '10.0.1.10',
    capacity: 'on-demand',
  },
  {
    instanceId: 'i-0bbb',
    name: 'batch',
    state: 'stopped',
    privateIp: '10.0.1.2',
    lifecycle: 'spot',
    capacity: 'spot',
    karpenterNodePool: 'default',
  },
  { instanceId: 'i-0ccc', name: null, state: 'running', privateIp: null, capacity: 'on-demand' },
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

test('capacity filters compose with the query', () => {
  const spot = filterInstances(instances, '', 'spot');
  assert.deepStrictEqual(spot.map((i) => i.instanceId), ['i-0bbb']);
  assert.deepStrictEqual(filterInstances(instances, 'web', 'spot'), []);
  const onDemand = filterInstances(instances, '', 'on-demand');
  assert.deepStrictEqual(onDemand.map((i) => i.instanceId), ['i-0aaa', 'i-0ccc']);
});

test('age renders the single largest unit', () => {
  const now = Date.parse('2026-08-07T12:00:00Z');
  assert.strictEqual(formatAge('2026-08-07T11:59:40Z', now), '<1m');
  assert.strictEqual(formatAge('2026-08-07T11:30:00Z', now), '30m');
  assert.strictEqual(formatAge('2026-08-07T05:00:00Z', now), '7h');
  assert.strictEqual(formatAge('2026-08-01T12:00:00Z', now), '6d');
  assert.strictEqual(formatAge('2026-05-07T12:00:00Z', now), '3mo');
  assert.strictEqual(formatAge('2024-08-07T12:00:00Z', now), '2y');
  assert.strictEqual(formatAge(null, now), null);
  assert.strictEqual(formatAge('not a date', now), null);
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

test('state colors: green running, red end states, amber transitions', () => {
  assert.strictEqual(stateClass('running'), 'state-running');
  assert.strictEqual(stateClass('stopped'), 'state-stopped');
  assert.strictEqual(stateClass('terminated'), 'state-stopped');
  assert.strictEqual(stateClass('pending'), 'state-transition');
  assert.strictEqual(stateClass('stopping'), 'state-transition');
  assert.strictEqual(stateClass('shutting-down'), 'state-transition');
  assert.strictEqual(stateClass(null), '');
  assert.strictEqual(stateClass('weird'), '');
});

// The Capacity column and the Spot only filter must agree, so both read the
// backend's capacity field rather than each deciding what an absent
// lifecycle means.
test('only spot capacity gets a color', () => {
  assert.strictEqual(capacityClass('spot'), 'capacity-spot');
  assert.strictEqual(capacityClass('on-demand'), '');
  assert.strictEqual(capacityClass('capacity-block'), '');
  assert.strictEqual(capacityClass(undefined), '');
});

test('session label states', () => {
  assert.strictEqual(sessionLabel(null), 'Not logged in');
  assert.strictEqual(sessionLabel({ loggedIn: false }), 'Not logged in');
  assert.strictEqual(sessionLabel({ loggedIn: true }), 'Logged in');
});
