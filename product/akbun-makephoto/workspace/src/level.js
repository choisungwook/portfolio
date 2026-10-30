'use strict';

// Level mode: turn the photo until the horizon is level, by hand or with Auto
// Level, over a grid. Nothing is saved until OK; Cancel or Escape puts the
// saved angle back. The whole frame is shown, like in crop mode.

(function () {
  const mp = window.mp;
  const lib = globalThis.makephotoLib;
  const $ = (id) => document.getElementById(id);

  let saved = null; // the edit as it was when the mode opened
  const input = document.createElement('input');
  const out = document.createElement('output');

  function buildSlider() {
    const range = mp.state.fields.straighten || { min: -45, max: 45 };
    Object.assign(input, { type: 'range', min: range.min, max: range.max, step: 0.1 });
    const row = document.createElement('div');
    row.className = 'slider';
    row.title = 'Turn the photo until the horizon is level. Double-click the name for 0°';
    const label = document.createElement('label');
    label.textContent = 'Angle';
    label.ondblclick = () => set(0);
    row.append(label, input, out);
    $('level-slider').replaceChildren(row);
  }

  function show(angle) {
    input.value = angle;
    out.textContent = lib.formatValue('straighten', angle);
  }

  function set(angle) {
    show(angle);
    mp.editor.preview({ ...mp.editor.edit, straighten: angle });
  }

  /** Keep the grid exactly over the picture as it is drawn. */
  function layout() {
    const img = $('preview').getBoundingClientRect();
    const stage = $('stage').getBoundingClientRect();
    Object.assign($('level-grid').style, {
      left: `${img.left - stage.left}px`,
      top: `${img.top - stage.top}px`,
      width: `${img.width}px`,
      height: `${img.height}px`,
    });
  }

  function start() {
    if (!mp.state.current || mp.editor.leveling) return;
    if (mp.editor.cropping) mp.crop.cancel();
    if (!input.parentNode) buildSlider();
    saved = mp.editor.edit;
    show(saved.straighten);
    $('level-note').textContent = '';
    $('level-bar').hidden = false;
    $('level-grid').hidden = false;
    document.body.dataset.leveling = '';
    mp.editor.setLeveling(true);
    layout();
  }

  function stop() {
    $('level-bar').hidden = true;
    $('level-grid').hidden = true;
    delete document.body.dataset.leveling;
    mp.editor.setLeveling(false);
  }

  function cancel() {
    if (!mp.editor.leveling) return;
    stop();
    mp.editor.preview(saved);
  }

  async function ok() {
    if (!mp.editor.leveling) return;
    const next = mp.editor.edit;
    stop();
    await mp.editor.commit(next);
    mp.editor.refreshSwatches();
  }

  async function auto() {
    const id = mp.state.current;
    const before = mp.editor.edit;
    $('level-note').textContent = 'Looking for a straight line…';
    try {
      const outcome = await mp.api.auto(id, before, ['straighten']);
      if (!mp.editor.leveling || mp.state.current !== id) return;
      $('level-note').textContent = lib.describeAuto(['straighten'], before, outcome.edit).lines[0];
      set(outcome.edit.straighten);
    } catch (error) {
      $('level-note').textContent = '';
      mp.showError(error);
    }
  }

  input.addEventListener('input', () => set(Number(input.value)));
  $('level-auto').onclick = auto;
  $('level-ok').onclick = ok;
  $('level-cancel').onclick = cancel;
  window.addEventListener('resize', () => mp.editor.leveling && layout());

  mp.level = { start, ok, cancel, layout, get active() { return mp.editor.leveling; } };
})();
