'use strict';

// The Background tool's side panel: swatches, padding, corners, shadow, aspect
// ratio, alignment and saved presets. It owns the options and tells the editor
// when they change; the editor owns drawing. Exported behind one name.

(() => {
  const bgLib = globalThis.akbunBackground;
  let options = { ...bgLib.DEFAULTS };
  let presets = [];
  let notify = () => {};

  const $ = (id) => document.getElementById(id);

  function setOptions(next) {
    options = { ...options, ...next };
    render();
    notify();
  }

  function swatch(id, name, css) {
    const button = document.createElement('button');
    button.className = 'swatch';
    button.dataset.bg = id;
    button.title = name;
    button.setAttribute('aria-label', name);
    button.style.background = css;
    button.addEventListener('click', () => setOptions({ background: id }));
    return button;
  }

  function buildSwatches() {
    const grid = $('bg-swatches');
    grid.append(swatch('none', 'No background', 'transparent'));
    for (const bg of bgLib.BACKGROUNDS) grid.append(swatch(bg.id, bg.name, bgLib.cssBackground(bg)));
  }

  function buildAligns() {
    const grid = $('bg-align');
    for (const [name] of bgLib.ALIGNS) {
      const button = document.createElement('button');
      button.className = 'align';
      button.dataset.align = name;
      button.title = name;
      button.setAttribute('aria-label', `Align ${name}`);
      button.addEventListener('click', () => setOptions({ align: name }));
      grid.append(button);
    }
  }

  // Reflects the options into every control, so applying a preset and
  // clicking a swatch both leave the panel showing the truth.
  function render() {
    for (const button of document.querySelectorAll('#bg-swatches .swatch')) {
      button.classList.toggle('active', button.dataset.bg === options.background);
    }
    for (const button of document.querySelectorAll('#bg-align .align')) {
      button.classList.toggle('active', button.dataset.align === options.align);
    }
    $('bg-padding').value = options.padding;
    $('bg-radius').value = options.radius;
    $('bg-shadow').checked = options.shadow;
    $('bg-ratio').value = options.ratio;
    // Alignment only moves the image when a ratio leaves spare space.
    $('bg-align').classList.toggle('disabled', options.ratio === 'auto');
  }

  function renderPresets() {
    const select = $('bg-preset');
    select.replaceChildren(new Option('Presets…', ''));
    presets.forEach((preset, i) => select.append(new Option(preset.name, String(i))));
    $('bg-preset-delete').disabled = true;
  }

  // Read again right before a change, so a preset another editor window saved
  // meanwhile is kept rather than overwritten by this window's older list.
  async function latestPresets() {
    const settings = await window.api.getSettings();
    return settings.backgroundPresets || [];
  }

  // The command returns what was stored, and the list redraws from that.
  async function storePresets(next) {
    try {
      presets = await window.api.saveBackgroundPresets(next);
      renderPresets();
      return true;
    } catch (error) {
      $('bg-preset-status').textContent = String(error);
      return false;
    }
  }

  function wire() {
    $('bg-padding').addEventListener('input', (e) => setOptions({ padding: Number(e.target.value) }));
    $('bg-radius').addEventListener('input', (e) => setOptions({ radius: Number(e.target.value) }));
    $('bg-shadow').addEventListener('change', (e) => setOptions({ shadow: e.target.checked }));
    $('bg-ratio').addEventListener('change', (e) => setOptions({ ratio: e.target.value }));

    $('bg-preset').addEventListener('change', (e) => {
      const preset = presets[Number(e.target.value)];
      $('bg-preset-delete').disabled = !preset;
      if (!preset) return;
      const { name, ...saved } = preset;
      setOptions(saved);
      $('bg-preset-name').value = name;
    });

    $('bg-preset-save').addEventListener('click', async () => {
      const name = $('bg-preset-name').value.trim();
      if (!name) {
        $('bg-preset-status').textContent = 'Type a name first';
        return;
      }
      if (options.background === 'none') {
        $('bg-preset-status').textContent = 'Pick a background first';
        return;
      }
      // Saving under an existing name replaces that preset.
      const entry = { name, ...options };
      const next = (await latestPresets()).filter((preset) => preset.name !== name).concat(entry);
      if (await storePresets(next)) $('bg-preset-status').textContent = `Saved ${name}`;
    });

    $('bg-preset-delete').addEventListener('click', async () => {
      const index = Number($('bg-preset').value);
      const preset = presets[index];
      if (!preset) return;
      const next = (await latestPresets()).filter((other) => other.name !== preset.name);
      if (await storePresets(next)) {
        $('bg-preset-status').textContent = `Deleted ${preset.name}`;
      }
    });
  }

  function init({ onChange }) {
    notify = onChange;
    buildSwatches();
    buildAligns();
    wire();
    render();
    window.api.getSettings().then((settings) => {
      presets = settings.backgroundPresets || [];
      renderPresets();
    });
  }

  globalThis.akbunBackgroundPanel = { init, options: () => ({ ...options }) };
})();
