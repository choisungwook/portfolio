'use strict';

function isFormField(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

let copyCount = 0;
let clipboardWrite = Promise.resolve(true);

function clipboardText(shapes) {
  return shapes.map((shape) => shape.text || '').filter(Boolean).join('\n');
}

function writeDesktopShapes(shapes) {
  const snapshot = structuredClone(shapes);
  clipboardWrite = clipboardWrite.then(async () => {
    try {
      const dataUrl = await rasterizeShapes(snapshot);
      await window.api.writeShapeClipboard(JSON.stringify(snapshot), clipboardText(snapshot), dataUrl);
      return true;
    } catch (error) {
      await window.api.message(String(error), { title: 'Cannot copy objects', kind: 'error' });
      return false;
    }
  });
  return clipboardWrite;
}

function copySelection() {
  const shapes = [...state.selection].sort((a, b) => a - b).map((index) => slide().shapes[index]).filter(Boolean);
  if (!shapes.length) return Promise.resolve(false);
  if (window.api.isDesktop) return writeDesktopShapes(shapes);
  const before = copyCount;
  document.execCommand('copy');
  return Promise.resolve(copyCount > before);
}

document.addEventListener('copy', (event) => {
  if (isFormField(event.target) || event.target.isContentEditable) return;
  const shapes = selectedShapes();
  if (!shapes.length) return;
  if (window.api.isDesktop) {
    event.preventDefault();
    void copySelection();
    return;
  }
  if (!event.clipboardData) return;
  event.clipboardData.setData(SHAPE_CLIPBOARD_TYPE, JSON.stringify(shapes));
  event.clipboardData.setData('text/plain', clipboardText(shapes));
  copyCount += 1;
  event.preventDefault();
});

document.addEventListener('cut', (event) => {
  if (isFormField(event.target) || event.target.isContentEditable || !selectedShapes().length) return;
  event.preventDefault();
  void cutSelection();
});

function readFileDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('cannot read clipboard image'));
    reader.readAsDataURL(file);
  });
}

function readImageSize(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('cannot decode clipboard image'));
    image.src = src;
  });
}

function pastedTextShape(text) {
  const shape = L.createShape('text', 80, 80, newShapeStyle('text'));
  shape.text = text.replace(/\r\n/g, '\n');
  fitTextBoxForSlide(shape, shape.text);
  return shape;
}

async function pastedImageShape(file, index) {
  const src = await readFileDataUrl(file);
  const size = await readImageSize(src);
  const slideDimensions = deckSize();
  const scale = Math.min(
    1,
    (slideDimensions.width * 0.8) / size.width,
    (slideDimensions.height * 0.8) / size.height
  );
  const shape = L.createShape('image', 0, 0, newShapeStyle('image'));
  shape.w = Math.max(1, size.width * scale);
  shape.h = Math.max(1, size.height * scale);
  shape.x = (slideDimensions.width - shape.w) / 2 + index * PASTE_OFFSET;
  shape.y = (slideDimensions.height - shape.h) / 2 + index * PASTE_OFFSET;
  shape.src = src;
  return shape;
}

document.addEventListener('paste', async (event) => {
  if (isFormField(event.target) || event.target.isContentEditable || !event.clipboardData) return;
  const encoded = event.clipboardData.getData(SHAPE_CLIPBOARD_TYPE);
  const text = event.clipboardData.getData('text/plain');
  const itemFiles = Array.from(event.clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile()).filter(Boolean);
  const directFiles = Array.from(event.clipboardData.files || [])
    .filter((file) => file.type.startsWith('image/'));
  const imageFiles = [...new Set([...itemFiles, ...directFiles])];
  event.preventDefault();
  const targetDeck = state.deck;
  const targetSlide = slide();
  try {
    await clipboardWrite;
    const native = window.api.isDesktop ? await window.api.readShapeClipboard() : null;
    const copiedShapes = L.parseClipboardShapes(native || encoded);
    const shapes = copiedShapes.length ? copiedShapes : imageFiles.length
      ? await Promise.all(imageFiles.map(pastedImageShape)) : text ? [pastedTextShape(text)] : [];
    if (state.deck !== targetDeck || slide() !== targetSlide || !shapes.length) return;
    insertShapes(shapes, copiedShapes.length ? PASTE_OFFSET : 0);
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot paste objects', kind: 'error' });
  }
});

async function cutSelection() {
  const targetDeck = state.deck;
  const targetSlide = slide();
  const originals = selectedShapes().filter((shape) => !shape.locked);
  const snapshots = new Map(originals.map((shape) => [shape, JSON.stringify(shape)]));
  if (!(await copySelection()) || !originals.length) return;
  if (state.deck !== targetDeck || !state.deck.slides.includes(targetSlide)) return;
  targetSlide.shapes = targetSlide.shapes.filter((shape) => !originals.includes(shape) || shape.locked || JSON.stringify(shape) !== snapshots.get(shape));
  clearSelection();
  markDirty();
  renderAll();
}

// Cmd+D duplicates the selected shape, or the whole slide when nothing on it
// is selected. Same split PowerPoint makes.
function duplicateSelection() {
  const shapes = selectedShapes();
  if (shapes.length) {
    insertShapes(shapes, PASTE_OFFSET);
    return;
  }
  state.current = L.duplicateSlide(state.deck, state.current);
  setSlideSelection([state.current]);
  markDirty();
  renderAll();
}

// --- context menu and image export ------------------------------------------
