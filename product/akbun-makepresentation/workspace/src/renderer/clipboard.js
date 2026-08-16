'use strict';

function isFormField(target) {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLSelectElement ||
    target instanceof HTMLTextAreaElement;
}

document.addEventListener('copy', (event) => {
  if (isFormField(event.target)) return;
  const shapes = selectedShapes();
  if (shapes.length === 0 || !event.clipboardData) return;
  event.clipboardData.setData(SHAPE_CLIPBOARD_TYPE, JSON.stringify(shapes));
  const text = shapes
    .filter((shape) => shape.kind === 'text' || shape.kind === 'code')
    .map((shape) => shape.text)
    .join('\n');
  if (text) event.clipboardData.setData('text/plain', text);
  event.preventDefault();
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
  if (isFormField(event.target) || !event.clipboardData) return;

  const encoded = event.clipboardData.getData(SHAPE_CLIPBOARD_TYPE);
  const copiedShapes = L.parseClipboardShapes(encoded);
  if (copiedShapes.length) {
    event.preventDefault();
    insertShapes(copiedShapes, PASTE_OFFSET);
    return;
  }

  const itemFiles = Array.from(event.clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean);
  const directFiles = Array.from(event.clipboardData.files || [])
    .filter((file) => file.type.startsWith('image/'));
  const imageFiles = [...new Set([...itemFiles, ...directFiles])];
  if (imageFiles.length) {
    event.preventDefault();
    try {
      const shapes = await Promise.all(imageFiles.map(pastedImageShape));
      insertShapes(shapes, 0);
    } catch (error) {
      await window.api.message(String(error), { title: 'Cannot paste image', kind: 'error' });
    }
    return;
  }

  const text = event.clipboardData.getData('text/plain');
  if (text) {
    event.preventDefault();
    insertShapes([pastedTextShape(text)], 0);
  }
});

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
