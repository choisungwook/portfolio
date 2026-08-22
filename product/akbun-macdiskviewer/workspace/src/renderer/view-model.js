'use strict';

(function expose(root) {
  function formatBytes(bytes) {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const index = Math.min(Math.floor(Math.log(Number(bytes)) / Math.log(1024)), units.length - 1);
    return `${(Number(bytes) / (1024 ** index)).toFixed(index < 2 ? 0 : 1)} ${units[index]}`;
  }

  function filterWorktrees(items, search) {
    const needle = search.trim().toLowerCase();
    if (!needle) return [...items];
    return items.filter((item) => [item.repository, item.branch, item.path]
      .some((value) => value.toLowerCase().includes(needle)));
  }

  function sortWorktrees(items, sort) {
    const sorted = [...items];
    sorted.sort((left, right) => {
      if (sort === 'modified-desc') return right.modifiedMs - left.modifiedMs || left.path.localeCompare(right.path);
      if (sort === 'name-asc') return left.path.localeCompare(right.path);
      return right.sizeBytes - left.sizeBytes || left.path.localeCompare(right.path);
    });
    return sorted;
  }

  const model = { filterWorktrees, formatBytes, sortWorktrees };
  root.diskViewModel = model;
  if (typeof module !== 'undefined') module.exports = model;
}(typeof window === 'undefined' ? globalThis : window));
