'use strict';

(() => {
  const L = typeof module !== 'undefined' && module.exports
    ? require('./editor.js')
    : globalThis.slidesLib;

  const SETTINGS_VERSION = 1;
  const DEFAULT_GUIDELINES = Object.freeze({
    visible: false,
    unit: 'px',
    top: 36,
    bottom: 48,
    left: 48,
    right: 48,
  });

  function defaultAppSettings() {
    return {
      version: SETTINGS_VERSION,
      guidelines: { ...DEFAULT_GUIDELINES },
      customPresets: [],
    };
  }

  function margin(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 10000
      ? Math.round(number * 100) / 100
      : fallback;
  }

  function normalizeGuidelines(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      visible: source.visible === true,
      unit: source.unit === 'cm' ? 'cm' : 'px',
      top: margin(source.top, DEFAULT_GUIDELINES.top),
      bottom: margin(source.bottom, DEFAULT_GUIDELINES.bottom),
      left: margin(source.left, DEFAULT_GUIDELINES.left),
      right: margin(source.right, DEFAULT_GUIDELINES.right),
    };
  }

  function normalizeCustomPresets(value) {
    if (!Array.isArray(value)) return [];
    const ids = new Set();
    return value.flatMap((preset) => {
      if (!preset || typeof preset !== 'object') return [];
      const id = String(preset.id || '').trim().slice(0, 100);
      if (!id || ids.has(id)) return [];
      const shapes = L.parseClipboardShapes(JSON.stringify(preset.shapes || []))
        .filter((shape) => shape.kind !== 'image');
      if (!shapes.length) return [];
      ids.add(id);
      return [{
        id,
        name: String(preset.name || 'Preset').slice(0, 60),
        shapes,
      }];
    });
  }

  function normalizeAppSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      version: SETTINGS_VERSION,
      guidelines: normalizeGuidelines(source.guidelines),
      customPresets: normalizeCustomPresets(source.customPresets),
    };
  }

  function sortedValue(value) {
    if (Array.isArray(value)) return value.map(sortedValue);
    if (!value || typeof value !== 'object') return value;
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, sortedValue(value[key])])
    );
  }

  function settingsEqual(left, right) {
    return JSON.stringify(sortedValue(left)) === JSON.stringify(sortedValue(right));
  }

  function guidelineMarginsFit(width, height, guidelines) {
    const sizeWidth = Number(width);
    const sizeHeight = Number(height);
    const value = normalizeGuidelines(guidelines);
    return Number.isFinite(sizeWidth) && Number.isFinite(sizeHeight) &&
      value.left + value.right < sizeWidth && value.top + value.bottom < sizeHeight;
  }

  function fitPair(first, second, total) {
    const available = Math.max(1, total - 1);
    const sum = first + second;
    if (sum <= available) return [first, second];
    if (sum === 0) return [0, 0];
    const scale = available / sum;
    return [first * scale, second * scale];
  }

  function guidelineGeometry(width, height, guidelines) {
    const value = normalizeGuidelines(guidelines);
    const [left, right] = fitPair(value.left, value.right, width);
    const [top, bottom] = fitPair(value.top, value.bottom, height);
    const innerWidth = Math.max(1, width - left - right);
    const innerHeight = Math.max(1, height - top - bottom);
    const titleHeight = innerHeight * 0.185;
    const gap = innerHeight * 0.052;
    const contentY = top + titleHeight + gap;
    return {
      x: left,
      width: innerWidth,
      titleY: top,
      titleHeight,
      contentY,
      contentHeight: Math.max(1, height - bottom - contentY),
    };
  }

  const exported = {
    SETTINGS_VERSION,
    DEFAULT_GUIDELINES,
    defaultAppSettings,
    normalizeGuidelines,
    normalizeCustomPresets,
    normalizeAppSettings,
    settingsEqual,
    guidelineMarginsFit,
    guidelineGeometry,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  } else {
    globalThis.makepresentationSettings = exported;
  }
})();
