'use strict';


// --- file operations -----------------------------------------------------------------------

async function confirmDiscard() {
  if (!state.dirty) return true;
  return window.api.ask('Discard unsaved changes?', {
    title: 'Unsaved changes',
    kind: 'warning',
  });
}

async function newDeck() {
  if (!(await confirmDiscard())) return;
  state.deck = L.createDeck();
  state.current = 0;
  setSlideSelection([0]);
  clearSelection();
  state.filePath = null;
  state.dirty = false;
  resetHistory();
  renderAll();
}

async function openFile() {
  if (!(await confirmDiscard())) return;
  const path = await window.api.pickOpen();
  if (!path) return;
  try {
    state.deck = await window.api.openDeck(path);
    state.current = 0;
    setSlideSelection([0]);
    clearSelection();
    state.filePath = path;
    state.dirty = false;
    // The number flag has nowhere to live in a .pptx, so an opened file
    // starts with it off; any numbers baked in on save are plain text boxes.
    state.showNumbers = false;
    resetHistory();
    renderAll();
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot open file', kind: 'error' });
  }
}

function suggestName(extension) {
  if (!state.filePath) return `deck.${extension}`;
  const base = state.filePath.split('/').pop().split('\\').pop();
  return base.replace(/\.pptx$/i, '') + '.' + extension;
}

// pptx has no field for "show slide numbers", so the number goes into the
// file as a real text box on each slide, which is what PowerPoint would show
// anyway.
function utf8Base64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function codeShapeDataUrl(shape) {
  const box = L.shapeBBox(shape);
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${Math.max(1, box.w)} ${Math.max(1, box.h)}">` +
    `${L.renderShapeSvg(shape)}</svg>`;
  return `data:image/svg+xml;base64,${utf8Base64(svg)}`;
}

function deckForSave() {
  const hasCode = state.deck.slides.some(
    (target) => target.shapes.some((shape) => shape.kind === 'code')
  );
  if (!state.showNumbers && !hasCode) return state.deck;
  const copy = structuredClone(state.deck);
  for (const target of copy.slides) {
    for (const shape of target.shapes) {
      if (shape.kind === 'code') shape.src = codeShapeDataUrl(shape);
    }
  }
  const { width, height } = deckSize();
  if (state.showNumbers) {
    copy.slides.forEach((s, i) => s.shapes.push(L.slideNumberShape(i + 1, width, height)));
  }
  return copy;
}

async function saveFile(alwaysAsk) {
  let path = state.filePath;
  if (alwaysAsk || !path) {
    path = await window.api.pickSave(suggestName('pptx'), 'pptx');
    if (!path) return;
  }
  try {
    await window.api.saveDeck(path, deckForSave());
    state.filePath = path;
    state.dirty = false;
    updateTitle();
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot save', kind: 'error' });
  }
}

function slideRasterSize() {
  const { width, height } = deckSize();
  const scale = Math.min(1.5, 4096 / width, 4096 / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function rasterizeSlideCanvas(s, number) {
  return new Promise((resolve, reject) => {
    const slideDimensions = deckSize();
    const rasterSize = slideRasterSize();
    const svg = L.renderSlideSvg(s, { ...slideDimensions, number });
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    const image = new Image();
    image.onload = () => {
      const raster = document.createElement('canvas');
      raster.width = rasterSize.width;
      raster.height = rasterSize.height;
      const context = raster.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        reject(new Error('cannot create slide canvas'));
        return;
      }
      context.drawImage(image, 0, 0, raster.width, raster.height);
      URL.revokeObjectURL(url);
      resolve(raster);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot render slide'));
    };
    image.src = url;
  });
}

async function rasterizeSlideForPdf(s, number) {
  const raster = await rasterizeSlideCanvas(s, number);
  return {
    dataUrl: raster.toDataURL('image/jpeg', 0.92),
    width: raster.width,
    height: raster.height,
  };
}

async function exportPdf() {
  const path = await window.api.pickSave(suggestName('pdf'), 'pdf');
  if (!path) return;
  try {
    const pages = [];
    for (const [i, s] of state.deck.slides.entries()) {
      pages.push(await rasterizeSlideForPdf(s, state.showNumbers ? i + 1 : 0));
    }
    await window.api.exportPdf(path, pages);
    await window.api.message('PDF saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Export failed', kind: 'error' });
  }
}

function suggestSlideImageName() {
  const base = suggestName('pptx').replace(/\.pptx$/i, '');
  return `${base}-slide-${state.current + 1}.png`;
}

async function exportPng() {
  const path = await window.api.pickSave(suggestSlideImageName(), 'png');
  if (!path) return;
  try {
    const raster = await rasterizeSlideCanvas(
      slide(),
      state.showNumbers ? state.current + 1 : 0
    );
    await window.api.savePng(path, raster.toDataURL('image/png'));
    await window.api.message('PNG saved.', { title: 'akbun-makepresentation' });
  } catch (error) {
    await window.api.message(String(error), { title: 'Export failed', kind: 'error' });
  }
}

// --- presentation mode ------------------------------------------------------------------------
