'use strict';

(function () {

const TABS = ['video', 'audio', 'effects', 'transition', 'image', 'file'];

function toggledPanel(active, requested) {
  return active === requested ? null : requested;
}

function orderedMarkers(markers) {
  return [...(markers || [])].sort((left, right) =>
    left.frame - right.frame || String(left.id).localeCompare(String(right.id))
  );
}

function adjacentTab(current, offset) {
  const index = Math.max(0, TABS.indexOf(current));
  return TABS[(index + offset + TABS.length) % TABS.length];
}

const exported = { TABS, toggledPanel, orderedMarkers, adjacentTab };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.panelLib = exported;
}
})();
