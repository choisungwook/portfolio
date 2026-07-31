'use strict';

/* global fillFontSelect, wireFontSelect */

const shortcutInput = document.getElementById('shortcut');
const saveDirInput = document.getElementById('save-dir');
const fontSelect = document.getElementById('font');
const status = document.getElementById('status');

window.api.getSettings().then((settings) => {
  shortcutInput.value = settings.shortcut;
  saveDirInput.value = settings.saveDir;
  fillFontSelect(fontSelect, [settings.defaultFont], settings.defaultFont);
  wireFontSelect(fontSelect, () => fontSelect.value || settings.defaultFont);
});

document.getElementById('choose-dir').addEventListener('click', async () => {
  const dir = await window.api.chooseDir();
  if (dir) saveDirInput.value = dir;
});

document.getElementById('save').addEventListener('click', async () => {
  const result = await window.api.saveSettings({
    shortcut: shortcutInput.value.trim(),
    saveDir: saveDirInput.value.trim(),
    defaultFont: fontSelect.value,
  });
  status.textContent = result.ok ? 'Saved' : result.error;
});

// tabs
const tabs = [
  { tab: document.getElementById('tab-general'), pane: document.getElementById('pane-general') },
  { tab: document.getElementById('tab-permissions'), pane: document.getElementById('pane-permissions') },
];

for (const { tab, pane } of tabs) {
  tab.addEventListener('click', () => {
    for (const t of tabs) {
      t.tab.classList.remove('active');
      t.pane.classList.remove('active');
    }
    tab.classList.add('active');
    pane.classList.add('active');
  });
}

// permissions pane
const badge = document.getElementById('screen-badge');
const guide = document.getElementById('screen-guide');
const openButton = document.getElementById('open-screen-settings');
const okNote = document.getElementById('screen-ok-note');

async function refreshPermissions() {
  const { screen } = await window.api.getPermissions();
  const granted = screen === 'granted';
  badge.textContent = granted ? 'granted' : screen;
  badge.classList.toggle('granted', granted);
  badge.classList.toggle('missing', !granted);
  guide.hidden = granted;
  openButton.hidden = granted;
  okNote.hidden = !granted;
}

document.getElementById('open-screen-settings').addEventListener('click', () => {
  window.api.openScreenPermissionSettings();
});

// re-check when the user comes back from System Settings
window.addEventListener('focus', refreshPermissions);
refreshPermissions();
