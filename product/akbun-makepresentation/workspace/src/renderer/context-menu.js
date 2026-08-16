'use strict';

function hideContextMenu() {
  contextMenu.hidden = true;
  slideContextMenu.hidden = true;
}

function rememberFontFamily(family) {
  if (!fontFamilies.includes(family)) {
    fontFamilies.push(family);
    fontFamilies.sort((left, right) => left.localeCompare(right));
  }
}

function renderFontOptions() {
  const selected = selectedShape()?.fontFamily || state.defaults.fontFamily;
  const matching = L.filterFonts(fontFamilies, fontSearch.value);
  fontOptions.textContent = '';
  const fragment = document.createDocumentFragment();
  for (const family of matching) {
    const option = document.createElement('button');
    option.type = 'button';
    option.dataset.font = family;
    option.textContent = family;
    option.style.fontFamily = `"${family}", sans-serif`;
    option.classList.toggle('active', family === selected);
    option.setAttribute('role', 'option');
    option.setAttribute('aria-selected', String(family === selected));
    fragment.append(option);
  }
  if (!matching.length) {
    const empty = document.createElement('p');
    empty.className = 'font-empty';
    empty.textContent = 'No fonts found';
    fragment.append(empty);
  }
  fontOptions.append(fragment);
}

function positionFontMenu() {
  const trigger = $('prop-font-family').getBoundingClientRect();
  const bounds = fontMenu.getBoundingClientRect();
  const left = Math.max(
    4,
    Math.min(trigger.right - bounds.width, window.innerWidth - bounds.width - 4)
  );
  const below = trigger.bottom + 4;
  const top = below + bounds.height <= window.innerHeight
    ? below
    : Math.max(4, trigger.top - bounds.height - 4);
  fontMenu.style.left = `${left}px`;
  fontMenu.style.top = `${top}px`;
}

function showFontMenu() {
  fontMenu.hidden = false;
  $('prop-font-family').setAttribute('aria-expanded', 'true');
  fontSearch.value = '';
  renderFontOptions();
  positionFontMenu();
  fontSearch.focus();
}

function hideFontMenu() {
  fontMenu.hidden = true;
  $('prop-font-family').setAttribute('aria-expanded', 'false');
}

async function loadSystemFonts() {
  try {
    const installed = await window.api.listSystemFonts();
    fontFamilies = [...new Set([S.DEFAULT_FONT_FAMILY, ...installed.filter(
      (font) => typeof font === 'string' && font.trim()
    )])].sort((left, right) => left.localeCompare(right));
    rememberFontFamily(state.defaults.fontFamily);
    renderProps();
  } catch (error) {
    console.error('Cannot load system fonts', error);
  }
}

function showContextMenu(x, y) {
  // Group needs more than one object; ungroup needs one that is in a group.
  // Hiding rather than disabling keeps the menu as short as the moment allows.
  $('context-group').hidden = state.selection.length < 2;
  $('context-ungroup').hidden = !state.selection.some(
    (index) => slide().shapes[index]?.groupId
  );
  const shapes = selectedShapes();
  $('context-save-preset').hidden = shapes.length !== 1 || shapes[0].kind === 'image';
  contextMenu.hidden = false;
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
  const bounds = contextMenu.getBoundingClientRect();
  contextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  contextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  contextMenu.querySelector('button:not([hidden])')?.focus();
}

function showSlideContextMenu(x, y) {
  slideContextMenu.hidden = false;
  slideContextMenu.style.left = `${x}px`;
  slideContextMenu.style.top = `${y}px`;
  const bounds = slideContextMenu.getBoundingClientRect();
  slideContextMenu.style.left = `${Math.max(4, Math.min(x, window.innerWidth - bounds.width - 4))}px`;
  slideContextMenu.style.top = `${Math.max(4, Math.min(y, window.innerHeight - bounds.height - 4))}px`;
  $('context-new-slide').focus();
}

function contextMenuPoint(event, group) {
  if (event.clientX || event.clientY) {
    return { x: event.clientX, y: event.clientY };
  }
  const bounds = group.getBoundingClientRect();
  return {
    x: bounds.left + Math.min(16, bounds.width / 2),
    y: bounds.top + Math.min(16, bounds.height / 2),
  };
}

document.addEventListener('contextmenu', (event) => {
  event.preventDefault();
  hideContextMenu();
  if (state.presenting || !(event.target instanceof Element)) return;
  const group = event.target.closest('#canvas [data-i]');
  if (!group) {
    const slidePanel = event.target.closest('#slides');
    const isEmptyArea = slidePanel && !event.target.closest('[data-slide], button');
    if (isEmptyArea) showSlideContextMenu(event.clientX, event.clientY);
    return;
  }
  const point = contextMenuPoint(event, group);
  const index = Number(group.dataset.i);
  if (!state.selection.includes(index)) {
    selectOnly(index);
    renderCanvas();
    renderProps();
  }
  showContextMenu(point.x, point.y);
});

document.addEventListener('pointerdown', (event) => {
  if (!contextMenu.contains(event.target) && !slideContextMenu.contains(event.target)) {
    hideContextMenu();
  }
  if (!presetMenu.contains(event.target) && !$('btn-preset').contains(event.target)) hidePresetMenu();
  if (!backgroundMenu.contains(event.target) && !$('btn-background').contains(event.target)) {
    hideBackgroundMenu();
  }
  if (!codeBlockMenu.contains(event.target) && !$('btn-code-block').contains(event.target)) {
    hideCodeBlockMenu();
  }
  if (!fontPicker.contains(event.target)) hideFontMenu();
  if (!$('menubar').contains(event.target)) hideMenus();
});
window.addEventListener('blur', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
  hideFontMenu();
  hideMenus();
});
window.addEventListener('resize', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
  hideFontMenu();
  hideMenus();
});
$('stage-scroll').addEventListener('scroll', () => {
  hideContextMenu();
  hidePresetMenu();
  hideToolbarPopovers();
  hideFontMenu();
  hideMenus();
});
$('props').addEventListener('scroll', hideFontMenu);

function rasterizeShapes(shapes) {
  return new Promise((resolve, reject) => {
    const imageSvg = L.renderShapesSvg(shapes);
    if (!imageSvg) {
      reject(new Error('no shape selected'));
      return;
    }
    const url = URL.createObjectURL(new Blob([imageSvg.svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      try {
        const scale = Math.max(
          0.01,
          Math.min(2, 4096 / imageSvg.width, 4096 / imageSvg.height)
        );
        const raster = document.createElement('canvas');
        raster.width = Math.max(1, Math.ceil(imageSvg.width * scale));
        raster.height = Math.max(1, Math.ceil(imageSvg.height * scale));
        const context = raster.getContext('2d');
        if (!context) throw new Error('cannot create image canvas');
        context.drawImage(image, 0, 0, raster.width, raster.height);
        resolve(raster.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot render selected shape'));
    };
    image.src = url;
  });
}

function suggestShapeImageName() {
  if (!state.filePath) return `slide-${state.current + 1}-shape.png`;
  const file = state.filePath.split('/').pop().split('\\').pop();
  const deckName = file.replace(/\.pptx$/i, '');
  return `${deckName}-slide-${state.current + 1}-shape.png`;
}

async function saveSelectionAsImage() {
  hideContextMenu();
  const shapes = selectedShapes().map((shape) => structuredClone(shape));
  if (shapes.length === 0) return;
  const path = await window.api.pickSave(suggestShapeImageName(), 'png');
  if (!path) return;
  try {
    const dataUrl = await rasterizeShapes(shapes);
    await window.api.savePng(path, dataUrl);
    await window.api.message('Image saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Image export failed', kind: 'error' });
  }
}

async function saveSelectionAsPreset() {
  hideContextMenu();
  const id = globalThis.crypto?.randomUUID?.() || `preset-${Date.now()}`;
  const preset = L.customPresetFromSelection(selectedShapes(), customPresets, id);
  if (!preset) return;
  if (JSON.stringify(preset).length > 500_000) {
    await window.api.message('This shape is too large to save as a preset.', {
      title: 'Preset save failed',
      kind: 'error',
    });
    return;
  }
  try {
    await persistCustomPresets([...customPresets, preset]);
  } catch (_) {
    await window.api.message('Could not save the preset on this device.', {
      title: 'Preset save failed',
      kind: 'error',
    });
  }
}

$('context-save-image').addEventListener('click', saveSelectionAsImage);
$('context-save-preset').addEventListener('click', saveSelectionAsPreset);
$('context-group').addEventListener('click', () => {
  hideContextMenu();
  groupSelection();
});
$('context-ungroup').addEventListener('click', () => {
  hideContextMenu();
  ungroupSelection();
});
$('context-new-slide').addEventListener('click', () => {
  hideContextMenu();
  addSlideAtEnd();
});

$('prop-font-family').addEventListener('click', () => {
  if (fontMenu.hidden) showFontMenu();
  else hideFontMenu();
});
fontSearch.addEventListener('input', renderFontOptions);
fontSearch.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    hideFontMenu();
    $('prop-font-family').focus();
  } else if (event.key === 'Enter') {
    fontOptions.querySelector('[data-font]')?.click();
  } else if (event.key === 'ArrowDown') {
    fontOptions.querySelector('[data-font]')?.focus();
  }
});
fontOptions.addEventListener('click', (event) => {
  const option = event.target.closest('[data-font]');
  if (!option) return;
  applyProp({ fontFamily: option.dataset.font });
  hideFontMenu();
  $('prop-font-family').focus();
});

// --- property panel -------------------------------------------------------------------
