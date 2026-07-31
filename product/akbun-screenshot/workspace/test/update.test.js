'use strict';

// The update path downloads a large dmg into a temp dir. Miss one cleanup point
// and every failed attempt fills the disk, so all three are checked here:
// downloadDmg on failure, the swap script's trap, and cleanupTempDirs on start.
// The swap script test also runs where hdiutil is absent — the attach failure is
// exactly the path under test.

const assert = require('node:assert');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  cleanupTempDirs,
  compareVersion,
  downloadDmg,
  pickDmg,
  SWAP_SCRIPT,
} = require('../src/update');

const TEMP_PREFIX = 'akbun-screenshot-update-';

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

test('pickDmg matches the running architecture', () => {
  const assets = [
    { name: 'akbun-screenshot-0.2.0-arm64.dmg', browser_download_url: 'arm' },
    { name: 'akbun-screenshot-0.2.0.dmg', browser_download_url: 'x64' },
    { name: 'akbun-screenshot-0.2.0.zip', browser_download_url: 'zip' },
  ];
  assert.strictEqual(pickDmg(assets), process.arch === 'arm64' ? 'arm' : 'x64');
  assert.strictEqual(pickDmg([{ name: 'notes.txt', browser_download_url: 'x' }]), null);
});

test('cleanupTempDirs removes only update temp dirs', async () => {
  const stale = makeTempDir();
  fs.writeFileSync(path.join(stale, 'leftover.dmg'), 'x'.repeat(1024));
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

test('downloadDmg removes its temp dir when the download fails', async () => {
  await cleanupTempDirs();

  // Connection refused, so this fails immediately without network access.
  await assert.rejects(() => downloadDmg('http://127.0.0.1:1/akbun-screenshot.dmg'));

  assert.strictEqual(countTempDirs(), 0, 'a failed download left its dir behind');
});

test('the swap script leaves no work dir when it fails', () => {
  const work = makeTempDir();
  const scriptPath = path.join(work, 'swap.sh');
  const dmgPath = path.join(work, 'fake.dmg');
  fs.writeFileSync(scriptPath, SWAP_SCRIPT, { mode: 0o755 });
  fs.writeFileSync(dmgPath, 'not a dmg, so attach fails');

  // A finished process id makes the wait loop exit right away.
  const deadPid = spawnSync('/usr/bin/true').pid;
  const appPath = path.join(work, 'nonexistent.app');

  const result = spawnSync('/bin/bash', [scriptPath, appPath, dmgPath, String(deadPid)], {
    stdio: 'ignore',
    timeout: 30_000,
  });

  assert.notStrictEqual(result.status, 0, 'a bogus dmg must not succeed');
  assert.ok(!fs.existsSync(work), 'the failed swap left its work dir behind');
});

test('all three cleanup points are still wired up', () => {
  const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');

  assert.match(SWAP_SCRIPT, /trap cleanup EXIT/, 'the swap script trap is gone');
  assert.match(mainSource, /cleanupTempDirs/, 'app start does not clean leftovers');
  assert.match(mainSource, /fs\.rm\(/, 'a failed install does not remove the dmg');
});
