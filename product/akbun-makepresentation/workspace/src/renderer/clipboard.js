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

const MAX_IMAGE_FILE_BYTES = 10_000_000;
const IMAGE_MIME_BY_EXTENSION = Object.freeze({
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  svg: 'image/svg+xml', webp: 'image/webp', bmp: 'image/bmp',
});

function imageFileMime(file) {
  const mime = String(file.type || '').toLowerCase();
  if (Object.values(IMAGE_MIME_BY_EXTENSION).includes(mime)) return mime;
  if (mime && mime !== 'application/octet-stream') return null;
  return IMAGE_MIME_BY_EXTENSION[String(file.name || '').split('.').pop().toLowerCase()] || null;
}

function readFileDataUrl(file) {
  const mime = imageFileMime(file);
  if (!mime) return Promise.reject(new Error('Unsupported image format.'));
  if (file.size > MAX_IMAGE_FILE_BYTES) return Promise.reject(new Error('Image files must be 10 MB or smaller.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const encoded = String(reader.result).split('base64,')[1];
      if (!encoded) reject(new Error('cannot read image data'));
      else resolve(`data:${mime};base64,${encoded}`);
    };
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
  return imageShapeFromSource(src, index);
}

async function imageShapeFromSource(src, index) {
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

function imageDropPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) return null;
  return toPoint({ clientX, clientY });
}

async function insertDroppedImages(sources, point, targetDeck, targetSlide) {
  if (!point || !sources.length) return;
  try {
    const shapes = await Promise.all(sources.map((source, index) => imageShapeFromSource(source, index)));
    if (state.deck !== targetDeck || slide() !== targetSlide) return;
    for (const shape of shapes) {
      shape.x = Math.max(0, Math.min(deckSize().width - shape.w, point.x - shape.w / 2));
      shape.y = Math.max(0, Math.min(deckSize().height - shape.h, point.y - shape.h / 2));
    }
    insertShapes(shapes, 0);
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot import image', kind: 'error' });
  }
}

canvas.addEventListener('dragover', (event) => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'copy';
});

canvas.addEventListener('drop', (event) => {
  if (!event.dataTransfer?.files.length) return;
  event.preventDefault();
  const point = imageDropPoint(event.clientX, event.clientY);
  if (!point) return;
  const targetDeck = state.deck;
  const targetSlide = slide();
  const files = [...event.dataTransfer.files].filter(imageFileMime);
  void Promise.all(files.map(readFileDataUrl)).then(
    (sources) => insertDroppedImages(sources, point, targetDeck, targetSlide),
    (error) => window.api.message(String(error), { title: 'Cannot import image', kind: 'error' })
  );
});

void window.api.onImageFilesDropped(async ({ paths, position }) => {
  const point = imageDropPoint(position.x / window.devicePixelRatio, position.y / window.devicePixelRatio);
  if (!point) return;
  const targetDeck = state.deck;
  const targetSlide = slide();
  const images = paths.filter((path) => /\.(png|jpe?g|gif|svg|webp|bmp)$/i.test(path));
  try {
    const sources = await Promise.all(images.map(window.api.readImageFile));
    await insertDroppedImages(sources, point, targetDeck, targetSlide);
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot import image', kind: 'error' });
  }
}).catch((error) => window.api.message(String(error), { title: 'Cannot enable image drop', kind: 'error' }));

document.addEventListener('paste', async (event) => {
  if (isFormField(event.target) || event.target.isContentEditable || !event.clipboardData) return;
  const encoded = event.clipboardData.getData(SHAPE_CLIPBOARD_TYPE);
  const text = event.clipboardData.getData('text/plain');
  const itemFiles = Array.from(event.clipboardData.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile()).filter(Boolean);
  const directFiles = Array.from(event.clipboardData.files || [])
    .filter(imageFileMime);
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
