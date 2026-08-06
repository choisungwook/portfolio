'use strict';

// The only bridge between the page and the backend.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs
// no bundler and the app keeps its no-build-step property. Every AWS call is
// a command in commands.rs; the page never talks to the network itself.

const { invoke } = window.__TAURI__.core;

async function checkUpdate(onStatus) {
  const { check } = window.__TAURI__.updater;
  const { relaunch } = window.__TAURI__.process;
  onStatus('Checking…');
  const update = await check();
  if (!update) {
    onStatus('You are on the latest version.');
    return;
  }
  onStatus(`Downloading ${update.version}…`);
  await update.downloadAndInstall();
  onStatus('Restarting…');
  await relaunch();
}

globalThis.awsviewerApi = {
  getSnapshot: () => invoke('get_snapshot'),
  selectProfile: (name) => invoke('select_profile', { name }),
  setInsecureTls: (enabled) => invoke('set_insecure_tls', { enabled }),
  ssoLogin: () => invoke('sso_login'),
  listInstances: () => invoke('list_instances'),
  instanceDetail: (instanceId) => invoke('instance_detail', { instanceId }),
  checkUpdate,
};
