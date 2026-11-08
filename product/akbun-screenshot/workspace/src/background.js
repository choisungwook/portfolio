'use strict';

// The Background tool: the annotated image set on a padded backdrop. Loaded
// as a script by editor.html and required by the node test, exported behind
// one name. The layout maths is pure; compose needs a canvas.

(() => {
  // Twenty backdrops: fourteen two or three stop gradients and six solids.
  // Angles are in degrees, 0 pointing up and 90 pointing right.
  const BACKGROUNDS = [
    { id: 'g1', name: 'Sunrise', angle: 135, stops: ['#ff9a8b', '#ff6a88', '#ff99ac'] },
    { id: 'g2', name: 'Ocean', angle: 135, stops: ['#2193b0', '#6dd5ed'] },
    { id: 'g3', name: 'Mint', angle: 135, stops: ['#11998e', '#38ef7d'] },
    { id: 'g4', name: 'Grape', angle: 135, stops: ['#8e2de2', '#4a00e0'] },
    { id: 'g5', name: 'Peach', angle: 135, stops: ['#ffecd2', '#fcb69f'] },
    { id: 'g6', name: 'Sky', angle: 180, stops: ['#a1c4fd', '#c2e9fb'] },
    { id: 'g7', name: 'Dusk', angle: 135, stops: ['#2c3e50', '#fd746c'] },
    { id: 'g8', name: 'Lime', angle: 135, stops: ['#d4fc79', '#96e6a1'] },
    { id: 'g9', name: 'Blossom', angle: 135, stops: ['#ee9ca7', '#ffdde1'] },
    { id: 'g10', name: 'Night', angle: 135, stops: ['#0f2027', '#203a43', '#2c5364'] },
    { id: 'g11', name: 'Flame', angle: 135, stops: ['#f12711', '#f5af19'] },
    { id: 'g12', name: 'Lavender', angle: 135, stops: ['#e0c3fc', '#8ec5fc'] },
    { id: 'g13', name: 'Forest', angle: 135, stops: ['#134e5e', '#71b280'] },
    { id: 'g14', name: 'Candy', angle: 135, stops: ['#fbc2eb', '#a6c1ee'] },
    { id: 's1', name: 'White', stops: ['#ffffff'] },
    { id: 's2', name: 'Light gray', stops: ['#f2f2f7'] },
    { id: 's3', name: 'Cream', stops: ['#fdf6e3'] },
    { id: 's4', name: 'Navy', stops: ['#1e3a5f'] },
    { id: 's5', name: 'Charcoal', stops: ['#1c1c1e'] },
    { id: 's6', name: 'Black', stops: ['#000000'] },
  ];

  const RATIOS = { auto: null, '1:1': 1, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 };

  // Row-major, so the panel lays the nine buttons out as a 3 by 3 grid. Each
  // carries where in the spare space the image sits: 0 start, 0.5 middle, 1 end.
  const ALIGNS = [
    ['top-left', 0, 0], ['top', 0.5, 0], ['top-right', 1, 0],
    ['left', 0, 0.5], ['center', 0.5, 0.5], ['right', 1, 0.5],
    ['bottom-left', 0, 1], ['bottom', 0.5, 1], ['bottom-right', 1, 1],
  ];

  // 'none' means no background: the export is the annotated image as it is.
  const DEFAULTS = { background: 'none', padding: 64, radius: 12, shadow: true, ratio: 'auto', align: 'center' };

  function find(id) {
    return BACKGROUNDS.find((bg) => bg.id === id) || null;
  }

  // Where the image goes on the backdrop, in image pixels. Padding and radius
  // are points, so `scale` (device pixels per point) keeps them the same size
  // on a retina capture as on a normal one. The aspect ratio grows the frame
  // past the padding, and the alignment decides where that extra space goes;
  // with ratio auto there is none, so the image is simply centred.
  function layout(imageWidth, imageHeight, options, scale) {
    const padding = Math.round(options.padding * scale);
    const radius = Math.round(options.radius * scale);
    const baseWidth = imageWidth + padding * 2;
    const baseHeight = imageHeight + padding * 2;
    let width = baseWidth;
    let height = baseHeight;
    const target = RATIOS[options.ratio];
    if (target) {
      if (baseWidth / baseHeight < target) width = Math.ceil(baseHeight * target);
      else height = Math.ceil(baseWidth / target);
    }
    const [, fx, fy] = ALIGNS.find(([name]) => name === options.align) || ALIGNS[4];
    return {
      width,
      height,
      x: padding + Math.round((width - baseWidth) * fx),
      y: padding + Math.round((height - baseHeight) * fy),
      radius: Math.min(radius, Math.floor(Math.min(imageWidth, imageHeight) / 2)),
      padding,
    };
  }

  // The CSS for a swatch, so the panel shows the same backdrop it will draw.
  function cssBackground(bg) {
    if (bg.stops.length === 1) return bg.stops[0];
    return `linear-gradient(${bg.angle}deg, ${bg.stops.join(', ')})`;
  }

  // CSS angles run clockwise from up; the canvas gradient wants two points, so
  // the line runs through the centre and reaches the corners the way CSS does.
  function fillBackdrop(ctx, bg, width, height) {
    if (bg.stops.length === 1) {
      ctx.fillStyle = bg.stops[0];
    } else {
      const rad = (bg.angle * Math.PI) / 180;
      const dx = Math.sin(rad);
      const dy = -Math.cos(rad);
      const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
      const gradient = ctx.createLinearGradient(
        width / 2 - dx * half, height / 2 - dy * half,
        width / 2 + dx * half, height / 2 + dy * half
      );
      bg.stops.forEach((stop, i) => gradient.addColorStop(i / (bg.stops.length - 1), stop));
      ctx.fillStyle = gradient;
    }
    ctx.fillRect(0, 0, width, height);
  }

  // Drawn by hand rather than with ctx.roundRect, which older WKWebView lacks.
  function roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // The annotated image on its backdrop, as a new canvas. Returns the source
  // unchanged when no background is chosen.
  function compose(source, options, scale) {
    const bg = find(options.background);
    if (!bg) return source;
    const box = layout(source.width, source.height, options, scale);
    const out = document.createElement('canvas');
    out.width = box.width;
    out.height = box.height;
    const ctx = out.getContext('2d');
    fillBackdrop(ctx, bg, box.width, box.height);

    if (options.shadow) {
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = Math.max(8, box.padding * 0.5);
      ctx.shadowOffsetY = ctx.shadowBlur * 0.3;
      ctx.fillStyle = '#000';
      roundedRect(ctx, box.x, box.y, source.width, source.height, box.radius);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    roundedRect(ctx, box.x, box.y, source.width, source.height, box.radius);
    ctx.clip();
    ctx.drawImage(source, box.x, box.y);
    ctx.restore();
    return out;
  }

  const exported = { BACKGROUNDS, RATIOS, ALIGNS, DEFAULTS, find, layout, cssBackground, compose };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.akbunBackground = exported;
  }
})();
