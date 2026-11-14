'use strict';

// Comments: one plain-text note per shape. A comment shows as a badge in the
// editor canvas only. Thumbnails, presentation mode, PDF/PNG export and the
// picture sent to the AI panel all render through L.renderSlideSvg, which
// never draws them. Badges are drawn by renderCanvas alone.

const commentPopover = $('comment-popover');
const commentText = $('comment-text');
const commentDelete = $('comment-delete');
// The shape being edited (not its index, so a reorder cannot retarget it) and
// the text it had when the editor opened.
let commentEditing = null;

const BADGE_PX = 18;
const BADGE_GAP_PX = 3;

// The comment badge sits on top of the slide, so its colours follow the
// slide's own background, not the app theme. 0.18 is where black and white
// text contrast equally against a colour. Anything that is not a hex colour
// is treated as light.
function isDarkColor(color) {
  const match = /^#([0-9a-f]{3,8})$/i.exec(String(color || '').trim());
  if (!match || ![3, 4, 6, 8].includes(match[1].length)) return false;
  const hex = match[1].length <= 4 ? [...match[1]].map((c) => c + c).join('') : match[1];
  const linear = (at) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(0) + 0.7152 * linear(2) + 0.0722 * linear(4) < 0.18;
}

// Slide units per screen pixel, from the same scale the selection handles use,
// so a badge stays BADGE_PX on screen at every zoom.
function commentBadgeBox(shape) {
  const unit = handleUnits() / 8;
  const size = BADGE_PX * unit;
  const { width, height } = deckSize();
  const b = L.visualShapeBBox(shape);
  // Just outside the top-left corner, kept on the slide so a shape at the
  // edge still has a badge that can be reached.
  return {
    x: Math.max(0, Math.min(width - size, b.x - size - BADGE_GAP_PX * unit)),
    y: Math.max(0, Math.min(height - size, b.y - size - BADGE_GAP_PX * unit)),
    size,
    unit,
  };
}

// Markup carries only the numeric index: the comment text never reaches HTML
// or SVG.
function commentBadgesSvg() {
  if (!state.showComments) return '';
  const tone = isDarkColor(L.slideBackground(slide())) ? 'on-dark' : 'on-light';
  return slide().shapes.map((shape, i) => {
    if (!shape.comment) return '';
    const box = commentBadgeBox(shape);
    const open = commentEditing?.shape === shape;
    return (
      `<g class="comment-badge ${tone}${open ? ' selected' : ''}" data-comment="${i}" transform="translate(${box.x} ${box.y})">` +
      `<rect width="${box.size}" height="${box.size}" rx="${box.size * 0.25}" stroke-width="${(open ? 2.5 : 1) * box.unit}"/>` +
      `<g transform="scale(${box.size / 16})">${GLYPHS.comment}</g></g>`
    );
  }).join('');
}

function positionCommentPopover() {
  const rect = canvas.getBoundingClientRect();
  const { width } = deckSize();
  const box = commentBadgeBox(commentEditing.shape);
  const scale = rect.width / width;
  const left = rect.left + box.x * scale;
  const top = rect.top + box.y * scale;
  const margin = 8;
  const pw = commentPopover.offsetWidth;
  const ph = commentPopover.offsetHeight;
  // Beside the badge on its outer side, away from the shape it belongs to,
  // flipping to the other side when there is no room.
  let x = left - pw - margin;
  if (x < margin) x = left + box.size * scale + margin;
  commentPopover.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - pw - margin))}px`;
  commentPopover.style.top = `${Math.max(margin, Math.min(top, window.innerHeight - ph - margin))}px`;
}

// Called at the end of every canvas render: the popover follows its shape, and
// goes away when the shape does (deleted, another slide, undo) or comments
// are hidden.
function syncCommentPopover() {
  if (!commentEditing) return;
  if (!state.showComments || !slide().shapes.includes(commentEditing.shape)) {
    // Still in the deck means the view moved on (another slide, comments
    // hidden), so what was typed is kept. Gone from the deck means the shape
    // was deleted or undone away, and there is nothing left to write to.
    const shape = commentEditing.shape;
    closeCommentEditor(state.deck.slides.some((item) => item.shapes.includes(shape)), false);
    return;
  }
  positionCommentPopover();
}

function closeCommentEditor(save, rerender = true) {
  const editing = commentEditing;
  if (!editing) return;
  commentEditing = null;
  commentPopover.hidden = true;
  // A locked shape is read-only, so Done just closes.
  if (save && !editing.shape.locked) {
    const text = commentText.value.trim();
    if (text !== (editing.shape.comment || '')) {
      editing.shape.comment = text;
      markDirty();
    }
  }
  if (rerender) renderCanvas();
}

function openCommentEditor(index) {
  const shape = slide().shapes[index];
  if (!shape) return;
  if (commentEditing) closeCommentEditor(true, false);
  if (!state.showComments) setShowComments(true);
  commentEditing = { shape };
  selectOnly(index);
  commentText.value = shape.comment || '';
  commentText.readOnly = !!shape.locked;
  commentDelete.hidden = !!shape.locked || !shape.comment;
  commentPopover.hidden = false;
  renderCanvas();
  renderProps();
  // Focus now, which is enough for a menu or toolbar click, and once more
  // after the event, like the text editor does, for a badge press whose
  // pointerdown still has a focus change queued.
  const focusText = () => {
    if (commentEditing?.shape !== shape || document.activeElement === commentText) return;
    commentText.focus();
    commentText.setSelectionRange(commentText.value.length, commentText.value.length);
  };
  focusText();
  setTimeout(focusText, 0);
}

function setShowComments(on) {
  if (!on) closeCommentEditor(true, false);
  state.showComments = on;
  const button = $('btn-comments');
  button.classList.toggle('active', on);
  button.setAttribute('aria-pressed', String(on));
}

// Turning comments on with one unlocked shape selected is how a first comment
// is added.
function toggleComments() {
  setShowComments(!state.showComments);
  const shape = selectedShape();
  if (state.showComments && state.selection.length === 1 && shape && !shape.locked) {
    openCommentEditor(state.selected);
  } else {
    renderCanvas();
  }
}
$('btn-comments').addEventListener('click', toggleComments);

// The same press on the open badge closes it.
function pressCommentBadge(index) {
  if (commentEditing && commentEditing.shape === slide().shapes[index]) closeCommentEditor(true);
  else openCommentEditor(index);
}

$('context-comment').addEventListener('click', () => {
  hideContextMenu();
  openCommentEditor(state.selected);
});

// Clicking anywhere else commits. The canvas handler has already dealt with a
// badge press, so a badge is not "elsewhere".
document.addEventListener('pointerdown', (event) => {
  if (!commentEditing || !(event.target instanceof Element)) return;
  if (commentPopover.contains(event.target) || event.target.closest('[data-comment]')) return;
  closeCommentEditor(true);
});

commentText.addEventListener('keydown', (event) => {
  // Like the text editor: no letter typed here may reach the document
  // shortcuts (tools, Delete removing the shape).
  event.stopPropagation();
  if (event.key === 'Escape') {
    closeCommentEditor(false);
    canvas.focus({ preventScroll: true });
  } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    closeCommentEditor(true);
    canvas.focus({ preventScroll: true });
  }
});
$('comment-done').addEventListener('click', () => {
  closeCommentEditor(true);
  canvas.focus({ preventScroll: true });
});
commentDelete.addEventListener('click', () => {
  commentText.value = '';
  closeCommentEditor(true);
  canvas.focus({ preventScroll: true });
});
