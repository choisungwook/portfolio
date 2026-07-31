// The updater downloads a large dmg into a temp directory. If any of the three
// cleanup points is lost, every failed update leaves a dmg on disk. Those
// points are hard to check by hand, so this test guards them.
//
// The swap script test also runs where hdiutil is missing: failing at attach is
// exactly the failure path being checked.

const test = require('node:test');
const assert = require('node:assert');
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
  TEMP_PREFIX,
} = require('../src/update');

function countTempDirs() {
  return fs.readdirSync(os.tmpdir()).filter((name) => name.startsWith(TEMP_PREFIX)).length;
}

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
}

test('version comparison orders releases', () => {
  assert.ok(compareVersion('0.2.0', '0.1.9') > 0);
  assert.ok(compareVersion('0.10.0', '0.9.0') > 0, 'compare numbers, not strings');
  assert.strictEqual(compareVersion('1.0.0', '1.0.0'), 0);
});

test('the dmg for this architecture is picked', () => {
  const assets = [
    { name: 'akbun-mactaskbar-0.1.0-arm64.dmg', browser_download_url: 'arm' },
    { name: 'akbun-mactaskbar-0.1.0.dmg', browser_download_url: 'x64' },
    { name: 'akbun-mactaskbar-0.1.0.zip', browser_download_url: 'zip' },
  ];
  assert.strictEqual(pickDmg(assets), process.arch === 'arm64' ? 'arm' : 'x64');
});

test('cleanupTempDirs removes only update directories', async () => {
  const stale = makeTempDir();
  fs.writeFileSync(path.join(stale, 'leftover.dmg'), 'x'.repeat(1024));
  const unrelated = fs.mkdtempSync(path.join(os.tmpdir(), 'unrelated-'));

  try {
    assert.ok(countTempDirs() > 0, 'the directory this test made should be visible');
    await cleanupTempDirs();

    assert.strictEqual(countTempDirs(), 0, 'an update temp directory survived');
    assert.ok(fs.existsSync(unrelated), 'an unrelated directory was removed');
  } finally {
    fs.rmSync(unrelated, { recursive: true, force: true });
  }
});

test('a failed download removes the directory it created', async () => {
  await cleanupTempDirs();

  // Connection refused, so this fails immediately and without a network.
  await assert.rejects(() => downloadDmg('http://127.0.0.1:1/akbun-mactaskbar.dmg'));

  assert.strictEqual(countTempDirs(), 0, 'the failed download left its directory behind');
});

test('a failed swap leaves no work directory', () => {
  const work = makeTempDir();
  const scriptPath = path.join(work, 'swap.sh');
  const dmgPath = path.join(work, 'fake.dmg');
  fs.writeFileSync(scriptPath, SWAP_SCRIPT, { mode: 0o755 });
  fs.writeFileSync(dmgPath, 'not a dmg, so attach fails');

  // A pid that already exited, so the wait loop returns at once.
  const deadPid = spawnSync('/usr/bin/true').pid;
  const appPath = path.join(work, 'nonexistent.app');

  const result = spawnSync('/bin/bash', [scriptPath, appPath, dmgPath, String(deadPid)], {
    stdio: 'ignore',
    timeout: 30_000,
  });

  assert.notStrictEqual(result.status, 0, 'an invalid dmg reported success');
  assert.ok(!fs.existsSync(work), 'the failed swap left its work directory behind');
});

test('all three cleanup points are still wired up', () => {
  const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf-8');

  assert.match(SWAP_SCRIPT, /trap cleanup EXIT/, 'the swap script lost its trap');
  assert.match(main, /cleanupTempDirs/, 'app start no longer sweeps leftovers');
  assert.match(main, /fs\.rm\(/, 'a failed install no longer removes the dmg');
});
