'use strict';

// The highlighter: a wide marker stroke that tints what is under it instead of
// covering it. Loaded as a script by editor.html and required by the node test,
// exported behind one name like the other tool files.

(() => {
  // A marker is this many times the pen width in the Shape line box, so the
  // default 3 point line becomes an 18 point marker. Applied once when the
  // stroke is made; after that the shape's width is the drawn width, which is
  // what the box shows and edits when the highlight is selected.
  const WIDTH_FACTOR = 6;

  // Multiply darkens by the colour and leaves black as black, so text under a
  // highlight stays as readable as it was. One path for the whole stroke, so a
  // stroke crossing itself does not darken where it overlaps.
  function draw(ctx, shape) {
    const { points } = shape;
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = shape.color;
    ctx.lineWidth = shape.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.stroke();
    ctx.restore();
  }

  const exported = { WIDTH_FACTOR, draw };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.akbunHighlight = exported;
  }
})();
