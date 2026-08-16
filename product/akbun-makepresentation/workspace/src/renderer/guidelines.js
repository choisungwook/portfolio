'use strict';

let guidelineUnit = 'px';

function guidelineValue(value, unit) {
  if (unit === 'cm') return String(L.pixelsToCentimeters(value));
  return String(Math.round(value * 100) / 100);
}

function setGuidelineFields(guidelines, unit) {
  for (const side of ['top', 'bottom', 'left', 'right']) {
    $(`guidelines-${side}`).value = guidelineValue(guidelines[side], unit);
  }
}

function guidelinesFromFields(unit = guidelineUnit) {
  const values = {};
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const value = Number($(`guidelines-${side}`).value);
    if (!Number.isFinite(value) || value < 0) return null;
    values[side] = unit === 'cm' ? L.centimetersToPixels(value) : value;
  }
  return values;
}

function setGuidelineUnit(unit, guidelines) {
  guidelineUnit = unit;
  $('guidelines-unit').value = unit;
  for (const side of ['top', 'bottom', 'left', 'right']) {
    const input = $(`guidelines-${side}`);
    input.max = unit === 'cm' ? '264.583' : '10000';
    input.step = unit === 'cm' ? '0.001' : '0.01';
  }
  setGuidelineFields(guidelines, unit);
}

function openGuidelinesDialog() {
  hideMenus();
  hidePresetMenu();
  hideToolbarPopovers();
  const guidelines = appSettings.guidelines;
  $('guidelines-status').textContent = '';
  $('guidelines-visible').checked = guidelines.visible;
  setGuidelineUnit(guidelines.unit, guidelines);
  guidelinesDialog.showModal();
  $('guidelines-visible').focus();
}

$('guidelines-unit').addEventListener('change', (event) => {
  const guidelines = guidelinesFromFields(guidelineUnit) || appSettings.guidelines;
  setGuidelineUnit(event.target.value, guidelines);
});

$('btn-guidelines-cancel').addEventListener('click', () => guidelinesDialog.close('cancel'));
$('guidelines-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const margins = guidelinesFromFields();
  const { width, height } = deckSize();
  if (!margins || !S.guidelineMarginsFit(width, height, margins)) {
    $('guidelines-status').textContent = 'Margins must leave space inside the slide.';
    return;
  }
  const guidelines = {
    visible: $('guidelines-visible').checked,
    unit: guidelineUnit,
    ...margins,
  };
  try {
    await persistAppSettings({ ...appSettings, guidelines });
    state.showGuidelines = appSettings.guidelines.visible;
    renderCanvas();
    guidelinesDialog.close('apply');
    canvas.focus({ preventScroll: true });
  } catch (_) {
    $('guidelines-status').textContent = 'Could not save guidelines on this device.';
  }
});
