(function registerEditorPresets(root, factory) {
  const api = typeof module !== 'undefined' && module.exports
    ? factory(require('./constants.js'), require('./shapes.js'), require('./geometry.js'))
    : factory(
      root.makepresentationEditorConstants,
      root.makepresentationEditorShapes,
      root.makepresentationEditorGeometry
    );
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorPresets = api;
})(globalThis, function createEditorPresets(C, Shapes, Geometry) {
  'use strict';

  const { PRESET_KIND_LABELS, SHAPE_KINDS } = C;
  const { cloneShapes, createShape } = Shapes;
  const { moveShape, shapeBBox } = Geometry;

function defaultPresetShapes(id) {
  const red = '#e03131';
  if (id === 'red-filled-rectangle' || id === 'red-outline-rectangle') {
    const shape = createShape('rect', 0, 0, {
      stroke: red,
      fill: id === 'red-filled-rectangle' ? red : 'none',
    });
    shape.w = 160;
    shape.h = 90;
    return [shape];
  }
  if (id === 'numbered-circle') {
    const shape = createShape('ellipse', 0, 0, {
      stroke: red,
      fill: 'none',
      fontSize: 30,
      textColor: red,
    });
    shape.w = 90;
    shape.h = 90;
    shape.text = '1';
    return [shape];
  }
  if (id === 'right-open-arrow' || id === 'left-open-arrow') {
    const pointsRight = id === 'right-open-arrow';
    const shape = createShape('arrow', pointsRight ? 0 : 180, 45, {
      stroke: red,
      strokeWidth: 3,
    });
    shape.w = pointsRight ? 180 : -180;
    shape.h = 0;
    shape.arrowEnd = 'arrow';
    return [shape];
  }
  return [];
}

function customPresetFromSelection(shapes, existingPresets, id) {
  if (!Array.isArray(shapes) || shapes.length !== 1) return null;
  const shape = shapes[0];
  if (!shape || !SHAPE_KINDS.has(shape.kind) || shape.kind === 'image') return null;
  const presetId = String(id || '').trim();
  if (!presetId) return null;

  const [copy] = cloneShapes(shapes);
  const bounds = shapeBBox(copy);
  moveShape(copy, -bounds.x, -bounds.y);
  delete copy.groupId;

  const baseName = PRESET_KIND_LABELS[shape.kind] || 'Preset';
  const usedNames = new Set(
    (Array.isArray(existingPresets) ? existingPresets : [])
      .map((preset) => String(preset?.name || ''))
  );
  let number = 1;
  while (usedNames.has(`${baseName} ${number}`)) number += 1;

  return {
    id: presetId.slice(0, 100),
    name: `${baseName} ${number}`,
    shapes: [copy],
  };
}


  return {
    defaultPresetShapes,
    customPresetFromSelection,
  };
});
