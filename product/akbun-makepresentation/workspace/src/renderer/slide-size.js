'use strict';

let slideSizeUnit = 'px';

function slideSizeValue(value, unit) {
  if (unit === 'cm') return String(L.pixelsToCentimeters(value));
  return String(Math.round(value * 100) / 100);
}

function setSlideSizeFields(size, unit) {
  $('slide-size-width').value = slideSizeValue(size.width, unit);
  $('slide-size-height').value = slideSizeValue(size.height, unit);
  syncSlideRatioButtons(size);
}

function slideSizeFromFields(unit = slideSizeUnit) {
  const width = Number($('slide-size-width').value);
  const height = Number($('slide-size-height').value);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return unit === 'cm'
    ? {
        width: L.centimetersToPixels(width),
        height: L.centimetersToPixels(height),
      }
    : { width, height };
}

function syncSlideRatioButtons(size) {
  const ratio = size && size.height ? size.width / size.height : 0;
  for (const button of slideSizeDialog.querySelectorAll('[data-slide-ratio]')) {
    const preset = L.slideSizePreset(button.dataset.slideRatio);
    const selected = preset && Math.abs(ratio - preset.width / preset.height) < 0.0001;
    button.setAttribute('aria-pressed', String(!!selected));
  }
}

function setSlideSizeUnit(unit, size) {
  slideSizeUnit = unit;
  $('slide-size-unit').value = unit;
  for (const input of [$('slide-size-width'), $('slide-size-height')]) {
    input.min = unit === 'cm' ? '1.693' : '64';
    input.max = unit === 'cm' ? '264.583' : '10000';
    input.step = unit === 'cm' ? '0.001' : '0.01';
  }
  setSlideSizeFields(size, unit);
}

function openSlideSizeDialog() {
  hideMenus();
  hidePresetMenu();
  $('slide-size-status').textContent = '';
  setSlideSizeUnit(slideSizeUnit, deckSize());
  slideSizeDialog.showModal();
  slideSizeDialog.querySelector('[data-slide-ratio][aria-pressed="true"]')?.focus();
}

slideSizeDialog.querySelector('.ratio-options').addEventListener('click', (event) => {
  const button = event.target.closest('[data-slide-ratio]');
  if (!button) return;
  const preset = L.slideSizePreset(button.dataset.slideRatio);
  if (preset) setSlideSizeFields(preset, slideSizeUnit);
});

$('slide-size-unit').addEventListener('change', (event) => {
  const size = slideSizeFromFields(slideSizeUnit) || deckSize();
  setSlideSizeUnit(event.target.value, size);
});

for (const input of [$('slide-size-width'), $('slide-size-height')]) {
  input.addEventListener('input', () => syncSlideRatioButtons(slideSizeFromFields()));
}

$('btn-slide-size-cancel').addEventListener('click', () => slideSizeDialog.close('cancel'));
$('slide-size-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const size = slideSizeFromFields();
  const before = deckSize();
  if (!size || !L.setSlideSize(state.deck, size.width, size.height)) {
    $('slide-size-status').textContent = slideSizeUnit === 'cm'
      ? 'Enter width and height from 1.693 to 264.583 cm.'
      : 'Enter width and height from 64 to 10,000 px.';
    return;
  }
  if (before.width !== state.deck.slideWidth || before.height !== state.deck.slideHeight) {
    markDirty();
    renderAll();
  }
  slideSizeDialog.close('apply');
  canvas.focus({ preventScroll: true });
});
