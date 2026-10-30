'use strict';

// Edit mode: the preview, the sliders, auto, film looks, undo and the
// filmstrip. Slider drags render previews without saving; letting go saves
// one undoable step.

(function () {
  const mp = window.mp;
  const lib = globalThis.makephotoLib;
  const $ = (id) => document.getElementById(id);
  const s = mp.state;

  const SLIDERS = {
    'light-sliders': [
      ['exposure', 'Brightness', 0.05, 'Makes the whole photo lighter or darker'],
      ['contrast', 'Contrast', 1, 'More: punchier. Less: softer'],
      ['highlights', 'Bright areas', 1, 'Lower to bring back a white sky'],
      ['shadows', 'Dark areas', 1, 'Raise to see into the shadows'],
    ],
    'color-sliders': [
      ['warmth', 'Warmth', 1, 'Left: cooler, bluer. Right: warmer, more yellow'],
      ['tint', 'Tint', 1, 'Left: greener. Right: more magenta'],
      ['vibrance', 'Vibrance', 1, 'Livelier colors, gentle on skin'],
      ['saturation', 'Saturation', 1, 'Stronger or weaker colors everywhere. All the way left is black and white'],
    ],
  };

  let edit = { ...lib.DEFAULT_EDIT };
  const histories = new Map(); // photo id -> history
  let showOriginal = false;
  let cropping = false;
  let leveling = false;
  let previewUrl = null;
  let inflight = false;
  let pending = false;
  // Saves not yet answered. Their views can arrive out of order, so while any
  // is pending a view that disagrees with the history is ours, not the CLI's.
  let saving = 0;

  async function save(id, next) {
    saving += 1;
    try {
      await mp.api.saveEdit(id, next);
    } catch (error) {
      mp.showError(error);
    } finally {
      saving -= 1;
    }
  }

  const current = () => (s.current != null ? s.byId.get(s.current) : null);
  const history = (id) => {
    if (!histories.has(id)) histories.set(id, lib.createHistory(s.byId.get(id).edit));
    return histories.get(id);
  };

  // --- preview --------------------------------------------------------------

  function previewEdge() {
    const stage = $('stage').getBoundingClientRect();
    return Math.min(2048, Math.max(stage.width, stage.height) * (window.devicePixelRatio || 1));
  }

  function shownEdit() {
    if (showOriginal) return { ...lib.DEFAULT_EDIT };
    // Crop and level both work on the whole straightened frame.
    if (cropping || leveling) return { ...edit, crop: null };
    return edit;
  }

  /** Render the latest state. Calls made while one is in flight coalesce. */
  async function requestPreview() {
    pending = true;
    if (inflight) return;
    inflight = true;
    while (pending) {
      pending = false;
      const photo = current();
      if (!photo) break;
      const message = $('stage-message');
      if (photo.missing) {
        message.textContent = 'This photo is offline. Connect the drive it is on.';
        message.hidden = false;
        $('preview').removeAttribute('src');
        mp.histogram.clear();
        break;
      }
      try {
        const url = await mp.api.renderPreview(photo.id, shownEdit(), previewEdge());
        if (photo.id !== s.current) {
          URL.revokeObjectURL(url);
          continue;
        }
        const img = $('preview');
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
          img.src = url;
        });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        previewUrl = url;
        mp.histogram.draw(img);
        message.hidden = true;
        if (cropping) mp.crop.layout();
        if (leveling) mp.level.layout();
      } catch (error) {
        message.textContent = String(error);
        message.hidden = false;
      }
    }
    inflight = false;
    $('stage-badge').hidden = !showOriginal;
    $('stage-badge').textContent = 'Original';
  }

  // --- controls -------------------------------------------------------------

  function slider(container, [name, label, step, help]) {
    const range = s.fields[name] || { min: -100, max: 100 };
    const row = document.createElement('div');
    row.className = 'slider';
    row.dataset.field = name;
    row.title = help;
    // Name, track, value on one line.
    const head = document.createElement('label');
    head.textContent = label;
    const out = document.createElement('output');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = range.min;
    input.max = range.max;
    input.step = step;
    input.addEventListener('input', () => {
      edit = { ...edit, [name]: Number(input.value) };
      out.textContent = lib.formatValue(name, edit[name]);
      requestPreview();
    });
    input.addEventListener('change', () => commit(edit));
    head.addEventListener('dblclick', () => commit({ ...edit, [name]: lib.DEFAULT_EDIT[name] }));
    row.append(head, input, out);
    container.append(row);
  }

  function buildControls() {
    for (const [id, defs] of Object.entries(SLIDERS)) {
      const el = $(id);
      el.replaceChildren();
      for (const def of defs) slider(el, def);
    }
    const amount = $('look-amount-row');
    amount.replaceChildren();
    slider(amount, ['look_amount', 'Strength', 1, 'How strongly the film look is applied']);
    buildLooks();
  }

  function buildLooks() {
    const grid = $('look-grid');
    const items = [{ id: null, label: 'None', description: 'No film look' }, ...s.looks];
    grid.replaceChildren(...items.map((look) => {
      const b = document.createElement('button');
      b.className = 'look';
      b.dataset.look = look.id ?? '';
      b.title = look.description;
      const img = document.createElement('img');
      img.alt = '';
      const name = document.createElement('span');
      name.textContent = look.label;
      b.append(img, name);
      b.onclick = () => commit({ ...edit, look: look.id });
      return b;
    }));
  }

  /** Small previews of every look on the current photo. */
  async function renderLookSwatches() {
    const photo = current();
    if (!photo || photo.missing) return;
    for (const button of $('look-grid').children) {
      const look = button.dataset.look || null;
      const img = button.querySelector('img');
      try {
        const url = await mp.api.renderPreview(photo.id, { ...edit, look, look_amount: 100 }, 160);
        if (photo.id !== s.current) return URL.revokeObjectURL(url);
        if (img.src) URL.revokeObjectURL(img.src);
        img.src = url;
      } catch (_) {
        return;
      }
    }
  }

  function syncControls() {
    for (const row of document.querySelectorAll('#edit-panel .slider')) {
      const name = row.dataset.field;
      row.querySelector('input').value = edit[name];
      row.querySelector('output').textContent = lib.formatValue(name, edit[name]);
    }
    for (const b of $('look-grid').children) b.classList.toggle('active', (b.dataset.look || null) === (edit.look || null));
    $('look-amount-row').hidden = !edit.look;
    const photo = current();
    const h = photo ? history(photo.id) : null;
    for (const b of document.querySelectorAll('[data-action="undo"]')) b.disabled = !h?.canUndo;
    for (const b of document.querySelectorAll('[data-action="redo"]')) b.disabled = !h?.canRedo;
  }

  // --- changes --------------------------------------------------------------

  async function commit(next) {
    const photo = current();
    if (!photo) return;
    edit = next;
    // Record the step first so the undo button reflects it.
    const changed = history(photo.id).push(next);
    syncControls();
    requestPreview();
    if (!changed) return;
    await save(photo.id, next);
  }

  async function step(direction) {
    const photo = current();
    if (!photo) return;
    const h = history(photo.id);
    const next = direction < 0 ? h.undo() : h.redo();
    if (!next) return;
    edit = next;
    syncControls();
    requestPreview();
    await save(photo.id, next);
  }

  async function runAuto(kinds) {
    const photo = current();
    if (!photo || photo.missing) return;
    const note = $('auto-note');
    note.textContent = 'Looking at the photo…';
    try {
      const before = edit;
      const outcome = await mp.api.auto(photo.id, edit, kinds);
      const { lines, changed } = lib.describeAuto(kinds, before, outcome.edit);
      note.textContent = lines.join('\n');
      const done = commit(outcome.edit);
      flash(changed);
      await done;
      if (kinds.includes('straighten') || kinds.length > 1) renderLookSwatches();
    } catch (error) {
      note.textContent = '';
      mp.showError(error);
    }
  }

  /** Briefly light up the slider rows an auto button moved. */
  function flash(names) {
    for (const name of names) {
      const row = document.querySelector(`#edit-panel .slider[data-field="${name}"]`);
      if (!row) continue;
      row.closest('details').open = true;
      row.classList.remove('changed');
      void row.offsetWidth; // restart the animation on a repeat click
      row.classList.add('changed');
    }
  }

  function rotate(by) {
    // A crop is in the old orientation's frame, so turning drops it.
    commit({ ...edit, rotate: (edit.rotate + by + 4) % 4, crop: null });
  }

  function setOriginal(on) {
    if (showOriginal === on) return;
    showOriginal = on;
    requestPreview();
  }

  // --- photo switching ------------------------------------------------------

  function renderFilmstrip() {
    const strip = $('filmstrip');
    const photos = mp.library.visiblePhotos();
    strip.replaceChildren(...photos.map((p) => {
      const cell = document.createElement('button');
      cell.className = 'strip-cell' + (p.id === s.current ? ' current' : '');
      cell.title = p.name;
      cell.append(mp.library.thumbImage(p.id));
      cell.onclick = () => open(p.id);
      return cell;
    }));
    strip.querySelector('.current')?.scrollIntoView({ block: 'nearest', inline: 'center' });

    const photo = current();
    const at = photos.findIndex((p) => p.id === s.current);
    $('strip-label').textContent = photo
      ? `${lib.shortPath(photo.path.slice(0, photo.path.lastIndexOf('/')))} · ${at + 1} of ${photos.length} photos · ${photo.name}`
      : '';
    $('strip-stars').replaceChildren(...[1, 2, 3, 4, 5].map((n) => {
      const b = document.createElement('button');
      b.className = 'star' + (photo && n <= photo.rating ? ' on' : '');
      b.textContent = '★';
      b.title = `${n} star${n > 1 ? 's' : ''}`;
      b.onclick = () => mp.library.rate(photo && n === photo.rating ? 0 : n);
      return b;
    }));
  }

  function open(id) {
    if (!s.byId.has(id)) return;
    if (cropping) mp.crop.cancel();
    if (leveling) mp.level.cancel();
    s.current = id;
    s.selection = new Set([id]);
    s.anchor = id;
    // Paste or the CLI may have changed this photo since its history was made.
    const saved = s.byId.get(id).edit;
    if (!lib.editsEqual(history(id).current, saved)) history(id).reset(saved);
    edit = { ...lib.DEFAULT_EDIT, ...saved };
    $('auto-note').textContent = '';
    syncControls();
    renderFilmstrip();
    requestPreview();
    renderLookSwatches();
  }

  function neighbor(by) {
    const photos = mp.library.visiblePhotos();
    const i = photos.findIndex((p) => p.id === s.current);
    const next = photos[i + by];
    if (next) open(next.id);
  }

  // When the catalog changed outside this page (the CLI), take its edit.
  mp.onView((view, previous) => {
    if (s.mode !== 'edit') return;
    const photo = current();
    if (!photo) return;
    const h = history(photo.id);
    if (!saving && !lib.editsEqual(photo.edit, h.current)) {
      h.reset(photo.edit);
      edit = { ...lib.DEFAULT_EDIT, ...photo.edit };
      syncControls();
      requestPreview();
      renderLookSwatches();
    }
    const before = previous.get(photo.id);
    if (!before || before.missing !== photo.missing) requestPreview();
    renderFilmstrip();
  });

  for (const b of document.querySelectorAll('[data-auto]')) b.onclick = () => runAuto([b.dataset.auto]);
  const hold = $('before-after');
  hold.addEventListener('pointerdown', () => setOriginal(true));
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) hold.addEventListener(ev, () => setOriginal(false));
  window.addEventListener('resize', () => s.mode === 'edit' && requestPreview());

  mp.editor = {
    buildControls,
    open,
    neighbor,
    requestPreview,
    commit,
    undo: () => step(-1),
    redo: () => step(1),
    // Level is not here: it changes the frame, so it waits for OK in level mode.
    autoAll: () => runAuto(['color', 'brightness', 'light', 'contrast', 'vivid']),
    rotate,
    toggleOriginal: () => setOriginal(!showOriginal),
    setOriginal,
    get edit() { return edit; },
    setCropping(on) { cropping = on; requestPreview(); },
    get cropping() { return cropping; },
    setLeveling(on) { leveling = on; requestPreview(); },
    get leveling() { return leveling; },
    refreshSwatches: () => renderLookSwatches(),
    /** Show `next` without saving it or adding an undo step. */
    preview(next) {
      edit = next;
      syncControls();
      requestPreview();
    },
    canUndo: () => (current() ? history(current().id).canUndo : false),
  };
})();
