'use strict';

(function () {

function visible(settings) {
  return Boolean(settings && (
    settings.showActionSafeArea ||
    settings.showTitleSafeArea ||
    settings.showRuleOfThirds ||
    settings.showCenterLines
  ));
}

function lines(settings, width, height) {
  const output = [];
  if (!visible(settings) || width <= 0 || height <= 0) return output;
  if (settings.showActionSafeArea) output.push({ kind: 'action', x: width * 0.035, y: height * 0.035, width: width * 0.93, height: height * 0.93 });
  if (settings.showTitleSafeArea) output.push({ kind: 'title', x: width * 0.05, y: height * 0.05, width: width * 0.9, height: height * 0.9 });
  if (settings.showRuleOfThirds) {
    output.push({ kind: 'third', x1: width / 3, y1: 0, x2: width / 3, y2: height });
    output.push({ kind: 'third', x1: (width * 2) / 3, y1: 0, x2: (width * 2) / 3, y2: height });
    output.push({ kind: 'third', x1: 0, y1: height / 3, x2: width, y2: height / 3 });
    output.push({ kind: 'third', x1: 0, y1: (height * 2) / 3, x2: width, y2: (height * 2) / 3 });
  }
  if (settings.showCenterLines) {
    output.push({ kind: 'center', x1: width / 2, y1: 0, x2: width / 2, y2: height });
    output.push({ kind: 'center', x1: 0, y1: height / 2, x2: width, y2: height / 2 });
  }
  return output;
}

function draw(context, settings, width, height) {
  for (const guide of lines(settings, width, height)) {
    context.save();
    context.strokeStyle = guide.kind === 'title' ? '#f7d154' : '#e8eef7';
    context.lineWidth = guide.kind === 'center' ? 1.5 : 1;
    context.setLineDash(guide.kind === 'action' || guide.kind === 'title' ? [6, 4] : [3, 3]);
    if ('width' in guide) context.strokeRect(guide.x, guide.y, guide.width, guide.height);
    else {
      context.beginPath();
      context.moveTo(guide.x1, guide.y1);
      context.lineTo(guide.x2, guide.y2);
      context.stroke();
    }
    context.restore();
  }
}

const exported = { visible, lines, draw };
if (typeof module !== 'undefined' && module.exports) module.exports = exported;
else globalThis.guideLib = exported;

})();
