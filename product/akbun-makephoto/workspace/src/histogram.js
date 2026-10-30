'use strict';

// The histogram under the edit panel's header: red, green and blue counts of
// the shown preview, drawn additively so where they overlap reads as white.

(function () {
  const mp = window.mp;
  const BINS = 256;
  const sample = document.createElement('canvas');

  /** Draw the histogram of a loaded <img> onto the #histogram canvas. */
  function draw(img) {
    const out = document.getElementById('histogram');
    if (!img.naturalWidth) return clear();
    // A small copy is plenty for counts and keeps this cheap on every drag.
    const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
    sample.width = Math.max(1, Math.round(img.naturalWidth * scale));
    sample.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const sctx = sample.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(img, 0, 0, sample.width, sample.height);
    const px = sctx.getImageData(0, 0, sample.width, sample.height).data;
    const counts = [new Uint32Array(BINS), new Uint32Array(BINS), new Uint32Array(BINS)];
    for (let i = 0; i < px.length; i += 4) {
      counts[0][px[i]] += 1;
      counts[1][px[i + 1]] += 1;
      counts[2][px[i + 2]] += 1;
    }
    // Scale to the tallest bin away from the ends, so a clipped sky or black
    // border does not flatten everything else.
    let peak = 1;
    for (const c of counts) for (let b = 2; b < BINS - 2; b += 1) peak = Math.max(peak, c[b]);

    const ctx = out.getContext('2d');
    const { width: w, height: h } = out;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';
    const colors = ['rgba(220, 60, 60, 0.75)', 'rgba(60, 200, 90, 0.75)', 'rgba(70, 110, 230, 0.75)'];
    counts.forEach((c, ch) => {
      ctx.fillStyle = colors[ch];
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let b = 0; b < BINS; b += 1) ctx.lineTo((b / (BINS - 1)) * w, h - Math.min(1, c[b] / peak) * h);
      ctx.lineTo(w, h);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function clear() {
    const out = document.getElementById('histogram');
    out.getContext('2d').clearRect(0, 0, out.width, out.height);
  }

  mp.histogram = { draw, clear };
})();
