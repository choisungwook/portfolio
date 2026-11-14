'use strict';

(function () {

const TABS = ['video', 'audio', 'transition'];

function toggledPanel(active, requested) {
  return active === requested ? null : requested;
}

function orderedMarkers(markers) {
  return [...(markers || [])].sort((left, right) =>
    left.frame - right.frame || String(left.id).localeCompare(String(right.id))
  );
}

function adjacentTab(current, offset, tabs = TABS) {
  const index = Math.max(0, tabs.indexOf(current));
  return tabs[(index + offset + tabs.length) % tabs.length];
}

const exported = { TABS, toggledPanel, orderedMarkers, adjacentTab };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.panelLib = exported;
}
})();
