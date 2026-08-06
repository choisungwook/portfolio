'use strict';

// Pure page logic: filtering, sorting and label formatting. No Tauri and no
// DOM, so node --test runs this file as is. Search never asks the backend —
// it runs over the array the page already has, on every keystroke.

function filterInstances(instances, query, spotOnly) {
  const pool = spotOnly
    ? instances.filter((instance) => instance.lifecycle === 'spot')
    : instances;
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return pool.slice();
  }
  return pool.filter(
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

// The single largest unit is enough for a glance; sorting uses the raw
// launchTime, not this label. Months and years are calendar approximations
// (30 and 365 days), fine for a viewer.
function formatAge(launchTime, nowMs = Date.now()) {
  if (!launchTime) {
    return null;
  }
  const launched = Date.parse(launchTime);
  if (Number.isNaN(launched)) {
    return null;
  }
  const minutes = Math.floor((nowMs - launched) / 60_000);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
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
  formatAge,
  stateClass,
  sessionLabel,
};

// Always publish the browser global. Some WebViews expose a CommonJS-like
// `module` object even though scripts are loaded with script tags.
globalThis.awsviewerLib = exported;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
}
