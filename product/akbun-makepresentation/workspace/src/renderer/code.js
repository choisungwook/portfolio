'use strict';

function positionToolbarPopover(popover, trigger) {
  const anchor = trigger.getBoundingClientRect();
  const bounds = popover.getBoundingClientRect();
  popover.style.left = `${Math.max(8, Math.min(
    anchor.left,
    window.innerWidth - bounds.width - 8
  ))}px`;
  const below = anchor.bottom + 6;
  popover.style.top = `${below + bounds.height <= window.innerHeight
    ? below
    : Math.max(8, anchor.top - bounds.height - 6)}px`;
}

function hideInsertMenu() {
  insertMenu.hidden = true;
  $('btn-insert').setAttribute('aria-expanded', 'false');
}

function hideShapesMenu() {
  shapesMenu.hidden = true;
  $('btn-shapes').setAttribute('aria-expanded', 'false');
}

function hideZoomMenu() {
  zoomMenu.hidden = true;
  $('btn-zoom-level').setAttribute('aria-expanded', 'false');
}

function hideTableMenu() {
  tableMenu.hidden = true;
  $('btn-table').setAttribute('aria-expanded', 'false');
}

function hideCodeBlockMenu() {
  codeBlockMenu.hidden = true;
  $('btn-insert').setAttribute('aria-expanded', 'false');
}

function hideToolbarPopovers() {
  hideInsertMenu();
  hideZoomMenu();
  hideShapesMenu();
  hideTableMenu();
  hideCodeBlockMenu();
}

function showCodeBlockMenu() {
  hidePresetMenu();
  hideZoomMenu();
  hideShapesMenu();
  hideTableMenu();
  codeBlockMenu.hidden = false;
  $('btn-insert').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(codeBlockMenu, $('btn-insert'));
  codeBlockMenu.querySelector('[data-code-format]')?.focus();
}

$('btn-shapes').addEventListener('click', () => {
  if (!shapesMenu.hidden) return hideShapesMenu();
  hidePresetMenu();
  hideZoomMenu();
  hideCodeBlockMenu();
  hideTableMenu();
  shapesMenu.hidden = false;
  $('btn-shapes').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(shapesMenu, $('btn-shapes'));
  (shapesMenu.querySelector('.active') || shapesMenu.querySelector('[data-tool]')).focus();
});

// The tiles are [data-tool] buttons, so renderer.js already switches the tool
// on click; this only closes the popover and hands the keyboard to the slide.
shapesMenu.addEventListener('click', (event) => {
  if (!event.target.closest('[data-tool]')) return;
  hideShapesMenu();
  canvas.focus({ preventScroll: true });
});

// --- zoom menu ---

// Only the levels the editor layer accepts are offered, so the menu cannot ask
// for a zoom that setZoom would silently clamp.
zoomMenu.innerHTML = L.ZOOM_STEPS.map((step) =>
  `<button type="button" role="menuitemradio" aria-checked="false" data-zoom="${step}">${Math.round(step * 100)}%</button>`
).join('') + `<hr /><button type="button" role="menuitem" data-zoom="${L.ZOOM_FIT}">Fit Slide</button>`;

$('btn-zoom-level').addEventListener('click', () => {
  if (!zoomMenu.hidden) return hideZoomMenu();
  hideToolbarPopovers();
  zoomMenu.hidden = false;
  $('btn-zoom-level').setAttribute('aria-expanded', 'true');
  // Aligned to the capsule's right edge, which sits at the window edge.
  const anchor = $('btn-zoom-level').getBoundingClientRect();
  const width = zoomMenu.getBoundingClientRect().width;
  zoomMenu.style.left = `${Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8))}px`;
  zoomMenu.style.top = `${anchor.bottom + 6}px`;
  (zoomMenu.querySelector('.checked') || zoomMenu.querySelector('button')).focus();
});

// A double click is a click that opened the menu, a click that closed it, and
// then this: reset and make sure the menu is not left open.
$('btn-zoom-level').addEventListener('dblclick', () => {
  setZoom(L.ZOOM_FIT);
  hideZoomMenu();
});

zoomMenu.addEventListener('click', (event) => {
  const item = event.target.closest('[data-zoom]');
  if (!item) return;
  setZoom(Number(item.dataset.zoom));
  hideZoomMenu();
  $('btn-zoom-level').focus();
});

zoomMenu.addEventListener('keydown', (event) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const items = [...zoomMenu.querySelectorAll('button')];
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
  event.preventDefault();
});

// --- table picker ---

const TABLE_COLUMNS = 8;
const TABLE_ROWS = 6;
const tableGrid = $('table-grid');
tableGrid.innerHTML = Array.from({ length: TABLE_COLUMNS * TABLE_ROWS }, (_, i) => {
  const column = (i % TABLE_COLUMNS) + 1;
  const row = Math.floor(i / TABLE_COLUMNS) + 1;
  return `<button type="button" data-column="${column}" data-row="${row}" aria-label="${column} column${column > 1 ? 's' : ''}, ${row} row${row > 1 ? 's' : ''}"></button>`;
}).join('');

// Lights the block from the top-left cell to the one under the pointer or
// focus, and names its size as columns × rows.
function highlightTable(column, row) {
  for (const cell of tableGrid.children) {
    cell.classList.toggle('in', Number(cell.dataset.column) <= column && Number(cell.dataset.row) <= row);
  }
  $('table-caption').textContent = column ? `${column} × ${row}` : 'Table';
}

function insertTable(columns, rows) {
  const { width, height } = deckSize();
  // Rows scale with the slide too, or a table on a large slide reads as a strip.
  const rowHeight = Math.max(appSettings.headingSizes.h3 * 1.6, height / 14);
  const w = Math.round(width * 0.7);
  const h = Math.round(Math.min(rowHeight * rows, height * 0.8));
  const box = { x: Math.round((width - w) / 2), y: Math.round((height - h) / 2), w, h };
  const cells = L.createTableShapes(columns, rows, box, {
    ...newShapeStyle('rect'),
    fontSize: appSettings.headingSizes.h3,
  });
  const first = slide().shapes.length;
  slide().shapes.push(...cells);
  selectMany(cells.map((_, offset) => first + offset));
  setTool('select');
  markDirty();
  renderAll();
}

$('btn-table').addEventListener('click', () => {
  if (!tableMenu.hidden) return hideTableMenu();
  hidePresetMenu();
  hideZoomMenu();
  hideCodeBlockMenu();
  hideShapesMenu();
  highlightTable(0, 0);
  tableMenu.hidden = false;
  $('btn-table').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(tableMenu, $('btn-table'));
  tableGrid.firstElementChild.focus();
});

tableGrid.addEventListener('mouseover', (event) => {
  const cell = event.target.closest('button');
  if (cell) highlightTable(Number(cell.dataset.column), Number(cell.dataset.row));
});
tableGrid.addEventListener('focusin', (event) => {
  const cell = event.target.closest('button');
  if (cell) highlightTable(Number(cell.dataset.column), Number(cell.dataset.row));
});
tableGrid.addEventListener('mouseleave', () => {
  const focused = document.activeElement.closest?.('#table-grid button');
  if (focused) highlightTable(Number(focused.dataset.column), Number(focused.dataset.row));
  else highlightTable(0, 0);
});
tableGrid.addEventListener('keydown', (event) => {
  const cell = event.target.closest('button');
  const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
  if (!cell || !step) return;
  const column = Math.min(TABLE_COLUMNS, Math.max(1, Number(cell.dataset.column) + step[0]));
  const row = Math.min(TABLE_ROWS, Math.max(1, Number(cell.dataset.row) + step[1]));
  tableGrid.children[(row - 1) * TABLE_COLUMNS + column - 1].focus();
  event.preventDefault();
});
tableGrid.addEventListener('click', (event) => {
  const cell = event.target.closest('button');
  if (!cell) return;
  hideTableMenu();
  canvas.focus({ preventScroll: true });
  insertTable(Number(cell.dataset.column), Number(cell.dataset.row));
});

// --- insert menu ---
//
// Insert gathers the three insert actions that used to sit in the toolbar. The
// code-block formats and the preset gallery are popups of their own, so they
// open anchored to this button instead.

$('btn-insert').addEventListener('click', () => {
  if (!insertMenu.hidden) return hideInsertMenu();
  hideToolbarPopovers();
  hidePresetMenu();
  insertMenu.hidden = false;
  $('btn-insert').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(insertMenu, $('btn-insert'));
  insertMenu.querySelector('button').focus();
});

insertMenu.addEventListener('keydown', (event) => {
  const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const items = [...insertMenu.querySelectorAll('button')];
  items[(items.indexOf(document.activeElement) + step + items.length) % items.length].focus();
  event.preventDefault();
});

insertMenu.addEventListener('click', (event) => {
  const item = event.target.closest('button');
  if (!item) return;
  hideInsertMenu();
  if (item.id === 'insert-code') showCodeBlockMenu();
  else if (item.id === 'insert-preset') showPresetMenu();
  else if (item.id === 'insert-image') $('insert-image-input').click();
});

// Same path as a paste: readFileDataUrl checks type and the 10 MB cap before
// anything lands on the slide, and the image is fitted and centred the same way.
$('insert-image-input').addEventListener('change', async (event) => {
  const files = [...event.target.files].filter(imageFileMime);
  event.target.value = '';
  if (!files.length) return;
  const targetDeck = state.deck;
  const targetSlide = slide();
  try {
    const shapes = await Promise.all(files.map(pastedImageShape));
    if (state.deck !== targetDeck || slide() !== targetSlide) return;
    insertShapes(shapes, 0);
  } catch (error) {
    await window.api.message(String(error), { title: 'Cannot import image', kind: 'error' });
  }
});

function codeLanguageLabel(language) {
  const labels = {
    plaintext: 'Plain text', javascript: 'JavaScript', typescript: 'TypeScript',
    html: 'HTML', css: 'CSS', rust: 'Rust', hcl: 'HCL / Terraform', bash: 'Bash',
    json: 'JSON', yaml: 'YAML', sql: 'SQL', java: 'Java', go: 'Go', c: 'C',
    cpp: 'C++', kotlin: 'Kotlin', swift: 'Swift', python: 'Python',
  };
  return labels[language] || language;
}

function populateCodeOptions() {
  const languageOptions = L.CODE_LANGUAGES.map(
    (language) => `<option value="${language}">${codeLanguageLabel(language)}</option>`
  ).join('');
  $('code-menu-language').innerHTML = languageOptions;
  $('code-language').innerHTML = languageOptions;
  $('code-menu-language').value = 'python';
  $('code-format').innerHTML = Object.entries(L.CODE_FORMATS).map(
    ([value, format]) => `<option value="${value}">${format.label}</option>`
  ).join('');
}

function defaultCode(language) {
  const examples = {
    python: 'def greet(name: str) -> str:\n  return f"Hello, {name}!"\n\nprint(greet("world"))',
    javascript: 'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("world"));',
    typescript: 'function greet(name: string): string {\n  return `Hello, ${name}!`;\n}',
    html: '<main class="hero">\n  <h1>Hello, world!</h1>\n</main>',
    css: '.hero {\n  display: grid;\n  place-items: center;\n}',
    rust: 'fn main() {\n  println!("Hello, world!");\n}',
    hcl: 'resource "aws_s3_bucket" "example" {\n  bucket = "example-bucket"\n}',
    bash: '#!/usr/bin/env bash\nset -euo pipefail\necho "Hello, world!"',
    json: '{\n  "message": "Hello, world!"\n}',
    yaml: 'message: Hello, world!\nenabled: true',
    sql: 'SELECT id, name\nFROM users\nWHERE active = true;',
    java: 'class Main {\n  public static void main(String[] args) {\n    System.out.println("Hello, world!");\n  }\n}',
    go: 'func main() {\n  fmt.Println("Hello, world!")\n}',
    c: 'int main(void) {\n  printf("Hello, world!\\n");\n  return 0;\n}',
    cpp: 'int main() {\n  std::cout << "Hello, world!\\n";\n}',
  };
  return examples[language] || '// Paste code here';
}

function insertCodeBlock(format, language) {
  const { width, height } = deckSize();
  const shape = L.createShape('code', width * 0.11, height * 0.14, newShapeStyle('code'));
  shape.fontSize = Math.max(16, Math.round(Math.min(width / 75, height / 42)));
  shape.codeFormat = format;
  shape.codeLanguage = language;
  shape.text = defaultCode(language);
  fitCodeBlockForSlide(shape);
  slide().shapes.push(shape);
  selectOnly(slide().shapes.length - 1);
  renderAll();
  openCodeDialog(state.selected, true);
}

function fitCodeBlockForSlide(shape) {
  if (shape.locked) return;
  L.fitCodeBlock(shape);
  const { width, height } = deckSize();
  const scale = Math.min(1,
    Math.max(8, width - shape.x) / shape.w,
    Math.max(8, height - shape.y) / shape.h);
  shape.w *= scale;
  shape.h *= scale;
  shape.fontSize *= scale;
}

codeBlockMenu.addEventListener('click', (event) => {
  const card = event.target.closest('[data-code-format]');
  if (!card) return;
  const language = $('code-menu-language').value;
  hideCodeBlockMenu();
  insertCodeBlock(card.dataset.codeFormat, language);
});

function lineNumberValue(lines) {
  return L.normalizeLineNumbers(lines).join(', ');
}

function openCodeDialog(index, isNew) {
  const shape = slide().shapes[index];
  if (!shape || shape.locked || shape.kind !== 'code') return;
  hideToolbarPopovers();
  codeEditIndex = index;
  codeEditIsNew = isNew;
  codeEditBefore = isNew ? null : structuredClone(shape);
  $('code-language').value = shape.codeLanguage || 'plaintext';
  $('code-format').value = shape.codeFormat || 'editor-dark';
  $('code-highlights').value = lineNumberValue(shape.codeHighlights);
  $('code-callouts').value = lineNumberValue(shape.codeCallouts);
  $('code-line-numbers').checked = shape.showLineNumbers !== false;
  $('code-source').value = shape.text || '';
  $('code-status').textContent = 'Use comma-separated lines or ranges, for example 2, 4-6.';
  codeDialog.showModal();
  $('code-source').focus();
  $('code-source').setSelectionRange(0, $('code-source').value.length);
}

function resetCodeEdit() {
  codeEditBefore = null;
  codeEditIndex = -1;
  codeEditIsNew = false;
}

function cancelCodeEdit(closeDialog = true) {
  if (codeEditIsNew && codeEditIndex >= 0) {
    slide().shapes.splice(codeEditIndex, 1);
    clearSelection();
    renderAll();
  }
  resetCodeEdit();
  if (closeDialog && codeDialog.open) codeDialog.close('cancel');
}

$('btn-code-cancel').addEventListener('click', () => cancelCodeEdit());
codeDialog.addEventListener('cancel', () => cancelCodeEdit(false));

$('code-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const shape = slide().shapes[codeEditIndex];
  if (!shape || shape.kind !== 'code') {
    resetCodeEdit();
    codeDialog.close('cancel');
    return;
  }
  shape.text = $('code-source').value.replace(/\r\n/g, '\n');
  shape.codeLanguage = $('code-language').value;
  shape.codeFormat = $('code-format').value;
  shape.codeHighlights = L.normalizeLineNumbers($('code-highlights').value);
  shape.codeCallouts = L.normalizeLineNumbers($('code-callouts').value);
  shape.showLineNumbers = $('code-line-numbers').checked;
  const changed = codeEditIsNew || JSON.stringify(shape) !== JSON.stringify(codeEditBefore);
  if (changed) fitCodeBlockForSlide(shape);
  resetCodeEdit();
  codeDialog.close('apply');
  if (changed) markDirty();
  renderAll();
  canvas.focus({ preventScroll: true });
});

$('code-source').addEventListener('keydown', (event) => {
  event.stopPropagation();
  if (event.key !== 'Tab') return;
  event.preventDefault();
  const source = event.target;
  const start = source.selectionStart;
  const end = source.selectionEnd;
  source.setRangeText('  ', start, end, 'end');
});

$('btn-copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('code-source').value);
    $('code-status').textContent = 'Code copied.';
  } catch (_) {
    $('code-source').select();
    document.execCommand('copy');
    $('code-status').textContent = 'Code copied.';
  }
});

$('btn-paste-code').addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    const source = $('code-source');
    source.setRangeText(text, source.selectionStart, source.selectionEnd, 'end');
    source.focus();
    $('code-status').textContent = 'Code pasted.';
  } catch (_) {
    $('code-source').focus();
    $('code-status').textContent = 'Clipboard access was blocked. Press Cmd+V or Ctrl+V.';
  }
});

$('btn-edit-code').addEventListener('click', () => openCodeDialog(state.selected, false));
