'use strict';

if (!window.diskViewer && window.__TAURI__) {
  const { invoke } = window.__TAURI__.core;
  const { listen } = window.__TAURI__.event;
  window.diskViewer = {
    getState: () => invoke('app_state'),
    query: (query) => invoke('catalog_query', { query }),
    issues: () => invoke('catalog_issues'),
    worktrees: () => invoke('worktree_catalog'),
    terminals: () => invoke('terminals'),
    startScan: () => invoke('scan_start'),
    pauseScan: () => invoke('scan_pause'),
    resumeScan: () => invoke('scan_resume'),
    cancelScan: () => invoke('scan_cancel'),
    showInFinder: (targetPath) => invoke('show_in_finder', { targetPath }),
    openInTerminal: (appPath, targetPath, kind) => invoke('open_in_terminal', { appPath, targetPath, kind }),
    openFullDiskAccess: () => invoke('open_full_disk_access'),
    onScanState: (callback) => listen('scan-state', (event) => callback(event.payload)),
  };
}
