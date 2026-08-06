'use strict';

// Pure page logic: filtering, sorting and label formatting. No Tauri and no
// DOM, so node --test runs this file as is. Search never asks the backend —
// it runs over the array the page already has, on every keystroke.

function filterInstances(instances, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return instances.slice();
  }
  return instances.filter(
    (instance) =>
      (instance.instanceId || '').toLowerCase().includes(q) ||
      (instance.name || '').toLowerCase().includes(q),
  );
}

function isMissing(value) {
  return value === null || value === undefined || value === '';
}

// Missing values sort last in either direction — outside the direction
// factor, so flipping a column of half-empty public IPs never floats the
// empty rows to the top.
function sortInstances(instances, key, direction) {
  const factor = direction === 'desc' ? -1 : 1;
  return instances.slice().sort((a, b) => {
    const left = a[key];
    const right = b[key];
    if (isMissing(left) || isMissing(right)) {
      if (isMissing(left) && isMissing(right)) return 0;
      return isMissing(left) ? 1 : -1;
    }
    const result =
      typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left).localeCompare(String(right));
    return result * factor;
  });
}

function formatProtocol(protocol) {
  if (protocol === '-1' || protocol === null || protocol === undefined) {
    return 'all';
  }
  return protocol;
}

function formatPortRange(fromPort, toPort) {
  if (fromPort === null || fromPort === undefined) {
    return 'all';
  }
  if (toPort === null || toPort === undefined || fromPort === toPort) {
    return String(fromPort);
  }
  return `${fromPort} - ${toPort}`;
}

// EC2 instance states: green for running, red for the two end states, amber
// for the transitions in between. Unknown or missing state gets no color
// rather than pretending to be stopped.
function stateClass(state) {
  if (state === 'running') return 'state-running';
  if (state === 'stopped' || state === 'terminated') return 'state-stopped';
  if (state === 'pending' || state === 'stopping' || state === 'shutting-down') {
    return 'state-transition';
  }
  return '';
}

function sessionLabel(session) {
  if (!session || !session.loggedIn) {
    return 'Not logged in';
  }
  if (session.expiresAt) {
    return `Session until ${session.expiresAt}`;
  }
  return 'Logged in';
}

const exported = {
  filterInstances,
  sortInstances,
  formatProtocol,
  formatPortRange,
  stateClass,
  sessionLabel,
};

// Always publish the browser global. Some WebViews expose a CommonJS-like
// `module` object even though scripts are loaded with script tags.
globalThis.awsviewerLib = exported;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}
