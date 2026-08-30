'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const { createLatestRequest, createLatestPersistence } = require('../src/latest.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test('an older superseded failure cannot revert or notify', async () => {
  const latest = createLatestRequest();
  const old = deferred();
  const current = deferred();
  const applied = [];
  const failures = [];

  const oldRun = latest(
    () => old.promise,
    (value) => applied.push(value),
    (error) => failures.push(error.message),
  );
  const currentRun = latest(
    () => current.promise,
    (value) => applied.push(value),
    (error) => failures.push(error.message),
  );

  old.reject(new Error('superseded'));
  assert.strictEqual(await oldRun, false);
  assert.deepStrictEqual(applied, []);
  assert.deepStrictEqual(failures, []);

  current.resolve('latest settings');
  assert.strictEqual(await currentRun, true);
  assert.deepStrictEqual(applied, ['latest settings']);
  assert.deepStrictEqual(failures, []);
});

test('an older success cannot replace the latest settings state', async () => {
  const latest = createLatestRequest();
  const old = deferred();
  const current = deferred();
  const applied = [];

  const oldRun = latest(
    () => old.promise,
    (value) => applied.push(value),
    () => assert.fail('the old request succeeded'),
  );
  const currentRun = latest(
    () => current.promise,
    (value) => applied.push(value),
    () => assert.fail('the latest request succeeded'),
  );

  old.resolve('old settings');
  assert.strictEqual(await oldRun, false);
  assert.deepStrictEqual(applied, []);

  current.resolve('latest settings');
  assert.strictEqual(await currentRun, true);
  assert.deepStrictEqual(applied, ['latest settings']);
});

test('only the latest failure runs its revert and notice path', async () => {
  const latest = createLatestRequest();
  const failures = [];

  const applied = await latest(
    async () => {
      throw new Error('cannot save');
    },
    () => assert.fail('a failed save cannot succeed'),
    (error) => failures.push(error.message),
  );

  assert.strictEqual(applied, true);
  assert.deepStrictEqual(failures, ['cannot save']);
});

function settingsHarness(initial) {
  let confirmed = { ...initial };
  let ui = { ...initial };
  const requests = [];
  const failures = [];
  const persist = createLatestPersistence({
    save: (settings) => {
      const waiting = deferred();
      requests.push({ settings, waiting });
      return waiting.promise;
    },
    confirmed: () => confirmed,
    optimistic: (settings) => {
      ui = { ...settings };
    },
    confirm: (settings) => {
      confirmed = { ...settings };
      ui = { ...settings };
    },
    restore: (settings) => {
      ui = { ...settings };
    },
    fail: (error) => failures.push(error.message),
  });
  return {
    change(patch) {
      ui = { ...ui, ...patch };
      return persist({ ...ui });
    },
    confirmed: () => confirmed,
    ui: () => ui,
    requests,
    failures,
  };
}

test('quality then snap rollback together to the last confirmed settings', async () => {
  const initial = { previewQuality: 'full', snap: false };
  const settings = settingsHarness(initial);

  const quality = settings.change({ previewQuality: 'half' });
  const snap = settings.change({ snap: true });
  assert.deepStrictEqual(settings.requests.map((request) => request.settings), [
    { previewQuality: 'half', snap: false },
    { previewQuality: 'half', snap: true },
  ]);

  settings.requests[0].waiting.reject(new Error('superseded'));
  assert.strictEqual(await quality, false);
  settings.requests[1].waiting.reject(new Error('latest failed'));
  assert.strictEqual(await snap, true);

  assert.deepStrictEqual(settings.confirmed(), initial);
  assert.deepStrictEqual(settings.ui(), initial);
  assert.deepStrictEqual(settings.failures, ['latest failed']);
});

test('a late quality success does not move the confirmed rollback point', async () => {
  const initial = { previewQuality: 'full', snap: false };
  const settings = settingsHarness(initial);

  const half = settings.change({ previewQuality: 'half' });
  const quarter = settings.change({ previewQuality: 'quarter' });
  settings.requests[0].waiting.resolve({ previewQuality: 'half', snap: false });
  assert.strictEqual(await half, false);
  assert.deepStrictEqual(settings.confirmed(), initial);
  assert.deepStrictEqual(settings.ui(), { previewQuality: 'quarter', snap: false });

  settings.requests[1].waiting.reject(new Error('quarter failed'));
  assert.strictEqual(await quarter, true);
  assert.deepStrictEqual(settings.confirmed(), initial);
  assert.deepStrictEqual(settings.ui(), initial);
});

test('all settings callers share latest-wins while keeping their own failure UI', async () => {
  const requests = [];
  const failures = [];
  let confirmed = { previewQuality: 'full', proxyEnabled: false };
  let ui = { ...confirmed };
  const persist = createLatestPersistence({
    save: (settings) => {
      const waiting = deferred();
      requests.push({ settings, waiting });
      return waiting.promise;
    },
    confirmed: () => confirmed,
    optimistic: (settings) => {
      ui = { ...settings };
    },
    confirm: (settings) => {
      confirmed = { ...settings };
      ui = { ...settings };
    },
    restore: (settings) => {
      ui = { ...settings };
    },
  });

  const toolbar = persist({ ...ui, previewQuality: 'half' }, {
    fail: () => failures.push('toolbar'),
  });
  const sheet = persist({ ...ui, proxyEnabled: true }, {
    fail: () => failures.push('sheet'),
  });

  requests[0].waiting.reject(new Error('superseded'));
  assert.strictEqual(await toolbar, false);
  requests[1].waiting.resolve({ previewQuality: 'half', proxyEnabled: true });
  assert.strictEqual(await sheet, true);
  assert.deepStrictEqual(confirmed, { previewQuality: 'half', proxyEnabled: true });
  assert.deepStrictEqual(ui, confirmed);
  assert.deepStrictEqual(failures, []);
});

test('a request superseded during confirm cannot run its caller callback', async () => {
  const oldSave = deferred();
  const currentSave = deferred();
  const oldConfirm = deferred();
  const callbacks = [];
  let saves = 0;
  let confirmed = 'initial';
  const persist = createLatestPersistence({
    save: () => {
      saves += 1;
      return saves === 1 ? oldSave.promise : currentSave.promise;
    },
    confirmed: () => confirmed,
    confirm: async (value) => {
      confirmed = value;
      if (value === 'old') await oldConfirm.promise;
    },
    restore: () => {},
  });

  const old = persist('old', { confirm: () => callbacks.push('old') });
  oldSave.resolve('old');
  await Promise.resolve();
  const current = persist('current', { confirm: () => callbacks.push('current') });
  currentSave.resolve('current');
  assert.strictEqual(await current, true);
  oldConfirm.resolve();
  assert.strictEqual(await old, false);

  assert.deepStrictEqual(callbacks, ['current']);
});

test('latest failure restores the backend checkpoint an older success committed', async () => {
  const oldSave = deferred();
  const currentSave = deferred();
  let saves = 0;
  let localConfirmed = 'initial';
  let backendConfirmed = 'initial';
  let ui = 'initial';
  const persist = createLatestPersistence({
    save: () => {
      saves += 1;
      return saves === 1 ? oldSave.promise : currentSave.promise;
    },
    optimistic: (value) => {
      ui = value;
    },
    confirmed: () => localConfirmed,
    recover: async () => backendConfirmed,
    confirm: (value) => {
      localConfirmed = value;
      ui = value;
    },
    restore: (value) => {
      localConfirmed = value;
      ui = value;
    },
  });

  const old = persist('A');
  const current = persist('B');
  backendConfirmed = 'A';
  oldSave.resolve('A');
  assert.strictEqual(await old, false);
  currentSave.reject(new Error('B failed'));
  assert.strictEqual(await current, true);

  assert.strictEqual(localConfirmed, 'A');
  assert.strictEqual(ui, 'A');
});
