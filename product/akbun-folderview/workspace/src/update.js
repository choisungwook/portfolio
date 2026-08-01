'use strict';

// Checks GitHub Releases for a newer version and, if asked, downloads the NSIS
// installer and runs it silently. Ported from the macOS dmg swap in
// akbun-screenshot and akbun-k8supgradeview; the shape is the same and only the
// replacement mechanism differs. On Windows the installer does the swap, so
// there is no bundle copy to write by hand.
//
// A running exe cannot be overwritten, which is why the installer runs from a
// detached script that first waits for this process to exit.
//
// Temp files are the risk. Three cleanup points: downloadInstaller on failure,
// the script's single exit path, and cleanupTempDirs on app start for anything
// left behind by a kill.

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
const TAG_PREFIX = 'akbun-folderview-v';
const TEMP_PREFIX = 'akbun-folderview-update-';

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

// Pick the installer matching this arch. electron-builder suffixes arm64 only,
// so the plain name is the x64 build.
function pickInstaller(assets) {
  const installers = assets.filter((asset) => asset.name.toLowerCase().endsWith('.exe'));
  const wantArm = process.arch === 'arm64';
  const match = installers.find((asset) => asset.name.includes('-arm64.') === wantArm);
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
    return {
      current: currentVersion,
      latest: null,
      url: null,
      installerUrl: null,
      hasUpdate: false,
    };
  }

  const latest = release.tag_name.slice(TAG_PREFIX.length);
  return {
    current: currentVersion,
    latest,
    url: release.html_url,
    installerUrl: pickInstaller(release.assets),
    hasUpdate: compareVersion(latest, currentVersion) > 0,
  };
}

// Stream the installer into a temp dir and return its path. Removes the dir on
// failure, so a dropped connection does not leave 90 MB behind.
async function downloadInstaller(installerUrl) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), TEMP_PREFIX));
  try {
    const response = await fetch(installerUrl, {
      signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`installer download failed: ${response.status}`);
    if (!response.body) throw new Error('empty installer response body');
    const installerPath = path.join(dir, path.basename(new URL(installerUrl).pathname));
    await pipeline(Readable.fromWeb(response.body), createWriteStream(installerPath));
    return installerPath;
  } catch (error) {
    await fs.rm(dir, { recursive: true, force: true });
    throw error;
  }
}

// Remove temp dirs left behind when the app or the script was killed.
async function cleanupTempDirs() {
  const tmpDir = os.tmpdir();
  const names = await fs.readdir(tmpDir);
  await Promise.all(
    names
      .filter((name) => name.startsWith(TEMP_PREFIX))
      .map((name) => fs.rm(path.join(tmpDir, name), { recursive: true, force: true }))
  );
}

// Waits for the app to quit, runs the installer silently, relaunches. Every
// failure jumps to :done, so the work dir is removed on exactly one path.
//
// The last line is the batch self delete idiom: "(goto) 2>nul" ends the script
// context and releases cmd's handle on this file, and the command after "&"
// then runs with the file already unlocked. Without it rmdir would leave the
// script behind, because a running batch file cannot delete itself.
//
// The installer relaunches the app on its own after a normal install. The
// "start" here covers the silent case, and the single instance lock in main.js
// turns a double launch into a focus instead of a second window.
const SWAP_SCRIPT = `@echo off
setlocal
set "INSTALLER=%~1"
set "APP=%~2"
set "PID=%~3"
set "WORK=%~dp0"
set "WORK=%WORK:~0,-1%"

:wait
tasklist /FI "PID eq %PID%" /NH 2>nul | find "%PID%" >nul
if errorlevel 1 goto ready
ping -n 2 127.0.0.1 >nul
goto wait

:ready
if not exist "%INSTALLER%" goto done
"%INSTALLER%" /S
if errorlevel 1 goto done
start "" "%APP%"

:done
del /q "%INSTALLER%" 2>nul
cd /d "%TEMP%"
(goto) 2>nul & rmdir /s /q "%WORK%"
`;

// Start the script detached. The caller must app.quit() right after.
async function spawnSwap(exePath, installerPath) {
  const scriptPath = path.join(path.dirname(installerPath), 'swap.cmd');
  await fs.writeFile(scriptPath, SWAP_SCRIPT);
  const child = spawn(
    process.env.COMSPEC || 'cmd.exe',
    ['/c', scriptPath, installerPath, exePath, String(process.pid)],
    { detached: true, stdio: 'ignore', windowsHide: true }
  );
  child.unref();
}

module.exports = {
  checkUpdate,
  cleanupTempDirs,
  compareVersion,
  downloadInstaller,
  pickInstaller,
  spawnSwap,
  SWAP_SCRIPT,
};
