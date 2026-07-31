'use strict';

const shortcutInput = document.getElementById('shortcut');
const saveDirInput = document.getElementById('save-dir');
const status = document.getElementById('status');

window.api.getSettings().then((settings) => {
  shortcutInput.value = settings.shortcut;
  saveDirInput.value = settings.saveDir;
});

document.getElementById('choose-dir').addEventListener('click', async () => {
  const dir = await window.api.chooseDir();
  if (dir) saveDirInput.value = dir;
});

document.getElementById('save').addEventListener('click', async () => {
  const result = await window.api.saveSettings({
    shortcut: shortcutInput.value.trim(),
    saveDir: saveDirInput.value.trim(),
  });
  status.textContent = result.ok ? 'Saved' : result.error;
});
