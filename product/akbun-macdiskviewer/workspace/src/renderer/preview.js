'use strict';

if (!window.diskViewer && new URLSearchParams(window.location.search).has('preview')) {
  const gib = 1024 ** 3;
  const now = Date.now();
  const rows = [
    { path: '/Users', parent_path: '/', name: 'Users', kind: 'directory', size_bytes: 284 * gib, logical_bytes: 291 * gib, modified_ms: now - 80_000, descendants: 428312 },
    { path: '/Applications', parent_path: '/', name: 'Applications', kind: 'directory', size_bytes: 74 * gib, logical_bytes: 75 * gib, modified_ms: now - 540_000, descendants: 28341 },
    { path: '/Library', parent_path: '/', name: 'Library', kind: 'directory', size_bytes: 36 * gib, logical_bytes: 38 * gib, modified_ms: now - 8_640_000, descendants: 94820 },
    { path: '/System', parent_path: '/', name: 'System', kind: 'directory', size_bytes: 22 * gib, logical_bytes: 24 * gib, modified_ms: now - 4_000_000, descendants: 173902 },
    { path: '/private', parent_path: '/', name: 'private', kind: 'directory', size_bytes: 14 * gib, logical_bytes: 15 * gib, modified_ms: now - 1_220_000, descendants: 68309 },
    { path: '/usr', parent_path: '/', name: 'usr', kind: 'directory', size_bytes: 11 * gib, logical_bytes: 12 * gib, modified_ms: now - 12_000_000, descendants: 38102 },
    { path: '/opt', parent_path: '/', name: 'opt', kind: 'directory', size_bytes: 8.4 * gib, logical_bytes: 8.6 * gib, modified_ms: now - 35_000_000, descendants: 18202 },
    { path: '/cores', parent_path: '/', name: 'cores', kind: 'directory', size_bytes: 0, logical_bytes: 0, modified_ms: now - 60_000_000, descendants: 0 },
  ];
  const worktrees = [
    { path: '/Users/akbun/git/portfolio', repository: 'portfolio', repositoryPath: '/Users/akbun/git/portfolio', branch: 'main', sizeBytes: 24.1 * gib, modifiedMs: now - 60_000, descendants: 62014 },
    { path: '/Users/akbun/.codex/worktrees/portfolio/agent-42', repository: 'portfolio', repositoryPath: '/Users/akbun/git/portfolio', branch: 'codex/worktree-storage', sizeBytes: 18.4 * gib, modifiedMs: now - 180_000, descendants: 48122 },
    { path: '/Users/akbun/.claude/worktrees/docs/review', repository: 'docs', repositoryPath: '/Users/akbun/git/docs', branch: 'claude/review', sizeBytes: 7.8 * gib, modifiedMs: now - 8_600_000, descendants: 18043 },
    { path: '/Users/akbun/.codex/worktrees/api/test', repository: 'api', repositoryPath: '/Users/akbun/git/api', branch: 'codex/test', sizeBytes: 3.2 * gib, modifiedMs: now - 86_000_000, descendants: 9241 },
  ];
  const listeners = [];
  window.diskViewer = {
    getState: async () => ({
      disk: { total: 994 * gib, used: 631 * gib, free: 363 * gib },
      scan: { status: 'idle', progress: null, error: null },
      catalog: {
        completedAt: String(now - 1_240_000),
        issues: '18',
        root: { descendants: 851204 },
      },
    }),
    query: async (query) => {
      const matching = rows.filter((row) => row.parent_path === query.path && row.name.toLowerCase().includes((query.search ?? '').toLowerCase()));
      const sorted = [...matching].sort((left, right) => {
        const leftValue = query.sort === 'modified' ? left.modified_ms : query.sort === 'name' ? left.name : left.size_bytes;
        const rightValue = query.sort === 'modified' ? right.modified_ms : query.sort === 'name' ? right.name : right.size_bytes;
        const compared = typeof leftValue === 'string' ? leftValue.localeCompare(rightValue) : leftValue - rightValue;
        return query.direction === 'asc' ? compared : -compared;
      });
      return { rows: sorted, count: sorted.length };
    },
    issues: async () => [],
    worktrees: async () => ({
      items: worktrees,
      count: worktrees.length,
      totalSizeBytes: worktrees.reduce((total, item) => total + item.sizeBytes, 0),
    }),
    terminals: async () => [
      { name: 'Ghostty', bundleId: 'com.mitchellh.ghostty', appPath: '/Applications/Ghostty.app' },
      { name: 'akbun-terminal', bundleId: 'io.akbun.terminal', appPath: '/Applications/akbun-terminal.app' },
    ],
    startScan: async () => true,
    pauseScan: async () => true,
    resumeScan: async () => true,
    cancelScan: async () => true,
    showInFinder: async () => {},
    openInTerminal: async () => {},
    openFullDiskAccess: async () => {},
    onScanState: (callback) => listeners.push(callback),
  };
}
