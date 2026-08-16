'use strict';

function canEditText(shape) {
  return !!shape && (shape.kind === 'text' || L.TEXTUAL.has(shape.kind));
}

function styleTextEditor(shape) {
  if (!shape) return;
  const scale = canvas.getBoundingClientRect().width / deckSize().width;
  // The same inset the glyphs are drawn at, so text does not jump sideways
  // when editing starts inside a rect or an ellipse.
  const box = L.textBox(shape);
  const lines = L.wrapTextLines(textEditor.value, box.w, shape.fontSize).length;
  // The overlay has to be anchored the way the glyphs it hides are, or text
  // inside a shape is typed at the top of the box and jumps to the middle the
  // moment editing ends. A textarea cannot anchor its own content, so the box
  // is shrunk to the text and placed where that text belongs.
  const block = Math.max(1, lines) * shape.fontSize * 1.3;
  const anchored = shape.verticalAlign === 'center'
    ? Math.max(0, (box.h - block) / 2)
    : shape.verticalAlign === 'bottom'
    ? Math.max(0, box.h - block)
    : 0;
  textEditor.style.left = `${box.x * scale}px`;
  textEditor.style.top = `${(box.y + anchored) * scale}px`;
  textEditor.style.width = `${Math.max(box.w, 1) * scale}px`;
  textEditor.style.height = `${(shape.verticalAlign === 'top' ? Math.max(box.h, block) : block) * scale}px`;
  textEditor.style.fontSize = `${shape.fontSize * scale}px`;
  textEditor.style.fontFamily = `"${shape.fontFamily || S.DEFAULT_FONT_FAMILY}", sans-serif`;
  textEditor.style.color = shape.textColor;
  textEditor.style.fontWeight = shape.bold ? '700' : '400';
  textEditor.style.fontStyle = shape.italic ? 'italic' : 'normal';
  textEditor.style.textDecoration = shape.underline ? 'underline' : 'none';
  textEditor.style.textAlign = shape.textAlign || 'left';
}

// `seed` is the character that opened the box by being typed while the shape
// was selected. It is the first thing in the box, not a replacement for what
// is already there.
function startTextEdit(index, seed) {
  const shape = slide().shapes[index];
  textEditBefore = structuredClone(shape);
  state.editingIndex = index;
  renderCanvas();

  textEditor.value = seed ? shape.text + seed : shape.text;
  if (seed && shape.kind === 'text') fitTextBoxForSlide(shape, textEditor.value);
  styleTextEditor(shape);
  textEditor.hidden = false;
  // Deferred so it wins over whatever focus change the triggering click
  // still has queued.
  setTimeout(() => {
    textEditor.focus();
    textEditor.setSelectionRange(textEditor.value.length, textEditor.value.length);
  }, 0);
}

function commitTextEdit() {
  if (state.editingIndex < 0) return;
  const index = state.editingIndex;
  const shape = slide().shapes[index];
  const before = textEditBefore;
  textEditBefore = null;
  state.editingIndex = -1;
  textEditor.hidden = true;

  // The shape can be gone by now: an undo, or a delete that reached the page
  // while the overlay was open. There is nothing to commit into, and reading
  // through it would take the whole page down.
  if (!shape) {
    clearSelection();
    renderAll();
    return;
  }

  // Both answers are needed before the shape is touched. Asking afterwards
  // compares the new text with itself, which is never a change, and then an
  // edit reaches neither the undo history nor the dirty marker.
  const text = textEditor.value.replace(/\s+$/, '');
  // Emptying a text box removes it, because the box is nothing but its text.
  // Emptying the text in a rect leaves the rect: the outline is the object
  // and the text was only something written on it.
  const removed = text === '' && shape.kind === 'text';
  const changed = !removed && text !== shape.text;

  if (removed) {
    slide().shapes.splice(index, 1);
    clearSelection();
  } else if (changed && L.TEXTUAL.has(shape.kind)) {
    shape.text = text;
  } else if (changed) {
    shape.text = text;
    fitTextBoxForSlide(shape, text);
  } else if (before && shape.kind === 'text') {
    shape.w = before.w;
    shape.h = before.h;
  }
  if (removed || changed) markDirty();
  renderAll();
}

textEditor.addEventListener('blur', commitTextEdit);
textEditor.addEventListener('input', () => {
  const shape = slide().shapes[state.editingIndex];
  if (!shape || shape.kind !== 'text') return;
  fitTextBoxForSlide(shape, textEditor.value);
  styleTextEditor(shape);
  renderCanvas();
});
textEditor.addEventListener('keydown', (event) => {
  // The document handler must not see plain typing: every letter is a tool
  // shortcut out there. Formatting and zoom are the exceptions, handled here
  // so Cmd+B works mid-sentence like it does in any other editor.
  event.stopPropagation();
  if (event.key === 'Escape') {
    textEditor.blur();
    return;
  }
  if (!(event.metaKey || event.ctrlKey)) return;
  const style = TEXT_STYLE_KEYS[event.key.toLowerCase()];
  if (style) {
    toggleTextStyle(style);
    event.preventDefault();
  } else if (handleZoomKey(event.key)) {
    event.preventDefault();
  }
});

// --- keyboard ------------------------------------------------------------------------

const TOOL_KEYS = { v: 'select', r: 'rect', o: 'ellipse', l: 'line', a: 'arrow', p: 'pen', t: 'text' };

document.addEventListener('keydown', (event) => {
  if (settingsDialog.open || slideSizeDialog.open || codeDialog.open || guidelinesDialog.open) return;
  if (event.key === 'Escape' && (!backgroundMenu.hidden || !codeBlockMenu.hidden)) {
    hideToolbarPopovers();
    event.preventDefault();
    return;
  }
  if (!presetMenu.hidden && event.key === 'Escape') {
    hidePresetMenu();
    event.preventDefault();
    return;
  }
  if (!fontMenu.hidden && event.key === 'Escape') {
    hideFontMenu();
    event.preventDefault();
    return;
  }
  if (!contextMenu.hidden && event.key === 'Escape') {
    hideContextMenu();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape' && [...document.querySelectorAll('.menu-panel')].some((panel) => !panel.hidden)) {
    hideMenus();
    event.preventDefault();
    return;
  }
  if (state.presenting) {
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') presentStep(1);
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') presentStep(-1);
    else if (event.key === 'Escape') exitPresent();
    event.preventDefault();
    return;
  }

  // A text box open for editing owns the keyboard, and its own handler below
  // deals with every key it should answer. Reaching here at all means focus
  // slipped off the overlay; without this the shortcuts would run against the
  // box being typed into — Backspace deleting it, a letter switching tools.
  if (state.editingIndex >= 0 && event.target !== textEditor) {
    textEditor.focus();
    event.preventDefault();
    return;
  }

  // Zoom answers even while a field has focus: it is about the view, not
  // about whatever is being typed into.
  if ((event.metaKey || event.ctrlKey) && handleZoomKey(event.key)) {
    event.preventDefault();
    return;
  }

  const target = event.target;
  if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') {
    return;
  }

  // Cmd on macOS, Ctrl elsewhere. event.key is already the unshifted letter
  // for these, so Shift only picks the redo branch.
  if (event.metaKey || event.ctrlKey) {
    const key = event.key.toLowerCase();
    // New and Open used to reach the page as system menu accelerators. With
    // the menus in the window there is no accelerator, so the keys land here.
    if (key === 'a' && slidesHaveFocus()) {
      setSlideSelection(state.deck.slides.map((_, index) => index));
      renderThumbs();
    } else if (key === 'a' && editorHasFocus()) {
      selectMany(slide().shapes.map((_, index) => index));
      renderCanvas();
      renderProps();
    } else if (key === 'n') newDeck();
    else if (key === 'o') openFile();
    else if (key === 's') saveFile(event.shiftKey);
    else if (key === 'z' && event.shiftKey) redo();
    else if (key === 'z') undo();
    else if (key === 'y') redo();
    else if (key === 'c' || key === 'v') return;
    else if (key === 'd') duplicateSelection();
    else if (key === 'arrowup' && slidesHaveFocus()) moveSelectedSlides(-1);
    else if (key === 'arrowdown' && slidesHaveFocus()) moveSelectedSlides(1);
    else if (key === 'arrowup') moveCurrentSlide(state.current - 1);
    else if (key === 'arrowdown') moveCurrentSlide(state.current + 1);
    else if (TEXT_STYLE_KEYS[key]) toggleTextStyle(TEXT_STYLE_KEYS[key]);
    else return;
    event.preventDefault();
    return;
  }

  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (editorHasFocus()) deleteSelectedShape();
    else deleteCurrentSlide();
    event.preventDefault();
    return;
  }
  if (event.key === 'Escape') {
    clearSelection();
    renderCanvas();
    renderProps();
    return;
  }
  if (slidesHaveFocus() && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    selectAdjacentSlide(event.key === 'ArrowUp' ? -1 : 1);
    event.preventDefault();
    return;
  }
  if (event.key.startsWith('Arrow')) {
    const shapes = selectedShapes();
    if (shapes.length === 0) return;
    const step = event.shiftKey ? 10 : 1;
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
    for (const shape of shapes) L.moveShape(shape, dx, dy);
    markDirty();
    renderCanvas();
    event.preventDefault();
    return;
  }
  // Typing over a selected shape starts writing in it, the way it does in
  // PowerPoint. That costs the tool shortcuts while such a shape is selected;
  // Escape drops the selection and gives them back.
  if (
    state.selection.length === 1 &&
    canEditText(selectedShape()) &&
    event.key.length === 1 &&
    event.key !== ' '
  ) {
    event.preventDefault();
    startTextEdit(state.selected, event.key);
    return;
  }

  const tool = TOOL_KEYS[event.key.toLowerCase()];
  if (tool) setTool(tool);
});
