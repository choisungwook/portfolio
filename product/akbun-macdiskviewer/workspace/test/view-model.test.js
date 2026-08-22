'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { filterWorktrees, formatBytes, sortWorktrees } = require('../src/renderer/view-model');

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
