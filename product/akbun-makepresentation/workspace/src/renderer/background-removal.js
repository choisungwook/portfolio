'use strict';

// Remove Background for raster pictures: decode to pixels, let the pure
// L.removeBackground clear what is connected to the border, and store the
// result as a PNG so the alpha survives. SVG pictures are vector and have no
// background pixels to clear, so they never get the item.

const RASTER_DATA_URL = /^data:image\/(png|jpeg|webp|gif|bmp);base64,/i;
// Bounds the pixel buffer: 4096 x 4096 x 4 bytes is 64 MB.
const MAX_MATTE_SIDE = 4096;

function canRemoveBackground(shape) {
  return shape.kind === 'image' && !shape.locked && RASTER_DATA_URL.test(shape.src || '');
}

// The status line is the app's only non-blocking message area, so a notice
// borrows it for a moment instead of opening an alert.
function showStatusNotice(text) {
  $('doc-status').textContent = text;
  setTimeout(updateTitle, 3000);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('cannot decode image'));
    image.src = src;
  });
}

// One frame, so the busy cursor is painted before the heavy loop blocks the
// page. The timer is the fallback for a hidden window, where frames never run.
function nextFrame() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 50);
    requestAnimationFrame(() => {
      clearTimeout(timer);
      setTimeout(resolve, 0);
    });
  });
}

async function removeBackgroundOfShape(shape) {
  if (!canRemoveBackground(shape)) return;
  const source = shape.src;
  canvas.style.cursor = 'progress';
  try {
    await nextFrame();
    const image = await loadImage(source);
    const scale = Math.min(1, MAX_MATTE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const raster = document.createElement('canvas');
    raster.width = Math.max(1, Math.round(image.naturalWidth * scale));
    raster.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = raster.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, raster.width, raster.height);
    const pixels = context.getImageData(0, 0, raster.width, raster.height);
    const { removed } = L.removeBackground(pixels.data, raster.width, raster.height);
    // The shape can be deleted, or its picture replaced, while the pixels were
    // being worked on.
    if (shape.src !== source || !state.deck.slides.some((target) => target.shapes.includes(shape))) return;
    if (removed === 0) {
      showStatusNotice('No background found to remove');
      return;
    }
    context.putImageData(pixels, 0, 0);
    // Crop, size, rotation and comment stay as they are; only the pixels change.
    shape.src = raster.toDataURL('image/png');
    markDirty();
    renderAll();
  } catch (error) {
    console.error('Cannot remove background', error);
    showStatusNotice('Could not remove the background');
  } finally {
    canvas.style.cursor = '';
  }
}

$('context-remove-bg').addEventListener('click', () => {
  hideContextMenu();
  const shape = selectedShape();
  if (shape && state.selection.length === 1) void removeBackgroundOfShape(shape);
});
