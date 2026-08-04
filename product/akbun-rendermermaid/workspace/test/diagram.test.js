import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_CANVAS_EDGE,
  ZOOM_MAX,
  ZOOM_MIN,
  clampZoom,
  diagramType,
  exportScale,
  fitZoom,
  isBlank,
  pngFileName,
  readSvgSize,
  withExplicitSize,
} from '../src/lib/diagram.js';

test('readSvgSize prefers the viewBox over a percentage width', () => {
  const markup = '<svg id="g" width="100%" viewBox="0 0 320 180" style="max-width: 320px;"><g/></svg>';
  assert.deepEqual(readSvgSize(markup), { width: 320, height: 180 });
});

test('readSvgSize falls back to pixel width and height attributes', () => {
  assert.deepEqual(readSvgSize('<svg width="240" height="120"></svg>'), { width: 240, height: 120 });
});

test('readSvgSize returns a usable default for markup it cannot measure', () => {
  assert.deepEqual(readSvgSize('<div>not an svg</div>'), { width: 800, height: 600 });
});

test('withExplicitSize replaces the size attributes', () => {
  const out = withExplicitSize('<svg width="100%" height="auto" viewBox="0 0 10 20"></svg>', 30, 60);
  assert.match(out, /width="30"/);
  assert.match(out, /height="60"/);
  assert.doesNotMatch(out, /width="100%"/);
});

test('withExplicitSize drops the max-width that would clamp the export', () => {
  const out = withExplicitSize('<svg style="max-width: 320px; background: white;" viewBox="0 0 320 180"></svg>', 640, 360);
  assert.doesNotMatch(out, /max-width/);
  assert.match(out, /background: white/);
});

test('withExplicitSize removes an empty style attribute rather than leaving it blank', () => {
  const out = withExplicitSize('<svg style="max-width: 320px;" viewBox="0 0 320 180"></svg>', 640, 360);
  assert.doesNotMatch(out, /style=/);
});

test('withExplicitSize leaves the diagram body untouched', () => {
  const out = withExplicitSize('<svg width="100%"><style>.node{fill:red}</style><g id="a"/></svg>', 10, 20);
  assert.match(out, /<style>\.node\{fill:red\}<\/style><g id="a"\/>/);
});

test('exportScale keeps the requested scale when the canvas can hold it', () => {
  assert.equal(exportScale(800, 600), 2);
});

test('exportScale lowers the scale instead of overflowing the canvas limit', () => {
  const scale = exportScale(MAX_CANVAS_EDGE, 1000);
  assert.equal(scale, 1);
  assert.ok(MAX_CANVAS_EDGE * scale <= MAX_CANVAS_EDGE);
});

test('exportScale never returns less than 1, so a huge diagram still exports', () => {
  assert.equal(exportScale(MAX_CANVAS_EDGE * 4, 100), 1);
});

test('clampZoom holds the zoom inside its range', () => {
  assert.equal(clampZoom(0.01), ZOOM_MIN);
  assert.equal(clampZoom(100), ZOOM_MAX);
  assert.equal(clampZoom(1.5), 1.5);
  assert.equal(clampZoom(Number.NaN), 1);
});

test('fitZoom shrinks a diagram wider than the viewport', () => {
  assert.equal(fitZoom(1096, 800, 2000, 500, 48), 1000 / 2000);
});

test('fitZoom enlarges a diagram smaller than the viewport', () => {
  // 1200 - 48 * 2 = 1104 of usable width against 300 is tighter than the
  // 804 of usable height against 200.
  assert.equal(fitZoom(1200, 900, 300, 200), 1104 / 300);
});

test('fitZoom keeps its result inside the zoom range', () => {
  assert.equal(fitZoom(4000, 4000, 1, 1), ZOOM_MAX);
});

test('diagramType reads the first meaningful keyword', () => {
  assert.equal(diagramType('flowchart TD\n  A --> B'), 'flowchart');
  assert.equal(diagramType('sequenceDiagram\n  A ->> B: hi'), 'sequencediagram');
});

test('diagramType skips comments, directives and frontmatter', () => {
  const code = ['---', 'title: Example', '---', '%% a comment', '%%{init: {"theme":"dark"} }%%', '', 'classDiagram'].join('\n');
  assert.equal(diagramType(code), 'classdiagram');
});

test('diagramType keeps the version suffix of a state diagram', () => {
  assert.equal(diagramType('stateDiagram-v2\n  [*] --> Idle'), 'statediagram-v2');
});

test('diagramType falls back when there is nothing to read', () => {
  assert.equal(diagramType('   \n\n'), 'diagram');
  assert.equal(diagramType(undefined), 'diagram');
});

test('isBlank treats whitespace as empty', () => {
  assert.equal(isBlank('  \n\t'), true);
  assert.equal(isBlank('graph TD'), false);
});

test('pngFileName stamps the diagram type and the local time', () => {
  const date = new Date(2026, 7, 4, 9, 5);
  assert.equal(pngFileName('flowchart LR\n A-->B', date), 'mermaid-flowchart-20260804-0905.png');
});
