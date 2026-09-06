(function registerSearch(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.makepresentationSearch = api;
})(globalThis, function createSearch() {
  'use strict';

  function normalizeSearchText(text) {
    return String(text || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function buildSearchIndex(deck) {
    return deck.slides.flatMap((slide, slideIndex) => slide.shapes.flatMap((shape, shapeIndex) => {
      if (!shape.text?.trim()) return [];
      return [{ slideIndex, shapeIndex, text: shape.text, normalized: normalizeSearchText(shape.text) }];
    }));
  }

  function searchSlides(index, query) {
    const needle = normalizeSearchText(query);
    if (!needle) return [];
    return index.filter((entry) => entry.normalized.includes(needle));
  }

  return { normalizeSearchText, buildSearchIndex, searchSlides };
});
