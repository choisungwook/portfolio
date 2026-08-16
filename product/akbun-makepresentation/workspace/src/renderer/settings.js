'use strict';

function setSettingsPage(name) {
  for (const button of settingsDialog.querySelectorAll('[data-settings-page]')) {
    button.classList.toggle('active', button.dataset.settingsPage === name);
  }
  for (const panel of settingsDialog.querySelectorAll('[data-settings-panel]')) {
    panel.hidden = panel.dataset.settingsPanel !== name;
  }
}

function renderSettingsPresets() {
  const container = $('settings-presets');
  container.textContent = '';
  if (!settingsPresetDraft.length) {
    const empty = document.createElement('p');
    empty.textContent = 'No custom presets saved.';
    container.append(empty);
    return;
  }
  for (const preset of settingsPresetDraft) {
    const row = document.createElement('div');
    row.className = 'settings-preset-row';
    const preview = L.renderShapesSvg(preset.shapes);
    if (preview) row.insertAdjacentHTML('beforeend', preview.svg);
    const name = document.createElement('span');
    name.textContent = preset.name;
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.removePreset = preset.id;
    remove.textContent = 'Delete';
    row.append(name, remove);
    container.append(row);
  }
}

function setBorderSettingsFields(prefix, border) {
  $(`settings-${prefix}-border-color`).value = border.color;
  $(`settings-${prefix}-border-width`).value = String(border.width);
  $(`settings-${prefix}-border-dash`).value = border.dash;
}

function renderGeneralSettings() {
  const defaults = appSettings.editorDefaults;
  const select = $('settings-default-font');
  const families = [...new Set([defaults.fontFamily, S.DEFAULT_FONT_FAMILY, ...fontFamilies])];
  select.textContent = '';
  for (const family of families) {
    const option = document.createElement('option');
    option.value = family;
    option.textContent = family;
    option.style.fontFamily = `"${family}", sans-serif`;
    select.append(option);
  }
  select.value = defaults.fontFamily;
  $('settings-snapping').checked = appSettings.snapping.enabled;
  setBorderSettingsFields('shape', defaults.shapeBorder);
  setBorderSettingsFields('image', defaults.imageBorder);
  $('general-settings-status').textContent = '';
}

function borderSettingsFromFields(prefix) {
  const width = Number($(`settings-${prefix}-border-width`).value);
  if (!Number.isFinite(width) || width < 1 || width > 30) return null;
  return {
    color: $(`settings-${prefix}-border-color`).value,
    width,
    dash: $(`settings-${prefix}-border-dash`).value,
  };
}

function editorDefaultsFromFields() {
  const shapeBorder = borderSettingsFromFields('shape');
  const imageBorder = borderSettingsFromFields('image');
  if (!shapeBorder || !imageBorder) return null;
  return {
    fontFamily: $('settings-default-font').value,
    shapeBorder,
    imageBorder,
  };
}

function openSettings() {
  hideMenus();
  hidePresetMenu();
  settingsPresetDraft = structuredClone(customPresets);
  $('preset-settings-status').textContent = '';
  setSettingsPage('general');
  renderGeneralSettings();
  renderSettingsPresets();
  settingsDialog.showModal();
  settingsDialog.querySelector('[data-settings-page="general"]')?.focus();
  void AiPanel.refreshStatus();
}

settingsDialog.querySelector('nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-settings-page]');
  if (button) {
    setSettingsPage(button.dataset.settingsPage);
    if (button.dataset.settingsPage === 'ai') void AiPanel.refreshStatus();
  }
});

$('settings-presets').addEventListener('click', (event) => {
  const button = event.target.closest('[data-remove-preset]');
  if (!button) return;
  settingsPresetDraft = settingsPresetDraft.filter(
    (preset) => preset.id !== button.dataset.removePreset
  );
  renderSettingsPresets();
});

$('btn-settings-cancel').addEventListener('click', () => settingsDialog.close('cancel'));
$('btn-settings-ok').addEventListener('click', async () => {
  const editorDefaults = editorDefaultsFromFields();
  if (!editorDefaults) {
    $('general-settings-status').textContent = 'Border width must be from 1 to 30.';
    setSettingsPage('general');
    return;
  }
  try {
    await persistAppSettings({
      ...appSettings,
      snapping: { enabled: $('settings-snapping').checked },
      editorDefaults,
      customPresets: settingsPresetDraft,
    });
    customPresets = structuredClone(appSettings.customPresets);
    renderPresetMenu();
    renderProps();
    settingsDialog.close('ok');
  } catch (_) {
    $('general-settings-status').textContent = 'Could not save settings on this device.';
    setSettingsPage('general');
  }
});
settingsDialog.addEventListener('cancel', () => {
  settingsPresetDraft = [];
});
