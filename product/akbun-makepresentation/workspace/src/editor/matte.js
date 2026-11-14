(function registerEditorMatte(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorMatte = api;
})(globalThis, function createEditorMatte() {
  'use strict';

  // Remove the background of a raster image, in place, with no library.
  //
  // ponytail: border-connected flood fill on a colour estimated from the
  // outer ring. It works for a flat or gently graded background that touches
  // the image border; it is not a subject segmentation, so a subject that
  // shares the background's colour is eaten and a busy background is left
  // alone. Upgrade path: a segmentation model.

  // Default tolerance on the redmean distance scale (0 to about 765, black to
  // white). Measured against the cases in test/matte.test.js: +-6 per channel
  // of sensor noise lands near 18, JPEG-style speckle near 30, while a pale
  // subject on white (#f0f0f0 against #ffffff) is 45, so 36 clears the noise
  // and stops short of the subject.
  const DEFAULT_TOLERANCE = 36;
  // Below this alpha a pixel counts as already transparent.
  const CLEAR_ALPHA = 16;

  // "Redmean" weighting: a cheap approximation of how different two sRGB
  // colours look, much closer to perception than plain RGB distance and with
  // no Lab conversion.
  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const mean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    return Math.sqrt((2 + mean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - mean) / 256) * db * db);
  }

  // The most common colour on the 1px frame. Colours are bucketed to 4 bits a
  // channel to find the winner, then the real colours in that bucket are
  // averaged, so noise does not split the vote. Corners count four times: they
  // are the pixels least likely to be covered by the subject.
  // Returns null when most of the frame is already transparent.
  function borderColor(rgba, width, height) {
    const counts = new Float64Array(4096);
    const sums = new Float64Array(4096 * 3);
    let clear = 0;
    let total = 0;
    const take = (x, y) => {
      const i = (y * width + x) * 4;
      const corner = (x === 0 || x === width - 1) && (y === 0 || y === height - 1);
      const weight = corner ? 4 : 1;
      total += weight;
      if (rgba[i + 3] < CLEAR_ALPHA) {
        clear += weight;
        return;
      }
      const bucket = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
      counts[bucket] += weight;
      sums[bucket * 3] += rgba[i] * weight;
      sums[bucket * 3 + 1] += rgba[i + 1] * weight;
      sums[bucket * 3 + 2] += rgba[i + 2] * weight;
    };
    for (let x = 0; x < width; x += 1) {
      take(x, 0);
      if (height > 1) take(x, height - 1);
    }
    for (let y = 1; y < height - 1; y += 1) {
      take(0, y);
      if (width > 1) take(width - 1, y);
    }
    if (clear * 2 > total) return null;
    let best = 0;
    for (let bucket = 1; bucket < 4096; bucket += 1) {
      if (counts[bucket] > counts[best]) best = bucket;
    }
    return [sums[best * 3] / counts[best], sums[best * 3 + 1] / counts[best], sums[best * 3 + 2] / counts[best]];
  }

  // rgba is ImageData.data (RGBA, row-major). It is changed in place and
  // handed back with how many pixels ended up fully transparent.
  function removeBackground(rgba, width, height, options = {}) {
    const tolerance = Number.isFinite(options.tolerance) ? options.tolerance : DEFAULT_TOLERANCE;
    const feather = Number.isFinite(options.feather) ? options.feather : tolerance * 0.6;
    const count = width * height;
    if (!(width > 0 && height > 0) || rgba.length < count * 4) return { rgba, removed: 0 };
    const background = borderColor(rgba, width, height);
    if (!background) return { rgba, removed: 0 };
    const [br, bg, bb] = background;

    const distance = (pixel) => colorDistance(rgba[pixel * 4], rgba[pixel * 4 + 1], rgba[pixel * 4 + 2], br, bg, bb);
    // A transparent pixel has no colour worth comparing; it joins the
    // background so a half-cut-out image can be finished.
    const isBackground = (pixel) => rgba[pixel * 4 + 3] < CLEAR_ALPHA || distance(pixel) <= tolerance;

    // 1 = removed background, 2 = edge pixel already treated.
    const seen = new Uint8Array(count);
    const queue = new Int32Array(count);
    let tail = 0;
    const push = (pixel) => {
      seen[pixel] = 1;
      queue[tail] = pixel;
      tail += 1;
    };
    // Seeds: every border pixel that looks like the background.
    for (let x = 0; x < width; x += 1) {
      for (const pixel of [x, (height - 1) * width + x]) {
        if (!seen[pixel] && isBackground(pixel)) push(pixel);
      }
    }
    for (let y = 1; y < height - 1; y += 1) {
      for (const pixel of [y * width, y * width + width - 1]) {
        if (!seen[pixel] && isBackground(pixel)) push(pixel);
      }
    }
    // 4-connected growth, so a background-coloured island inside the subject
    // is never reached.
    for (let head = 0; head < tail; head += 1) {
      const pixel = queue[head];
      const x = pixel % width;
      const y = (pixel - x) / width;
      if (x > 0 && !seen[pixel - 1] && isBackground(pixel - 1)) push(pixel - 1);
      if (x < width - 1 && !seen[pixel + 1] && isBackground(pixel + 1)) push(pixel + 1);
      if (y > 0 && !seen[pixel - width] && isBackground(pixel - width)) push(pixel - width);
      if (y < height - 1 && !seen[pixel + width] && isBackground(pixel + width)) push(pixel + width);
    }

    let removed = 0;
    const clear = (pixel) => {
      if (rgba[pixel * 4 + 3] !== 0) removed += 1;
      // RGB stays as it was: putImageData stores premultiplied alpha, so the
      // colour of a fully transparent pixel is dropped there anyway.
      rgba[pixel * 4 + 3] = 0;
    };
    const filled = tail;
    for (let k = 0; k < filled; k += 1) clear(queue[k]);

    function softenEdge(edge, x, y) {
      const own = distance(edge);
      let subject = own;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const near = ny * width + nx;
          if (seen[near] === 1) continue;
          subject = Math.max(subject, distance(near));
        }
      }
      if (own >= subject) return;
      const alpha = Math.max(0, Math.min(1, (own - tolerance) / Math.max(feather, subject - tolerance, 1e-6)));
      if (alpha >= 1) return;
      if (alpha === 0) {
        clear(edge);
        return;
      }
      const i = edge * 4;
      rgba[i] = Math.max(0, Math.min(255, Math.round((rgba[i] - (1 - alpha) * br) / alpha)));
      rgba[i + 1] = Math.max(0, Math.min(255, Math.round((rgba[i + 1] - (1 - alpha) * bg) / alpha)));
      rgba[i + 2] = Math.max(0, Math.min(255, Math.round((rgba[i + 2] - (1 - alpha) * bb) / alpha)));
      rgba[i + 3] = Math.round(rgba[i + 3] * alpha);
    }

    // Edge treatment, one pass. A pixel touching the removed region is a mix
    // of background and subject. Its subject colour is taken from its
    // most distant surviving neighbour, the alpha is how far along the way
    // from background to subject it sits, and the background share is taken
    // out of its colour so no halo of the old background is left. The ramp is
    // at least `feather` wide, so a subject close to the background colour
    // still gets a soft edge instead of a step.
    for (let k = 0; k < filled; k += 1) {
      const pixel = queue[k];
      const x = pixel % width;
      const y = (pixel - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const edge = ny * width + nx;
          if (seen[edge]) continue;
          seen[edge] = 2;
          softenEdge(edge, nx, ny);
        }
      }
    }
    return { rgba, removed };
  }

  return { removeBackground, colorDistance, DEFAULT_TOLERANCE };
});
