'use strict';

function shapeIndexAtPointer(event, group) {
  const index = group ? Number(group.dataset.i) : -1;
  if (!slide().shapes[index]?.locked) return index;
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    const candidate = element.closest('#canvas g[data-i]');
    if (candidate && !slide().shapes[Number(candidate.dataset.i)]?.locked) {
      return Number(candidate.dataset.i);
    }
  }
  return index;
}

// Alt+click walks down the stack under the pointer: the unlocked shape just
// below the selected one, wrapping to the top. It is how a shape that is
// fully covered gets picked without moving what covers it.
function nextShapeUnderPointer(event, fallback) {
  const stack = [];
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    const index = Number(element.closest('#canvas g[data-i]')?.dataset.i);
    if (Number.isInteger(index) && !slide().shapes[index]?.locked && !stack.includes(index)) stack.push(index);
  }
  if (!stack.length) return fallback;
  const at = stack.indexOf(state.selected);
  return stack[at < 0 || at === stack.length - 1 ? 0 : at + 1];
}

// Shift over empty space keeps what is selected and adds to it. Clearing
// instead is what made a missed Shift-click throw the selection away.
function startMarquee(event, p) {
  const additive = event.shiftKey && !(event.metaKey || event.ctrlKey);
  if (!additive) clearSelection();
  state.drag = {
    mode: 'marquee',
    x0: p.x,
    y0: p.y,
    x1: p.x,
    y1: p.y,
    contain: event.altKey,
    baseSelection: additive ? [...state.selection] : [],
  };
  canvas.setPointerCapture(event.pointerId);
}

// The selection follows the drag, so the user sees what the area holds before
// letting go instead of guessing and retrying.
function applyMarqueeSelection(drag) {
  const rect = L.normalizeRect(drag.x0, drag.y0, drag.x1, drag.y1);
  // A press that never travelled is a click on empty space, not an area of
  // no size. Handing it to the touch rule would select whichever unfilled
  // shape the pointer happened to be standing inside, so a click meant to
  // deselect would select instead.
  const hits = rect.w > 2 || rect.h > 2
    ? L.shapeIndicesInRect(slide().shapes, rect, { contain: drag.contain })
      .flatMap((index) => L.groupIndicesFor(slide().shapes, index))
    : [];
  selectMany([...drag.baseSelection, ...hits]);
}

// The gray gutter around the slide is empty space too. Pressing there starts
// a marquee, so an area can begin outside the slide and sweep in the shapes
// that touch the slide edge.
$('stage-scroll').addEventListener('pointerdown', (event) => {
  const scroller = event.currentTarget;
  const box = scroller.getBoundingClientRect();
  // The path is fixed at dispatch. The canvas handler runs first and re-renders
  // the svg, which detaches event.target, so closest() would no longer find
  // the canvas and every shape press would also start a marquee.
  const path = event.composedPath();
  if (
    event.button !== 0 || state.tool !== 'select' || path.includes(canvas) || path.includes(textEditor) ||
    // Scrollbars live inside the element's box but outside its client area.
    event.clientX - box.left >= scroller.clientWidth || event.clientY - box.top >= scroller.clientHeight
  ) return;
  if (state.editingIndex >= 0) textEditor.blur();
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  startMarquee(event, toPoint(event));
  renderCanvas();
  renderProps();
});

canvas.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  // A comment badge is a button, not part of the slide: pressing it opens or
  // closes its popover and must not start a marquee or a shape drag. It is
  // handled before any tool or handle logic for that reason.
  const badge = event.target.closest('[data-comment]');
  if (badge) {
    event.preventDefault();
    pressCommentBadge(Number(badge.dataset.comment));
    return;
  }
  const handleEl = event.target.closest('[data-handle]');
  const cropHandle = event.target.closest('[data-crop-handle]');
  const group = event.target.closest('g[data-i]');
  const hitShape = slide().shapes[shapeIndexAtPointer(event, group)];
  if (state.editingIndex >= 0) textEditor.blur();
  // WebKit otherwise starts a native text selection alongside marquee and
  // Shift-click selection. That highlight can extend outside the marquee and
  // makes the editor selection look as if it contains only the last object.
  event.preventDefault();
  canvas.focus({ preventScroll: true });
  const p = toPoint(event);

  if (state.tool === 'text') {
    const shape = L.createShape('text', p.x, p.y, newShapeStyle('text'));
    shape.w = 120;
    shape.h = shape.fontSize * 1.4;
    slide().shapes.push(shape);
    selectOnly(slide().shapes.length - 1);
    setTool('select');
    markDirty();
    renderAll();
    startTextEdit(state.selected);
    return;
  }

  if (state.tool !== 'select') {
    const shape = L.createShape(state.tool, p.x, p.y, newShapeStyle(state.tool));
    slide().shapes.push(shape);
    state.drag = { mode: 'draw', x0: p.x, y0: p.y, index: slide().shapes.length - 1 };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (handleEl && handleEl.dataset.handle === 'rotate' && selectedShape() && !selectedShape().locked) {
    state.drag = {
      mode: 'rotate',
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (handleEl && state.selection.length === 1 && selectedShape() && !selectedShape().locked) {
    state.drag = {
      mode: 'resize',
      handle: handleEl.dataset.handle,
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  if (cropHandle && state.cropping && selectedShape() && !selectedShape().locked) {
    state.drag = {
      mode: 'crop',
      side: cropHandle.dataset.cropHandle,
      from: structuredClone(selectedShape()),
      x0: p.x,
      y0: p.y,
    };
    canvas.setPointerCapture(event.pointerId);
    return;
  }

  let index = hitShape ? slide().shapes.indexOf(hitShape) : selectedShapeIndexAtPoint(p);
  const stackPick = event.altKey && !(event.metaKey || event.ctrlKey) && index >= 0;
  if (stackPick) index = nextShapeUnderPointer(event, index);
  const additive = event.shiftKey && !(event.metaKey || event.ctrlKey);
  if (index >= 0) {

    const secondPress = isSecondPress(index);
    let editOnClick = '';
    if (secondPress && !(event.shiftKey || event.metaKey || event.ctrlKey || event.altKey)) {
      if (slide().shapes[index].kind === 'code') editOnClick = 'code';
      else if (canEditText(slide().shapes[index])) editOnClick = 'text';
    }

    // Shift changes this object's membership, but only on a press that never
    // travels. Deciding that on pointerup instead of here is what lets Shift
    // do both jobs at once: a Shift-drag of a selected line moves it on one
    // axis, and a Shift-click of it still drops it out of the selection.
    const wasSelected = state.selection.includes(index);
    if (additive) {
      if (!wasSelected) selectMany([...state.selection, ...L.groupIndicesFor(slide().shapes, index)]);
    } else if (!wasSelected) {
      selectMany(L.groupIndicesFor(slide().shapes, index));
    }

    // Cmd/Ctrl+drag drags a copy and leaves the original where it was, the
    // way PowerPoint does. Add Shift and the copy travels on one axis.
    const duplicated = (event.metaKey || event.ctrlKey) && !slide().shapes[index].locked;
    const originalSelection = [...state.selection];
    if (duplicated) {
      const copies = L.cloneShapes(selectedShapes().filter((shape) => !shape.locked));
      const first = slide().shapes.length;
      slide().shapes.push(...copies);
      selectMany(copies.map((_, offset) => first + offset));
    }
    state.drag = {
      mode: 'move',
      items: state.selection.filter((selectedIndex) =>
        !slide().shapes[index].locked && !slide().shapes[selectedIndex].locked
      ).map((selectedIndex) => ({
        index: selectedIndex,
        from: structuredClone(slide().shapes[selectedIndex]),
      })),
      x0: p.x,
      y0: p.y,
      moved: false,
      duplicated,
      originalSelection,
      editOnClick,
      editIndex: index,
      // Only an already-selected object can be dropped by a Shift-click. One
      // that was just added by the same press has to stay.
      toggleIndex: additive && wasSelected ? index : -1,
    };
    canvas.setPointerCapture(event.pointerId);
  } else {
    startMarquee(event, p);
  }
  renderCanvas();
  renderProps();
});

canvas.addEventListener('pointermove', (event) => {
  const drag = state.drag;
  if (!drag) return;
  const p = toPoint(event);
  const dx = p.x - drag.x0;
  const dy = p.y - drag.y0;

  if (drag.mode === 'draw') {
    L.dragShape(slide().shapes[drag.index], drag.x0, drag.y0, p.x, p.y, event.shiftKey);
  } else if (drag.mode === 'marquee') {
    drag.x1 = p.x;
    drag.y1 = p.y;
    drag.contain = event.altKey;
    applyMarqueeSelection(drag);
  } else if (drag.mode === 'resize') {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    const resize = event.shiftKey ? L.resizeShapeConstrained : L.resizeShape;
    const delta = L.unrotateDelta(dx, dy, drag.from.rotation);
    resize(shape, drag.from, drag.handle, delta.x, delta.y);
  } else if (drag.mode === 'rotate') {
    const shape = selectedShape();
    if (!shape) return;
    shape.rotation = L.rotationTowards(drag.from, p.x, p.y, event.shiftKey);
  } else if (drag.mode === 'crop') {
    const shape = selectedShape();
    if (!shape) return;
    Object.assign(shape, structuredClone(drag.from));
    const delta = L.unrotateDelta(dx, dy, drag.from.rotation);
    const fraction = drag.side === 'left' || drag.side === 'right'
      ? delta.x / shape.w
      : delta.y / shape.h;
    const base = drag.side === 'left' ? drag.from.cropLeft : drag.side === 'right' ? drag.from.cropRight :
      drag.side === 'top' ? drag.from.cropTop : drag.from.cropBottom;
    L.setCrop(shape, drag.side, base + ((drag.side === 'left' || drag.side === 'top') ? fraction : -fraction));
  } else if (drag.mode === 'move') {
    // Shift keeps the move on whichever axis has travelled further.
    const straight = event.shiftKey;
    const mx = straight && Math.abs(dx) <= Math.abs(dy) ? 0 : dx;
    const my = straight && Math.abs(dx) > Math.abs(dy) ? 0 : dy;
    for (const item of drag.items) {
      const shape = slide().shapes[item.index];
      Object.assign(shape, structuredClone(item.from));
    }
    const rect = canvas.getBoundingClientRect();
    const threshold = rect.width > 0 ? 8 * deckSize().width / rect.width : 0;
    const snapped = appSettings.snapping.enabled
      ? L.snapMove(slide().shapes, drag.items.map((item) => item.index), mx, my, threshold)
      : { dx: mx, dy: my, vertical: null, horizontal: null };
    if (straight && mx === 0) Object.assign(snapped, { dx: 0, vertical: null });
    if (straight && my === 0) Object.assign(snapped, { dy: 0, horizontal: null });
    drag.snap = snapped;
    for (const item of drag.items) L.moveShape(slide().shapes[item.index], snapped.dx, snapped.dy);
    drag.moved = drag.moved || mx !== 0 || my !== 0;
  }
  renderCanvas();
});

canvas.addEventListener('pointerup', () => {
  const drag = state.drag;
  if (!drag) return;
  state.drag = null;

  if (drag.mode === 'draw') {
    const shapes = slide().shapes;
    if (L.isDegenerate(shapes[drag.index])) {
      shapes.splice(drag.index, 1);
    } else {
      selectOnly(drag.index);
      markDirty();
    }
    setTool('select');
  } else if (drag.mode === 'marquee') {
    applyMarqueeSelection(drag);
  } else if (drag.mode === 'move' && !drag.moved && drag.editOnClick) {
    selectOnly(drag.editIndex);
    renderCanvas();
    renderProps();
    if (drag.editOnClick === 'code') openCodeDialog(drag.editIndex, false);
    else startTextEdit(drag.editIndex);
    return;
  } else if (drag.mode === 'move' && !drag.moved && drag.toggleIndex >= 0) {
    // A Shift-press that never moved: the click half of Shift-click.
    selectMany(L.toggleSelection(state.selection, drag.toggleIndex, slide().shapes.length));
  } else if (drag.mode === 'resize' || drag.mode === 'rotate' || drag.mode === 'crop' || (drag.moved && drag.items.length)) {
    markDirty();
  } else if (drag.duplicated) {
    // A Cmd+click that never moved keeps the original selection. The copies
    // made on pointerdown have nowhere useful to sit on top of the originals.
    slide().shapes.splice(slide().shapes.length - drag.items.length, drag.items.length);
    selectMany(drag.originalSelection);
  }
  renderAll();
});


// --- text editing -----------------------------------------------------------------

// The overlay has to look like the glyphs it hides, or every text box jumps
// the moment editing starts or ends. A missing shape means the box being
// edited is already gone, the same case commitTextEdit guards against.
// A text box, and any shape that draws text inside its own outline.
