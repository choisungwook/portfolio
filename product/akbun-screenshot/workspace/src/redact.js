'use strict';

// The redact tool: a box that hides what is under it. Loaded as a script by
// editor.html and required by the node test. Everything is exported behind one
// name so the page never declares these as globals of its own.

(() => {
  const STYLES = ['pixelate', 'blur', 'blackout'];

  // A block under this many image pixels leaves small text readable, so the
  // pixelate block never goes below it, whatever the display scale.
  const MIN_BLOCK = 8;

  // Blur is a downscale and a smooth upscale. Canvas `filter` would be one
  // line, but WKWebView only gained it in Safari 18 and the app supports older
  // macOS. Shrinking by this factor and back loses every glyph edge.
  const BLUR_FACTOR = 16;

  // The box in whole image pixels, sorted and clipped to the image. Null when
  // nothing of it is on the image.
  function redactRect(shape, width, height) {
    const left = Math.max(0, Math.floor(Math.min(shape.x1, shape.x2)));
    const top = Math.max(0, Math.floor(Math.min(shape.y1, shape.y2)));
    const right = Math.min(width, Math.ceil(Math.max(shape.x1, shape.x2)));
    const bottom = Math.min(height, Math.ceil(Math.max(shape.y1, shape.y2)));
    if (right <= left || bottom <= top) return null;
    return { x: left, y: top, width: right - left, height: bottom - top };
  }

  // Pixelate block size in image pixels: 12 points on screen, so it looks the
  // same on a retina capture as on a normal one.
  function blockSize(unit) {
    return Math.max(MIN_BLOCK, Math.round(12 * unit));
  }

  // Draws `source` (the base image) shrunk to `w` x `h` and stretched back over
  // the box, with or without smoothing.
  function resample(ctx, source, rect, w, h, smooth) {
    const small = document.createElement('canvas');
    small.width = Math.max(1, w);
    small.height = Math.max(1, h);
    const sctx = small.getContext('2d');
    sctx.imageSmoothingEnabled = smooth;
    sctx.drawImage(source, rect.x, rect.y, rect.width, rect.height, 0, 0, small.width, small.height);
    ctx.save();
    ctx.imageSmoothingEnabled = smooth;
    ctx.drawImage(small, 0, 0, small.width, small.height, rect.x, rect.y, rect.width, rect.height);
    ctx.restore();
  }

  // Reads from the base image, not from the canvas, so a redact box hides the
  // screenshot and never smears an annotation drawn under it.
  function draw(ctx, source, shape, unit) {
    const rect = redactRect(shape, ctx.canvas.width, ctx.canvas.height);
    if (!rect) return;
    if (shape.style === 'blackout') {
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.restore();
      return;
    }
    if (shape.style === 'blur') {
      const w = Math.ceil(rect.width / BLUR_FACTOR);
      const h = Math.ceil(rect.height / BLUR_FACTOR);
      resample(ctx, source, rect, w, h, true);
      return;
    }
    const block = blockSize(unit);
    resample(ctx, source, rect, Math.ceil(rect.width / block), Math.ceil(rect.height / block), false);
  }

  const exported = { STYLES, redactRect, blockSize, draw };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.akbunRedact = exported;
  }
})();
