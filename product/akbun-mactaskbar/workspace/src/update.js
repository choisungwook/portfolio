'use strict';

// Checks GitHub Releases for a newer build and, if the user agrees, downloads
// the dmg and swaps the .app bundle in place. Releases of this repository are
// the binary store and tags look like akbun-mactaskbar-v{version}.
//
// The build is unsigned, so Squirrel.Mac auto update is not an option. Swapping
// the bundle by hand works because a file the app downloaded itself never gets
// the quarantine attribute, so Gatekeeper does not inspect it.
//
// Disk leaks are the risk worth guarding: the dmg is large and the download
// happens in a temp directory. Cleanup lives in three places.
// 1. downloadDmg removes the directory it created when the download fails.
// 2. The swap script traps EXIT, so a failure at any step still unmounts and
//    removes the work directory.
// 3. cleanupTempDirs sweeps directories left behind by a kill at app start.

const { spawn } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const RELEASES_API = 'https://api.github.com/repos/choisungwook/portfolio/releases';
const TAG_PREFIX = 'akbun-mactaskbar-v';
const TEMP_PREFIX = 'akbun-mactaskbar-update-';

// Neither fetch can be left without a deadline. A stalled connection would hang
// the check with no way back, and hang the download with the install already
// marked in progress, so the menu item stays dead until the app restarts.
// The download deadline covers the streamed body too, so it is generous enough
// for a large dmg on a slow link rather than tuned to a fast one.
const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// Compares two "0.2.0" strings. Positive when a is newer.
function compareVersion(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if ((left[i] || 0) !== (right[i] || 0)) return (left[i] || 0) - (right[i] || 0);
  }
  return 0;
}

// electron-builder suffixes arm64 dmgs with -arm64 and leaves x64 unsuffixed.
function pickDmg(assets) {
  const dmgs = assets.filter((asset) => asset.name.endsWith('.dmg'));
  const wantArm = process.arch === 'arm64';
  const match = dmgs.find((asset) => asset.name.includes('-arm64.') === wantArm);
  return match ? match.browser_download_url : null;
}

async function checkUpdate(currentVersion) {
  const response = await fetch(RELEASES_API, {
    headers: { Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(CHECK_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub API error: ${response.status}`);

  const releases = await response.json();
  const release = releases.find((entry) => entry.tag_name.startsWith(TAG_PREFIX));
  if (!release) {
    return { current: currentVersion, latest: null, url: null, dmgUrl: null, hasUpdate: false };
  }

  const latest = release.tag_name.slice(TAG_PREFIX.length);
  return {
    current: currentVersion,
    latest,
    url: release.html_url,
    dmgUrl: pickDmg(release.assets),
    hasUpdate: compareVersion(latest, currentVersion) > 0,
  };
}

// Downloads the dmg into a temp directory and returns its path. The file is
// large, so it streams to disk instead of being buffered in memory.
async function downloadDmg(dmgUrl) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    const response = await fetch(dmgUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`dmg download failed: ${response.status}`);
    if (!response.body) throw new Error('dmg response body is empty');
    const dmgPath = path.join(dir, path.basename(new URL(dmgUrl).pathname));
    await pipeline(Readable.fromWeb(response.body), createWriteStream(dmgPath));
    return dmgPath;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

// Removes temp directories left by an attempt that was killed before its own
// cleanup ran. Called at app start so dmgs do not pile up.
async function cleanupTempDirs() {
  const tmpDir = os.tmpdir();
  const names = await fs.readdir(tmpDir);
  await Promise.all(
    names
      .filter((name) => name.startsWith(TEMP_PREFIX))
      .map((name) => fs.rm(path.join(tmpDir, name), { recursive: true, force: true }))
  );
}

// Waits for the app to quit, replaces the bundle and relaunches it. A running
// app cannot overwrite itself, so this has to run outside the app. If the copy
// fails the previous bundle is moved back.
const SWAP_SCRIPT = `#!/bin/bash
set -u
APP="$1"; DMG="$2"; PID="$3"
WORK=$(dirname "$DMG")
MOUNT=""

cleanup() {
  if [ -n "$MOUNT" ]; then
    hdiutil detach "$MOUNT" -quiet 2>/dev/null || hdiutil detach "$MOUNT" -force -quiet 2>/dev/null
    rmdir "$MOUNT" 2>/dev/null
  fi
  # This script lives inside WORK too. It is already open, so removing it is safe.
  rm -rf "$WORK"
}
trap cleanup EXIT

while kill -0 "$PID" 2>/dev/null; do sleep 0.3; done

MOUNT=$(mktemp -d) || exit 1
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint "$MOUNT" || exit 1
NEW=$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)
[ -n "$NEW" ] || exit 1

rm -rf "$APP.old"
mv "$APP" "$APP.old" || exit 1
if ditto "$NEW" "$APP"; then
  rm -rf "$APP.old"
else
  rm -rf "$APP"
  mv "$APP.old" "$APP"
  exit 1
fi

# The download carries no quarantine attribute, but clear whatever the dmg held.
xattr -cr "$APP"
open "$APP"
`;

// Starts the swap script detached from the app. The caller must quit right
// after, because the script waits for this pid to disappear.
async function spawnSwap(appPath, dmgPath) {
  const scriptPath = path.join(path.dirname(dmgPath), 'swap.sh');
  await fs.writeFile(scriptPath, SWAP_SCRIPT, { mode: 0o755 });
  const child = spawn('/bin/bash', [scriptPath, appPath, dmgPath, String(process.pid)], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
}

module.exports = {
  checkUpdate,
  compareVersion,
  pickDmg,
  downloadDmg,
  cleanupTempDirs,
  spawnSwap,
  SWAP_SCRIPT,
  TEMP_PREFIX,
};
