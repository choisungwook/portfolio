'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  contextMenuPosition, filterWorktrees, formatBytes, sortWorktrees,
} = require('../src/renderer/view-model');

const worktrees = [
  { path: '/work/zeta', repository: 'portfolio', branch: 'codex/zeta', sizeBytes: 10, modifiedMs: 100 },
  { path: '/work/alpha', repository: 'api', branch: 'claude/alpha', sizeBytes: 30, modifiedMs: 300 },
  { path: '/work/beta', repository: 'docs', branch: 'codex/beta', sizeBytes: 20, modifiedMs: 200 },
];

test('worktrees sort by size, modification date, and path', () => {
  assert.deepEqual(sortWorktrees(worktrees, 'size-desc').map((item) => item.path), [
    '/work/alpha', '/work/beta', '/work/zeta',
  ]);
  assert.deepEqual(sortWorktrees(worktrees, 'modified-desc').map((item) => item.path), [
    '/work/alpha', '/work/beta', '/work/zeta',
  ]);
  assert.deepEqual(sortWorktrees(worktrees, 'name-asc').map((item) => item.path), [
    '/work/alpha', '/work/beta', '/work/zeta',
  ]);
});

test('worktree search matches repository, branch, and path without changing the source', () => {
  assert.deepEqual(filterWorktrees(worktrees, 'PORTFOLIO').map((item) => item.path), ['/work/zeta']);
  assert.deepEqual(filterWorktrees(worktrees, 'claude').map((item) => item.path), ['/work/alpha']);
  assert.deepEqual(filterWorktrees(worktrees, 'beta').map((item) => item.path), ['/work/beta']);
  assert.equal(worktrees.length, 3);
});

test('disk sizes use compact binary units', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(5 * 1024 ** 3), '5.0 GB');
});

test('context menu remains inside large and undersized windows', () => {
  assert.deepEqual(contextMenuPosition(900, 700, 1000, 800), { left: 750, top: 580 });
  assert.deepEqual(contextMenuPosition(10, 10, 200, 180), { left: 0, top: 0 });
});

test('macOS scanner resource stays out of the cross-platform Tauri config', () => {
  const configDirectory = path.join(__dirname, '..', 'src-tauri');
  const baseConfig = JSON.parse(fs.readFileSync(path.join(configDirectory, 'tauri.conf.json')));
  const macConfig = JSON.parse(fs.readFileSync(path.join(configDirectory, 'tauri.macos.conf.json')));
  const scannerPath = '../scanner/target/aarch64-apple-darwin/release/akbun-macdiskviewer-scanner';

  assert.equal(baseConfig.bundle.resources, undefined);
  assert.equal(macConfig.bundle.resources[scannerPath], 'bin/akbun-macdiskviewer-scanner');
  assert.deepEqual(macConfig.bundle.targets, ['dmg']);
});

test('macOS release tests build the bundled scanner first', () => {
  const workspaceDirectory = path.join(__dirname, '..');
  const packageConfig = JSON.parse(fs.readFileSync(path.join(workspaceDirectory, 'package.json'), 'utf8'));
  const workflowPath = path.join(workspaceDirectory, '..', '..', '..', '.github', 'workflows',
    'release-akbun-macdiskviewer.yml');
  const workflow = fs.readFileSync(workflowPath, 'utf8');
  const verifyMac = workflow.slice(workflow.indexOf('\n  verify-macos:\n'), workflow.indexOf('\n  release:\n'));
  const release = workflow.slice(workflow.indexOf('\n  release:\n'));

  assert.equal(packageConfig.scripts['test:mac'], 'npm run build:scanner:mac && npm test');
  assert.match(verifyMac, /run: npm run test:mac/);
  assert.match(release, /run: npm run test:mac/);
});
