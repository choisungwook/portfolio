'use strict';

// The only bridge between the page and the backend.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs
// no bundler and the app keeps its no-build-step property. Every AWS call is
// a command in commands.rs; the page never talks to the network itself.

// Loaded first, hooks registered before anything that can fail: an uncaught
// error anywhere on the page — including a parse error in a later script —
// lands in the log file under app_log_dir. v0.1.0 shipped a page that died
// before wiring a single listener and left no evidence anywhere; this is the
// evidence.
function reportError(message) {
  try {
    window.__TAURI__?.log?.error(String(message));
  } catch (_) {
    // Logging must never take the page down with it.
  }
}
window.addEventListener('error', (event) => {
  reportError(`${event.message} (${event.filename}:${event.lineno})`);
});
window.addEventListener('unhandledrejection', (event) => {
  reportError(`unhandled rejection: ${event.reason?.message || event.reason}`);
});

const { invoke } = window.__TAURI__.core;

async function checkUpdate() {
  try {
    const { message, ask } = window.__TAURI__.dialog;
    const { check } = window.__TAURI__.updater;
    const { relaunch } = window.__TAURI__.process;
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'akbun-awsviewer' });
      return;
    }
    const install = await ask(
      `Version ${update.version} is available. Download and install it now?`,
      { title: 'Update available', kind: 'info' },
    );
    if (!install) return;
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    const detail = error?.message || String(error);
    reportError(`update check: ${detail}`);
    // Optional chained: when the dialog plugin itself is what is missing,
    // the log line above is the only reporting channel left.
    await window.__TAURI__?.dialog?.message?.(`Cannot check for updates.\n\n${detail}`, {
      title: 'Update failed',
      kind: 'error',
    });
  }
}

globalThis.awsviewerApi = {
  getSnapshot: () => invoke('get_snapshot'),
  selectProfile: (name) => invoke('select_profile', { name }),
  setInsecureTls: (enabled) => invoke('set_insecure_tls', { enabled }),
  listInstances: () => invoke('list_instances'),
  instanceDetail: (instanceId) => invoke('instance_detail', { instanceId }),
  listCloudTrailEvents: (eventName) => invoke('list_cloudtrail_events', { eventName }),
  openLogDir: () => invoke('open_log_dir'),
  checkUpdate,
};
