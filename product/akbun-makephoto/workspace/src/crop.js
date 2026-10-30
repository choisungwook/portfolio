'use strict';

// Crop mode: the whole straightened photo is shown and a rectangle is dragged
// over it. Coordinates are fractions of that frame, which is what the edit
// stores, so the preview size never matters.

(function () {
  const mp = window.mp;
  const lib = globalThis.makephotoLib;
  const $ = (id) => document.getElementById(id);

  let rect = { x: 0, y: 0, w: 1, h: 1 };
  let ratio = null; // locked normalized width/height
  let drag = null;

  const frameAspect = () => {
    const img = $('preview');
    return img.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1.5;
  };

  /** Fit the overlay over the image as it is drawn, then place the rectangle. */
  function layout() {
    const img = $('preview').getBoundingClientRect();
    const stage = $('stage').getBoundingClientRect();
    const layer = $('crop-layer');
    Object.assign(layer.style, {
      left: `${img.left - stage.left}px`,
      top: `${img.top - stage.top}px`,
      width: `${img.width}px`,
      height: `${img.height}px`,
    });
    Object.assign($('crop-rect').style, {
      left: `${rect.x * 100}%`,
      top: `${rect.y * 100}%`,
      width: `${rect.w * 100}%`,
      height: `${rect.h * 100}%`,
    });
  }

  function start() {
    if (!mp.state.current || mp.editor.cropping) return;
    rect = mp.editor.edit.crop ? { ...mp.editor.edit.crop } : { x: 0, y: 0, w: 1, h: 1 };
    setAspect('free', false);
    $('crop-layer').hidden = false;
    $('crop-bar').hidden = false;
    layout();
    mp.editor.setCropping(true);
  }

  function stop() {
    $('crop-layer').hidden = true;
    $('crop-bar').hidden = true;
    mp.editor.setCropping(false);
  }

  function done() {
    const full = rect.x < 0.001 && rect.y < 0.001 && rect.w > 0.999 && rect.h > 0.999;
    const edit = { ...mp.editor.edit, crop: full ? null : rect };
    stop();
    mp.editor.commit(edit);
  }

  /** Lock a shape. With `place`, show the biggest centered area of it at once. */
  function setAspect(value, place = true) {
    for (const b of $('crop-aspects').children) b.classList.toggle('active', b.dataset.aspect === value);
    const aspect = value === 'free' ? null : value === 'original' ? frameAspect() : Number(value);
    ratio = aspect ? aspect / frameAspect() : null;
    if (place && aspect) rect = lib.aspectRect(aspect, frameAspect());
    layout();
  }

  for (const b of $('crop-aspects').children) b.onclick = () => setAspect(b.dataset.aspect);

  $('crop-rect').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const layer = $('crop-layer').getBoundingClientRect();
    drag = { handle: e.target.dataset.handle || null, x: e.clientX, y: e.clientY, rect: { ...rect }, w: layer.width, h: layer.height };
    e.target.setPointerCapture(e.pointerId);
  });

  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = (e.clientX - drag.x) / drag.w;
    const dy = (e.clientY - drag.y) / drag.h;
    // Shift keeps the shape the rectangle had when the drag began.
    const lock = ratio || (e.shiftKey ? drag.rect.w / drag.rect.h : null);
    rect = drag.handle ? lib.resizeRect(drag.rect, drag.handle, dx, dy, lock) : lib.moveRect(drag.rect, dx, dy);
    layout();
  });
  window.addEventListener('pointerup', () => { drag = null; });

  $('crop-done').onclick = done;
  $('crop-cancel').onclick = stop;
  $('crop-reset').onclick = () => {
    rect = { x: 0, y: 0, w: 1, h: 1 };
    setAspect('free', false);
  };
  window.addEventListener('resize', () => mp.editor.cropping && layout());

  mp.crop = { start, done, cancel: stop, layout };
})();
