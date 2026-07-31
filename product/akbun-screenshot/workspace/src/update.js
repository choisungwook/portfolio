'use strict';

// Checks GitHub Releases for a newer version and, if asked, downloads the dmg
// and swaps the .app bundle in place. Same approach as akbun-k8supgradeview:
// the app is unsigned, so Squirrel.Mac auto update is out. Files fetched by the
// app itself get no quarantine attribute, so Gatekeeper does not block them.
//
// Temp files are the risk. Three cleanup points: downloadDmg on failure, the
// swap script's trap, and cleanupTempDirs on app start for anything left by a
// kill -9.

const { spawn } = require('node:child_process');
const { createWriteStream } = require('node:fs');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

// This repository releases several products, so one page of 30 would push this
// app's newest release out of reach as releases pile up. 100 is the API maximum.
const RELEASES_API =
  'https://api.github.com/repos/choisungwook/portfolio/releases?per_page=100';
const TAG_PREFIX = 'akbun-screenshot-v';
const TEMP_PREFIX = 'akbun-screenshot-update-';

// Neither fetch can be left without a deadline. A stalled connection would hang
// the check, and hang the download with the install already marked in progress,
// so the menu item stays dead until the app restarts. The download deadline
// covers the streamed body, so it is generous rather than tuned to a fast link.
const CHECK_TIMEOUT_MS = 15_000;
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

// Compare "0.2.0" strings. Positive when a is newer.
function compareVersion(a, b) {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((left[i] ?? 0) !== (right[i] ?? 0)) return (left[i] ?? 0) - (right[i] ?? 0);
  }
  return 0;
}

// Pick the dmg matching this arch. electron-builder suffixes arm64 only.
function pickDmg(assets) {
  const dmgs = assets.filter((asset) => asset.name.endsWith('.dmg'));
  const wantArm = process.arch === 'arm64';
  const match = dmgs.find((asset) => asset.name.includes('-arm64.') === wantArm);
  return match?.browser_download_url ?? null;
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

// Stream the dmg into a temp dir and return its path. Removes the dir on failure.
async function downloadDmg(dmgUrl) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    const response = await fetch(dmgUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`dmg download failed: ${response.status}`);
    if (!response.body) throw new Error('empty dmg response body');
    const dmgPath = path.join(dir, path.basename(new URL(dmgUrl).pathname));
    await pipeline(Readable.fromWeb(response.body), createWriteStream(dmgPath));
    return dmgPath;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

// Remove temp dirs left behind when the app or the swap script was killed.
async function cleanupTempDirs() {
  const tmpDir = os.tmpdir();
  const names = await fs.readdir(tmpDir);
  await Promise.all(
    names
      .filter((name) => name.startsWith(TEMP_PREFIX))
      .map((name) => fs.rm(path.join(tmpDir, name), { recursive: true, force: true }))
  );
}

// Waits for the app to quit, replaces the .app bundle, relaunches. Must run
// outside the app because a running bundle cannot overwrite itself. Restores
// the old bundle if ditto fails; the trap removes the mount and work dir.
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
  # This script lives in WORK too. Already open, so removing it is fine.
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

xattr -cr "$APP"
open "$APP"
`;

// Start the swap script detached. The caller must app.quit() right after.
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
  cleanupTempDirs,
  compareVersion,
  downloadDmg,
  pickDmg,
  spawnSwap,
  SWAP_SCRIPT,
};
