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

function hideBackgroundMenu() {
  backgroundMenu.hidden = true;
  $('btn-background').setAttribute('aria-expanded', 'false');
}

function hideCodeBlockMenu() {
  codeBlockMenu.hidden = true;
  $('btn-code-block').setAttribute('aria-expanded', 'false');
}

function hideToolbarPopovers() {
  hideBackgroundMenu();
  hideCodeBlockMenu();
}

function showBackgroundMenu() {
  hidePresetMenu();
  hideCodeBlockMenu();
  renderBackground();
  backgroundMenu.hidden = false;
  $('btn-background').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(backgroundMenu, $('btn-background'));
}

function showCodeBlockMenu() {
  hidePresetMenu();
  hideBackgroundMenu();
  codeBlockMenu.hidden = false;
  $('btn-code-block').setAttribute('aria-expanded', 'true');
  positionToolbarPopover(codeBlockMenu, $('btn-code-block'));
  codeBlockMenu.querySelector('[data-code-format]')?.focus();
}

$('btn-background').addEventListener('click', () => {
  if (backgroundMenu.hidden) showBackgroundMenu();
  else hideBackgroundMenu();
});

$('btn-code-block').addEventListener('click', () => {
  if (codeBlockMenu.hidden) showCodeBlockMenu();
  else hideCodeBlockMenu();
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
  shape.w = width * 0.78;
  shape.h = height * 0.7;
  shape.fontSize = Math.max(16, Math.round(Math.min(width / 75, height / 42)));
  shape.codeFormat = format;
  shape.codeLanguage = language;
  shape.text = defaultCode(language);
  slide().shapes.push(shape);
  selectOnly(slide().shapes.length - 1);
  renderAll();
  openCodeDialog(state.selected, true);
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
  if (!shape || shape.kind !== 'code') return;
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
