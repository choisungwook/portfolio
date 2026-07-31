// The section state machine decides which spacer is wide, which is the whole
// hide mechanism. A wrong title here means icons stay hidden with no way back.

const test = require('node:test');
const assert = require('node:assert');
const { nextState, spacerTitles, spacerLength, controlTitle } = require('../src/sections');

test('cycling the state returns to the start', () => {
  assert.strictEqual(nextState('collapsed'), 'expanded');
  assert.strictEqual(nextState('expanded'), 'all');
  assert.strictEqual(nextState('all'), 'collapsed');
});

test('collapsed hides both sections, all shows everything', () => {
  const collapsed = spacerTitles('collapsed', 1728);
  assert.ok(collapsed.hidden.length > 0, 'hidden spacer must be wide');
  assert.ok(collapsed.alwaysHidden.length > 0, 'always-hidden spacer must be wide');

  const all = spacerTitles('all', 1728);
  assert.strictEqual(all.hidden, '', 'hidden spacer must collapse');
  assert.strictEqual(all.alwaysHidden, '', 'always-hidden spacer must collapse');
});

test('expanded reveals the hidden section but keeps always-hidden off screen', () => {
  const titles = spacerTitles('expanded', 1728);
  assert.strictEqual(titles.hidden, '', 'hidden section must come back');
  assert.ok(titles.alwaysHidden.length > 0, 'always-hidden section must stay off screen');
});

test('a wide spacer is wider than the screen', () => {
  // A space renders about 4pt wide, so the title has to be longer than the
  // screen width in points divided by that.
  const width = 1728;
  assert.ok(spacerLength(width) * 4 > width, 'spacer cannot push icons off screen');
});

test('every state has its own control title', () => {
  const titles = ['collapsed', 'expanded', 'all'].map(controlTitle);
  assert.strictEqual(new Set(titles).size, 3, 'states must be distinguishable');
  assert.ok(
    titles.every((title) => title && title.length > 0),
    'control must stay clickable'
  );
});
