'use strict';

// The only bridge between the page and the operating system.
//
// withGlobalTauri puts the Tauri APIs on window.__TAURI__, so this file needs
// no bundler and the app keeps its no-build-step property. Nothing here opens
// a device or touches a file: those are commands in commands.rs, and what
// happens on this side is picking a path, asking a question, and subscribing
// to the two events the poller emits.
//
// Every mutating command answers with the whole state, and this file hands
// that to one change handler, so the page never merges a partial update into a
// copy of its own.

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;
const { save, open: openDialog, message, ask } = window.__TAURI__.dialog;

let onChange = () => {};

function changed(snapshot) {
  onChange(snapshot);
  return snapshot;
}

// A command that failed is shown and swallowed. Every failure here is an
// operating system refusing something at the moment it was asked: an interface
// unplugged mid take, a folder that is read only. The page stays usable and
// the next attempt can succeed.
async function guard(title, run) {
  try {
    return await run();
  } catch (error) {
    await message(String(error), { title, kind: 'error' });
    return null;
  }
}

async function checkUpdate() {
  const { check } = window.__TAURI__.updater;
  const { relaunch } = window.__TAURI__.process;
  try {
    const update = await check();
    if (!update) {
      await message('You are on the latest version.', { title: 'akbun-makepodcast' });
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
  onChange: (handler) => {
    onChange = handler;
  },

  // The poller emits these about thirty times a second while something is
  // running, and not at all when nothing is.
  onCapture: (handler) => listen('capture', (event) => handler(event.payload)),
  onPlayback: (handler) => listen('playback', (event) => handler(event.payload)),

  getState: () => invoke('get_state'),
  refreshDevices: async () => changed(await invoke('refresh_devices')),

  // The name is collected by the page rather than by a native prompt, because
  // a blocking dialog inside a command is a threading hazard.
  newProject: (name) =>
    guard('Cannot create the project', async () => changed(await invoke('new_project', { name }))),

  startRecording: () =>
    guard('Cannot start recording', async () => changed(await invoke('start_recording'))),
  stopRecording: () =>
    guard('Cannot stop recording', async () => changed(await invoke('stop_recording'))),
  startPlayback: () =>
    guard('Cannot play the take', async () => changed(await invoke('start_playback'))),
  stopPlayback: async () => changed(await invoke('stop_playback')),

  saveSettings: (settings) =>
    guard('Cannot save settings', async () => changed(await invoke('save_settings', { settings }))),

  openProjectDir: () => guard('Cannot open the folder', () => invoke('open_project_dir')),

  // The picker runs here and the command receives a path, so the command does
  // one job and never blocks on a dialog.
  saveWav: async (defaultName) => {
    const path = await save({
      title: 'Save WAV',
      defaultPath: defaultName,
      filters: [{ name: 'WAV', extensions: ['wav'] }],
    });
    if (!path) return null;
    return guard('Cannot save the wav', async () => changed(await invoke('save_wav', { path })));
  },

  pickFolder: async (current) => {
    const path = await openDialog({
      directory: true,
      defaultPath: current || undefined,
      title: 'Recordings folder',
    });
    return path || null;
  },

  confirm: (text, title) => ask(text, { title, kind: 'warning' }),

  close: () => window.__TAURI__.process.exit(0),

  checkUpdate,
};
