'use strict';

// The update path downloads a large installer into a temp dir. Miss one cleanup
// point and every failed attempt fills the disk, so all three are checked here:
// downloadInstaller on failure, the script's single exit path, and
// cleanupTempDirs on start.
//
// The script itself is a batch file, so it can only be run on Windows. The
// release job runs these tests on windows-latest for that reason; on the
// ubuntu pull request job that one test is skipped and the rest still run.

const assert = require('node:assert');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  cleanupTempDirs,
  compareVersion,
  downloadInstaller,
  pickInstaller,
  SWAP_SCRIPT,
} = require('../src/update');

const TEMP_PREFIX = 'akbun-folderview-update-';

function countTempDirs() {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX)).length;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
}

test('compareVersion orders releases by number, not string', () => {
  assert.ok(compareVersion('0.10.0', '0.9.0') > 0);
  assert.ok(compareVersion('0.1.0', '0.1.1') < 0);
  assert.strictEqual(compareVersion('1.0.0', '1.0.0'), 0);
});

test('pickInstaller matches the running architecture', () => {
  const assets = [
    { name: 'akbun-folderview-Setup-0.1.0-arm64.exe', browser_download_url: 'arm' },
    { name: 'akbun-folderview-Setup-0.1.0.exe', browser_download_url: 'x64' },
    { name: 'akbun-folderview-0.1.0.zip', browser_download_url: 'zip' },
  ];
  assert.strictEqual(pickInstaller(assets), process.arch === 'arm64' ? 'arm' : 'x64');
  assert.strictEqual(pickInstaller([{ name: 'notes.txt', browser_download_url: 'x' }]), null);
});

test('cleanupTempDirs removes only update temp dirs', async () => {
  const stale = makeTempDir();
  fs.writeFileSync(path.join(stale, 'leftover.exe'), 'x'.repeat(1024));
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'unrelated-'));

  try {
    assert.ok(countTempDirs() > 0, 'the dir this test created should be visible');
    await cleanupTempDirs();

    assert.strictEqual(countTempDirs(), 0, 'an update temp dir was left behind');
    assert.ok(fs.existsSync(unrelated), 'unrelated dirs must survive');
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
});

test('downloadInstaller removes its temp dir when the download fails', async () => {
  await cleanupTempDirs();

  // Connection refused, so this fails immediately without network access.
  await assert.rejects(() => downloadInstaller('http://127.0.0.1:1/setup.exe'));

  assert.strictEqual(countTempDirs(), 0, 'a failed download left its dir behind');
});

// Both fetches need a deadline. Without one a stalled connection hangs the
// check with no way back, and hangs the download with the install already
// marked in progress, which kills the menu item until the app restarts.
// Waiting out a real timeout is not worth the test time, so the wiring is what
// gets checked.
test('both fetch calls carry a timeout', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/update.js'), 'utf-8');
  const signals = source.match(/signal: AbortSignal\.timeout\(/g) || [];

  assert.strictEqual(signals.length, 2, 'a fetch lost its deadline');
});

test('all three cleanup points are still wired up', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');

  assert.match(SWAP_SCRIPT, /rmdir \/s \/q "%WORK%"/, 'the script no longer removes its work dir');
  assert.match(mainSource, /cleanupTempDirs/, 'app start does not clean leftovers');
  assert.match(mainSource, /rm\(path\.dirname\(installerPath\)/, 'a failed install keeps the installer');
});

// Every failure inside the script has to reach :done, or a dead end would skip
// the only place the work dir is removed.
test('the script has one exit path and no early exit', () => {
  const jumps = SWAP_SCRIPT.match(/goto (\w+)/g) || [];
  assert.ok(jumps.includes('goto done'), 'nothing jumps to the cleanup label');
  assert.ok(!/\bexit \/b\b/.test(SWAP_SCRIPT), 'an exit /b would skip the cleanup');
  assert.match(SWAP_SCRIPT, /^:done$/m, 'the cleanup label is gone');
});

test(
  'the script leaves no work dir when the installer is missing',
  { skip: process.platform !== 'win32' && 'batch scripts only run on Windows' },
  () => {
    const work = makeTempDir();
    const scriptPath = path.join(work, 'swap.cmd');
    const installerPath = path.join(work, 'missing-setup.exe');
    fs.writeFileSync(scriptPath, SWAP_SCRIPT);

    // A finished process id makes the wait loop exit right away.
    const deadPid = spawnSync(process.execPath, ['-e', '0']).pid;
    const appPath = path.join(work, 'nonexistent.exe');

    spawnSync(process.env.COMSPEC || 'cmd.exe', [
      '/c', scriptPath, installerPath, appPath, String(deadPid),
    ], { stdio: 'ignore', timeout: 60_000 });

    assert.ok(!fs.existsSync(work), 'the failed run left its work dir behind');
  }
);
