'use strict';

const MENU_COMMANDS = {
  new: newDeck,
  open: openFile,
  save: () => saveFile(false),
  'save-as': () => saveFile(true),
  'export-pdf': exportPdf,
  'export-png': exportPng,
  undo,
  redo,
  duplicate: duplicateSelection,
  delete: deleteSelectedShape,
  group: groupSelection,
  ungroup: ungroupSelection,
  present: enterPresent,
  settings: openSettings,
  guidelines: openGuidelinesDialog,
  numbers: toggleNumbers,
  'slide-size': openSlideSizeDialog,
  'zoom-in': () => setZoom(L.zoomIn(state.zoom)),
  'zoom-out': () => setZoom(L.zoomOut(state.zoom)),
  'zoom-fit': () => setZoom(L.ZOOM_FIT),
};

// The name is not always ours: this also runs whatever the shell sends over
// the file-command event. A plain lookup would find inherited keys, and
// `constructor` would be called as if it were a command.
function runCommand(command) {
  if (Object.hasOwn(MENU_COMMANDS, command)) MENU_COMMANDS[command]();
}

function hideMenus() {
  for (const panel of document.querySelectorAll('.menu-panel')) panel.hidden = true;
  for (const title of document.querySelectorAll('.menu-title')) {
    title.setAttribute('aria-expanded', 'false');
  }
}

function openMenu(name) {
  hideMenus();
  $('menubar').querySelector(`[data-menu-panel="${name}"]`).hidden = false;
  $('menubar').querySelector(`[data-menu="${name}"]`).setAttribute('aria-expanded', 'true');
  // The two toggles are the only items whose state is worth showing, and it
  // only has to be right at the moment the menu opens.
  $('menubar').querySelector('[data-command="guidelines"]')
    .classList.toggle('checked', state.showGuidelines);
  $('menubar').querySelector('[data-command="numbers"]')
    .classList.toggle('checked', state.showNumbers);
}

$('menubar').addEventListener('click', (event) => {
  const title = event.target.closest('.menu-title');
  if (title) {
    const open = title.getAttribute('aria-expanded') === 'true';
    if (open) hideMenus();
    else openMenu(title.dataset.menu);
    return;
  }
  const item = event.target.closest('[data-command]');
  if (!item) return;
  hideMenus();
  runCommand(item.dataset.command);
});

// Sliding along the bar with one menu already open switches menus, the way a
// menu bar does everywhere else.
$('menubar').addEventListener('pointerover', (event) => {
  const title = event.target.closest('.menu-title');
  if (!title) return;
  const anyOpen = [...document.querySelectorAll('.menu-panel')].some((panel) => !panel.hidden);
  if (anyOpen) openMenu(title.dataset.menu);
});

// The app no longer has a system menu bar, so the events it used to send now
// come from these items. The handler stays for anything the shell still emits.
window.api.onFileCommand(runCommand);
$('btn-present').addEventListener('click', enterPresent);

function toggleNumbers() {
  state.showNumbers = !state.showNumbers;
  renderAll();
}
$('btn-update').addEventListener('click', () => window.api.checkUpdate());
for (const button of document.querySelectorAll('[data-tool]')) {
  button.addEventListener('click', () => setTool(button.dataset.tool));
}

function captureAiSlide(index) {
  const reference = state.deck.slides[index];
  if (!reference) return null;
  return {
    index,
    reference,
    slide: structuredClone(reference),
  };
}

function applyAiSlidePatch(target, patch) {
  const index = state.deck.slides.indexOf(target.reference);
  if (index < 0) throw new Error('The source slide was removed before AI finished.');
  const newSlide = AI.applySlidePatch(target.slide, patch);
  state.deck.slides.splice(index + 1, 0, newSlide);
  state.current = index + 1;
  setSlideSelection([state.current]);
  clearSelection();
  markDirty();
  renderAll();
  return state.current + 1;
}

async function insertAiImage(_path, assetUrl) {
  const response = await fetch(assetUrl);
  if (!response.ok) throw new Error(`cannot read saved image (${response.status})`);
  const shape = await pastedImageShape(await response.blob(), 0);
  insertShapes([shape], 0);
}

async function initialize() {
  populateCodeOptions();
  try {
    await loadPersistentSettings();
  } catch (error) {
    await window.api.message(`Could not load settings.\n\n${error}`, {
      title: 'Settings unavailable',
      kind: 'error',
    });
  }
  setTool('select');
  setZoom(state.zoom);
  renderAll();
  loadSystemFonts();
  await AiPanel.initialize({
    currentSlideIndex: () => state.current,
    listSlides: () => state.deck.slides.map((_, index) => ({
      index,
      label: `Slide ${index + 1}`,
    })),
    captureSlide: captureAiSlide,
    applySlidePatch: applyAiSlidePatch,
    insertImage: insertAiImage,
    deckSize,
    systemPrompts: () => appSettings.aiSystemPrompts,
  });
}

void initialize();
