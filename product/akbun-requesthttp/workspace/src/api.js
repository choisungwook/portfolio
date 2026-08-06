'use strict';

// The only bridge between the page and the outside world. The same page runs
// in two shells and this file is where they differ:
//
// - Desktop (Tauri): requests go through the Rust command, so there is no
//   CORS and TLS verification can be turned off. State is a JSON file in the
//   app data directory. Self update comes from the updater plugin.
// - Web (Cloudflare Worker): requests go to the worker's /api/proxy endpoint,
//   which performs the fetch server side — the browser itself cannot call
//   arbitrary origins. TLS verification cannot be disabled there. State lives
//   in localStorage and updates are just a page reload.
//
// Both engines return the same response shape:
// { status, statusText, headers: [{key, value}], body, elapsedMs, sizeBytes }

if (window.__TAURI__) {
  const { invoke } = window.__TAURI__.core;
  const { message, ask } = window.__TAURI__.dialog;

  async function checkUpdate() {
    const { check } = window.__TAURI__.updater;
    const { relaunch } = window.__TAURI__.process;
    try {
      const update = await check();
      if (!update) {
        await message('You are on the latest version.', { title: 'akbun-requesthttp' });
        return;
      }
      const install = await ask(
        `Version ${update.version} is available. Download and install it now?`,
        { title: 'Update available', kind: 'info' }
      );
      if (!install) return;
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      await message(`Cannot check for updates.\n\n${error}`, {
        title: 'Update failed',
        kind: 'error',
      });
    }
  }

  window.api = {
    platform: 'desktop',
    canToggleSsl: true,
    send: (spec, settings) => invoke('send_request', { spec, settings }),
    loadState: () => invoke('load_state'),
    saveState: (state) => invoke('save_state', { state }),
    message: (text, opts) => message(text, opts),
    ask: (text, opts) => ask(text, opts),
    checkUpdate,
  };
} else {
  const STORAGE_KEY = 'akbun-requesthttp-state';

  async function send(spec, settings) {
    const response = await fetch('/api/proxy', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ spec, settings }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `proxy error ${response.status}`);
    return result;
  }

  window.api = {
    platform: 'web',
    canToggleSsl: false,
    send,
    loadState: async () => localStorage.getItem(STORAGE_KEY) || '',
    saveState: async (state) => localStorage.setItem(STORAGE_KEY, state),
    message: async (text) => alert(text),
    ask: async (text) => confirm(text),
    checkUpdate: async () => alert('The web build is always the deployed version.'),
  };
}
