'use strict';

// Section state machine. Pure functions only, so tests run without electron.
//
// The menu bar is split into three sections by two spacer status items that
// this app owns. Laid out left to right the bar looks like this:
//
//   [always-hidden items] [AH spacer] [hidden items] [H spacer] [visible items] [control]
//
// A spacer is a status item whose title is a long run of spaces. Expanding one
// makes it wide enough to push everything to its left past the left edge of the
// screen, where macOS simply stops drawing status items. Collapsing it back to
// an empty title lets those items slide into view again. This is the same
// expandable-spacer trick Dozer, Hidden Bar and Ice use; the difference is that
// they set NSStatusItem.length directly while Electron only exposes the title.
//
// Cycling through the three states is what answers "too many icons": instead of
// scrolling one bar, the icons are paged one section at a time.

const STATES = ['collapsed', 'expanded', 'all'];

// Which spacers are wide in each state. true means the section to its left is
// pushed off screen.
const SPACER_EXPANDED = {
  collapsed: { hidden: true, alwaysHidden: true },
  expanded: { hidden: false, alwaysHidden: true },
  all: { hidden: false, alwaysHidden: false },
};

const CONTROL_TITLE = {
  collapsed: '›',
  expanded: '»',
  all: '‹',
};

function nextState(state) {
  const index = STATES.indexOf(state);
  return STATES[(index + 1) % STATES.length];
}

// A space renders about 4pt wide in the menu bar font. Doubling the screen
// width leaves room for the icons that also have to be pushed off screen.
function spacerLength(screenWidth) {
  return Math.ceil((screenWidth * 2) / 4);
}

// Titles for both spacer status items. An empty title collapses the spacer to
// the minimum width macOS gives a status item.
function spacerTitles(state, screenWidth) {
  const wide = ' '.repeat(spacerLength(screenWidth));
  const expanded = SPACER_EXPANDED[state];
  return {
    hidden: expanded.hidden ? wide : '',
    alwaysHidden: expanded.alwaysHidden ? wide : '',
  };
}

function controlTitle(state) {
  return CONTROL_TITLE[state];
}

module.exports = { STATES, nextState, spacerTitles, spacerLength, controlTitle };
