'use strict';

// Reads the menu bar inventory through the accessibility API, driven by
// osascript. macOS has no API that lists status items across applications, so
// every owning process has to be asked one by one.
//
// Asking System Events to walk every process in a single script takes minutes:
// the calls are serial and one unresponsive app blocks the whole loop. Asking
// one named process takes about 150ms. So the scan is two stages, the process
// list first and then one short-lived osascript per process, run in a small
// pool with a per-call timeout so a hung app costs one slot instead of the run.

const { execFile } = require('node:child_process');

const CALL_TIMEOUT_MS = 5000;

// Eight in flight keeps a full scan around ten seconds. Raising it does not
// help: the accessibility calls contend with each other, slow processes hit the
// timeout, and items go missing from the result.
const POOL_SIZE = 8;

// Generic accessibility description every unlabelled status item reports. It
// says nothing, so the owning process name is the better label.
const GENERIC_LABEL = 'status menu';

function runOsascript(script) {
  return new Promise((resolve) => {
    execFile('osascript', ['-e', script], { timeout: CALL_TIMEOUT_MS }, (error, stdout) => {
      resolve(error ? null : stdout);
    });
  });
}

// Status items live in menu bar 2 for apps that also have an application menu,
// and in menu bar 1 for agents that have no application menu. Reading both and
// letting the caller drop the application menu by position is cheaper than
// guessing which kind of process this is.
function scanScript(processName, barIndex) {
  return `tell application "System Events"
  tell process ${JSON.stringify(processName)}
    set out to ""
    repeat with i in menu bar items of menu bar ${barIndex}
      set label to description of i
      if label is missing value then set label to title of i
      if label is missing value then set label to ""
      set p to position of i
      set out to out & label & tab & (item 1 of p) & linefeed
    end repeat
    return out
  end tell
end tell`;
}

// "Wi-Fi\t1521\n" -> [{ label: "Wi-Fi", x: 1521 }]
function parseItems(stdout) {
  if (!stdout) return [];
  return stdout
    .split('\n')
    .map((line) => line.split('\t'))
    .filter((parts) => parts.length === 2 && parts[1].trim() !== '')
    .map(([label, x]) => ({ label: label.trim(), x: Number(x) }))
    .filter((item) => Number.isFinite(item.x));
}

// Menu bar 1 of an agent mixes real status items with placeholders for the
// system extras that are turned off, and those sit at x 0. Real items sit on
// the right half of the bar, or at a negative x once a spacer has pushed them
// off screen, which is exactly the case worth reporting.
//
// This filter is only for menu bar 1. Everything in menu bar 2 is a status item
// by definition, and filtering it by position would drop the app's own spacers
// once they grow wide enough to shift the section left of the halfway mark.
function isStatusItem(item, screenWidth) {
  return item.x > screenWidth / 2 || item.x < 0;
}

async function scanProcess(name, screenWidth) {
  // Menu bar 2 covers apps that also have an application menu, which is most of
  // them. Only the agents without one need the second call.
  let items = parseItems(await runOsascript(scanScript(name, 2)));
  if (items.length === 0) {
    items = parseItems(await runOsascript(scanScript(name, 1))).filter((item) =>
      isStatusItem(item, screenWidth)
    );
  }

  return items.map((item) => ({
    app: name,
    label: item.label && item.label !== GENERIC_LABEL ? item.label : name,
    x: item.x,
    visible: item.x >= 0 && item.x < screenWidth,
  }));
}

async function listProcessNames() {
  const stdout = await runOsascript(
    'tell application "System Events" to get name of every process'
  );
  if (!stdout) return [];
  return [...new Set(stdout.trim().split(', ').filter(Boolean))];
}

// Run tasks with a bounded number in flight so a machine with 90 processes does
// not spawn 90 osascript children at once.
async function pooled(items, worker) {
  const results = [];
  let cursor = 0;
  const runners = Array.from({ length: POOL_SIZE }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

// Every status item on the bar, left to right. Duplicated x values are fine:
// they mean two agents drew at the same spot before the bar settled.
async function runScan(screenWidth) {
  const names = await listProcessNames();
  const perProcess = await pooled(names, (name) => scanProcess(name, screenWidth));
  return perProcess.flat().sort((a, b) => a.x - b.x);
}

// Hands every caller the scan already running instead of starting another. A
// scan holds eight osascript calls open; a second one alongside it doubles that
// and pushes both back into the contention that loses items. The wrapper sits
// here rather than at the caller so no future caller can skip it.
function shareInFlight(work) {
  let running = null;
  return (...args) => {
    if (!running) {
      running = work(...args).finally(() => {
        running = null;
      });
    }
    return running;
  };
}

const listMenuBarItems = shareInFlight(runScan);

module.exports = { listMenuBarItems, shareInFlight, scanScript, parseItems, isStatusItem };
