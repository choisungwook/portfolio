(function registerEditorUtils(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationEditorUtils = api;
})(globalThis, function createEditorUtils() {
  'use strict';

const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
const ZOOM_FIT = 1;

function zoomIn(zoom) {
  return ZOOM_STEPS.find((step) => step > zoom + 0.001) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
}

function zoomOut(zoom) {
  const smaller = ZOOM_STEPS.filter((step) => step < zoom - 0.001);
  return smaller.length ? smaller[smaller.length - 1] : ZOOM_STEPS[0];
}

function filterFonts(fonts, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return [...fonts];
  return fonts.filter((font) => font.toLocaleLowerCase().includes(needle));
}


  return {
    ZOOM_STEPS,
    ZOOM_FIT,
    zoomIn,
    zoomOut,
    filterFonts,
  };
});
