'use strict';

function deleteSelectedShape() {
  if (state.selection.length === 0) return;
  const descending = [...state.selection].sort((a, b) => b - a);
  for (const index of descending) slide().shapes.splice(index, 1);
  clearSelection();
  markDirty();
  renderAll();
}

// --- copy, paste, duplicate ----------------------------------------------------

const PASTE_OFFSET = 20;
const SHAPE_CLIPBOARD_TYPE = 'application/x-akbun-makepresentation-shapes';

function insertShapes(shapes, offset) {
  const copies = L.cloneShapes(shapes);
  if (offset) {
    for (const copy of copies) L.moveShape(copy, offset, offset);
  }
  const first = slide().shapes.length;
  slide().shapes.push(...copies);
  selectMany(copies.map((_, index) => first + index));
  markDirty();
  renderAll();
  return copies;
}

const PRESET_STORAGE_KEY = 'akbun-makepresentation.custom-presets';
const DEFAULT_PRESET_LABELS = {
  'red-filled-rectangle': 'Filled rectangle',
  'red-outline-rectangle': 'Outline rectangle',
  'numbered-circle': 'Numbered circle',
  'right-open-arrow': 'Right open arrow',
  'left-open-arrow': 'Left open arrow',
};

function shapeBounds(shapes) {
  const boxes = shapes.map(L.shapeBBox);
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

// A preset lands in the top right corner rather than in the middle. The
// middle is where the slide's own content already is, so a preset dropped
// there had to be dragged off the content before it could be placed at all.
// The margins are the ones the content guideline uses.
const PRESET_MARGIN_X = 48;
const PRESET_MARGIN_Y = 36;

function cornerPresetShapes(shapes) {
  const copies = L.cloneShapes(shapes);
  const bounds = shapeBounds(copies);
  const dx = deckSize().width - PRESET_MARGIN_X - bounds.w - bounds.x;
  const dy = PRESET_MARGIN_Y - bounds.y;
  for (const shape of copies) L.moveShape(shape, dx, dy);
  return copies;
}

function readLegacyCustomPresets() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) || '[]');
    return S.normalizeCustomPresets(parsed);
  } catch (_) {
    return [];
  }
}

async function loadPersistentSettings() {
  const stored = await window.api.loadSettings();
  const hasSettingsFile = !!stored && typeof stored === 'object';
  const legacyPresets = hasSettingsFile ? [] : readLegacyCustomPresets();
  appSettings = S.normalizeAppSettings(
    hasSettingsFile ? stored : { customPresets: legacyPresets }
  );
  syncConfiguredDefaults();
  customPresets = structuredClone(appSettings.customPresets);
  state.showGuidelines = appSettings.guidelines.visible;
  if (!hasSettingsFile || !S.settingsEqual(stored, appSettings)) {
    await window.api.saveSettings(appSettings);
  }
  if (!hasSettingsFile && legacyPresets.length) {
    localStorage.removeItem(PRESET_STORAGE_KEY);
  }
}

async function persistAppSettings(settings) {
  const normalized = S.normalizeAppSettings(settings);
  await window.api.saveSettings(normalized);
  appSettings = normalized;
  syncConfiguredDefaults();
}

function presetButton(preset, source) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'preset-item';
  button.dataset.presetSource = source;
  button.dataset.presetId = preset.id;
  button.setAttribute('role', 'menuitem');
  button.title = preset.name;
  const preview = L.renderShapesSvg(preset.shapes);
  if (preview) button.insertAdjacentHTML('beforeend', preview.svg);
  const label = document.createElement('span');
  label.textContent = preset.name;
  button.append(label);
  return button;
}

function defaultPresets() {
  return L.DEFAULT_PRESET_IDS.map((id) => ({
    id,
    name: DEFAULT_PRESET_LABELS[id],
    shapes: L.defaultPresetShapes(id),
  }));
}

function renderPresetGrid(container, presets, source) {
  container.textContent = '';
  for (const preset of presets) container.append(presetButton(preset, source));
}

function renderPresetMenu() {
  renderPresetGrid($('default-presets'), defaultPresets(), 'default');
  renderPresetGrid($('custom-presets'), customPresets, 'custom');
  $('custom-presets-section').hidden = customPresets.length === 0;
}

async function persistCustomPresets(presets) {
  await persistAppSettings({ ...appSettings, customPresets: presets });
  customPresets = structuredClone(appSettings.customPresets);
  renderPresetMenu();
}

function positionPresetMenu() {
  const trigger = $('btn-preset').getBoundingClientRect();
  const bounds = presetMenu.getBoundingClientRect();
  presetMenu.style.left = `${Math.max(8, Math.min(
    trigger.left,
    window.innerWidth - bounds.width - 8
  ))}px`;
  const below = trigger.bottom + 6;
  presetMenu.style.top = `${below + bounds.height <= window.innerHeight
    ? below
    : Math.max(8, trigger.top - bounds.height - 6)}px`;
}

function showPresetMenu() {
  hideToolbarPopovers();
  renderPresetMenu();
  presetMenu.hidden = false;
  $('btn-preset').setAttribute('aria-expanded', 'true');
  positionPresetMenu();
  presetMenu.querySelector('.preset-item')?.focus();
}

function hidePresetMenu() {
  presetMenu.hidden = true;
  $('btn-preset').setAttribute('aria-expanded', 'false');
}

$('btn-preset').addEventListener('click', () => {
  if (presetMenu.hidden) showPresetMenu();
  else hidePresetMenu();
});

presetMenu.addEventListener('click', (event) => {
  const button = event.target.closest('[data-preset-id]');
  if (!button) return;
  const preset = button.dataset.presetSource === 'default'
    ? defaultPresets().find((candidate) => candidate.id === button.dataset.presetId)
    : customPresets.find((candidate) => candidate.id === button.dataset.presetId);
  if (!preset) return;
  insertShapes(cornerPresetShapes(preset.shapes), 0);
  hidePresetMenu();
  canvas.focus({ preventScroll: true });
});
