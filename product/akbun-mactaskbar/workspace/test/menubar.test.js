// Scan parsing and filtering run on strings, so they are checked without
// touching the accessibility API. A broken filter either drops every real
// status item or fills the list with application menu entries.

const test = require('node:test');
const assert = require('node:assert');
const { scanScript, parseItems, isStatusItem } = require('../src/menubar');

test('the scan script quotes the process name', () => {
  const script = scanScript('CleanShot X', 2);
  assert.match(script, /tell process "CleanShot X"/);
  assert.match(script, /menu bar 2/);
});

test('a process name with a quote cannot break out of the script', () => {
  const script = scanScript('we"ird', 1);
  assert.match(script, /tell process "we\\"ird"/);
});

test('parsing keeps labelled rows and drops the rest', () => {
  const stdout = 'Battery\t1468\nClock\t1590\n\tnot a number\n\n';
  assert.deepStrictEqual(parseItems(stdout), [
    { label: 'Battery', x: 1468 },
    { label: 'Clock', x: 1590 },
  ]);
});

test('parsing a failed call yields nothing', () => {
  assert.deepStrictEqual(parseItems(null), []);
});

test('application menu entries are dropped, off screen items are kept', () => {
  const width = 1728;
  assert.strictEqual(isStatusItem({ x: 0 }, width), false, 'application menu sits at x 0');
  assert.strictEqual(isStatusItem({ x: 1468 }, width), true, 'status items sit on the right');
  assert.strictEqual(isStatusItem({ x: -120 }, width), true, 'pushed off screen is the point');
});
