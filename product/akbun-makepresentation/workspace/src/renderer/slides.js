'use strict';

function selectAdjacentSlide(direction) {
  const next = Math.max(0, Math.min(state.current + direction, state.deck.slides.length - 1));
  if (next !== state.current) {
    state.current = next;
    setSlideSelection([next]);
    clearSelection();
    renderAll();
  }
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.focus();
}

$('thumbs').addEventListener('click', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  const index = Number(thumb.dataset.slide);
  if (event.shiftKey) {
    const from = Math.min(state.current, index);
    const to = Math.max(state.current, index);
    setSlideSelection(Array.from({ length: to - from + 1 }, (_, offset) => from + offset));
    state.current = index;
  } else if (event.metaKey || event.ctrlKey) {
    const selected = new Set(state.slideSelection);
    if (selected.has(index) && selected.size > 1) selected.delete(index);
    else selected.add(index);
    setSlideSelection([...selected]);
    state.current = state.slideSelection.includes(index)
      ? index
      : state.slideSelection[state.slideSelection.length - 1];
  } else {
    state.current = index;
    setSlideSelection([index]);
  }
  clearSelection();
  renderAll();
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.focus();
});

$('slides').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, [data-slide]')) return;
  $('slides').focus({ preventScroll: true });
});

$('stage').addEventListener('pointerdown', (event) => {
  if (event.target === textEditor || event.target === canvas || canvas.contains(event.target)) return;
  $('stage').focus({ preventScroll: true });
});

$('props').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button, input, select, textarea')) return;
  $('props').focus({ preventScroll: true });
});

// --- slide reorder -------------------------------------------------------
//
// Drag and drop in the panel, and Cmd+Up/Down for the same move from the
// keyboard. Both land in moveSlide, so the two cannot disagree about where a
// slide ends up.

function moveCurrentSlide(to) {
  const at = L.moveSlide(state.deck, state.current, to);
  if (at === state.current) return;
  state.current = at;
  setSlideSelection([at]);
  clearSelection();
  markDirty();
  renderAll();
}

function moveCurrentSlideAtEdge(target, edge) {
  const at = L.moveSlideAtEdge(state.deck, state.current, target, edge);
  if (at === state.current) return;
  state.current = at;
  setSlideSelection([at]);
  clearSelection();
  markDirty();
  renderAll();
}

function moveSelectedSlides(direction) {
  const currentSlide = slide();
  const before = selectedSlideIndices();
  const moved = L.moveSlideSelection(state.deck, before, direction);
  if (moved.every((index, offset) => index === before[offset])) return;
  state.current = state.deck.slides.indexOf(currentSlide);
  setSlideSelection(moved);
  clearSelection();
  markDirty();
  renderAll();
}

let dragSlideFrom = -1;
let dragSlideEdge = 'before';

$('thumbs').addEventListener('dragstart', (event) => {
  const thumb = event.target.closest('[data-slide]');
  if (!thumb) return;
  dragSlideFrom = Number(thumb.dataset.slide);
  state.current = dragSlideFrom;
  setSlideSelection([dragSlideFrom]);
  event.dataTransfer.effectAllowed = 'move';
  // Firefox refuses to start a drag without payload, and the index is already
  // in dragSlideFrom, so this is only there to make the drag legal.
  event.dataTransfer.setData('text/plain', String(dragSlideFrom));
});

$('thumbs').addEventListener('dragover', (event) => {
  if (dragSlideFrom < 0) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const thumb = event.target.closest('[data-slide]');
  for (const element of $('thumbs').querySelectorAll('.thumb')) {
    element.classList.remove('drop-before', 'drop-after');
  }
  if (thumb) {
    const bounds = thumb.getBoundingClientRect();
    dragSlideEdge = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after';
    thumb.classList.add(`drop-${dragSlideEdge}`);
  }
});

$('thumbs').addEventListener('dragleave', (event) => {
  event.target.closest('[data-slide]')?.classList.remove('drop-before', 'drop-after');
});

$('thumbs').addEventListener('drop', (event) => {
  const thumb = event.target.closest('[data-slide]');
  event.preventDefault();
  const from = dragSlideFrom;
  endSlideDrag();
  if (from < 0 || !thumb) return;
  state.current = from;
  moveCurrentSlideAtEdge(Number(thumb.dataset.slide), dragSlideEdge);
});

function endSlideDrag() {
  dragSlideFrom = -1;
  for (const element of $('thumbs').querySelectorAll('.drop-before, .drop-after')) {
    element.classList.remove('drop-before', 'drop-after');
  }
}

$('thumbs').addEventListener('dragend', endSlideDrag);

function addSlideAtEnd() {
  state.current = L.addSlide(state.deck, state.deck.slides.length - 1);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
  $('thumbs').querySelector(`[data-slide="${state.current}"]`)?.scrollIntoView({ block: 'nearest' });
}

$('btn-add-slide').addEventListener('click', () => {
  state.current = L.addSlide(state.deck, state.current);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
});

// An empty slide goes without asking; one with work on it does not. Same
// answer whether the delete came from the button or from Backspace in the
// panel.
async function deleteCurrentSlide() {
  const indices = selectedSlideIndices();
  const hasContent = indices.some((index) => state.deck.slides[index]?.shapes.length);
  if (hasContent) {
    const message = indices.length === 1
      ? `Delete slide ${indices[0] + 1}?`
      : `Delete ${indices.length} selected slides?`;
    const sure = await window.api.ask(message, {
      title: 'Delete Slide',
      kind: 'warning',
    });
    if (!sure) return;
  }
  for (const index of [...indices].sort((left, right) => right - left)) {
    state.deck.slides.splice(index, 1);
  }
  if (state.deck.slides.length === 0) state.deck.slides.push(L.createSlide());
  state.current = Math.min(indices[0] || 0, state.deck.slides.length - 1);
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
}

$('btn-del-slide').addEventListener('click', deleteCurrentSlide);
$('btn-slide-up').addEventListener('click', () => moveSelectedSlides(-1));
$('btn-slide-down').addEventListener('click', () => moveSelectedSlides(1));
