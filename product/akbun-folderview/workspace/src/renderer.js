'use strict';

// The whole window. It keeps the library in memory and redraws from it, so a
// keystroke never waits on the main process or the disk.

// Kept behind one name rather than destructured. library.js is loaded as a
// plain script, so its top level names are already on the page and pulling them
// out here would redeclare them.
const lib = globalThis.folderviewLib;

const $ = (id) => document.getElementById(id);

let state = {
  roots: [],
  entries: [],
  settings: {},
  version: '',
  dataDir: '',
  // Set by clicking a folder in the tree. Narrows the grid before the query.
  folder: null,
  query: '',
  shown: 200,
};

const PAGE = 200;

/* ------------------------------------------------------------------ helpers */

// A file name is data from the disk, not markup. Without this a file called
// "<img onerror=...>.jpg" would run its own script inside the window.
function escapeHtml(text) {
  return String(text).replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]
  );
}

// The webview will not load file:// directly. convertFileSrc turns a path into
// an asset protocol URL and does its own escaping, which is what makes "#" and
// "?" in a Windows file name safe; both are legal in a name and either one
// would otherwise cut the URL short.
function fileUrl(filePath) {
  return window.api.fileUrl(filePath);
}

function visibleEntries() {
  const inFolder = state.folder
    // A plain prefix test would pull in a sibling: selecting C:\photos\trip
    // would also match C:\photos\trip2. isUnder requires a separator after it.
    ? state.entries.filter((entry) => lib.isUnder(entry.path, state.folder))
    : state.entries;
  return lib.searchEntries(inFolder, state.query);
}

function starsHtml(rating) {
  return [1, 2, 3, 4, 5]
    .map((n) => `<span class="star ${n <= rating ? 'on' : ''}" data-star="${n}">★</span>`)
    .join('');
}

function setQuery(text) {
  state.query = text;
  state.shown = PAGE;
  $('search').value = text;
  renderGrid();
}

// A filter button toggles its token in and out of whatever is already typed.
function toggleToken(token) {
  const current = $('search').value.trim();
  if (!token) return setQuery('');
  const parts = current.split(/\s+/).filter(Boolean);
  const at = parts.indexOf(token);
  if (at >= 0) parts.splice(at, 1);
  else parts.push(token);
  setQuery(parts.join(' '));
}

/* --------------------------------------------------------------- rendering */

// The tree and the tag counts are a pass over every entry, so they are built
// once per library change instead of once per keystroke.
let derived = null;

function derive() {
  if (!derived) {
    derived = {
      tree: lib.buildTree(state.roots, state.entries),
      tags: lib.tagCounts(state.entries),
      ratings: lib.ratingCounts(state.entries),
      favorites: state.entries.filter((entry) => entry.favorite).length,
    };
  }
  return derived;
}

function renderTree() {
  const host = $('tree');
  host.textContent = '';

  if (state.roots.length === 0 && state.entries.length === 0) {
    host.innerHTML = '<p class="empty">Add a folder to start. Only what you add is indexed.</p>';
    return;
  }

  for (const node of derive().tree) host.append(folderNode(node, true));

  // Files added one at a time sit under no root, so the tree would lose them.
  const loose = state.entries.filter(
    (entry) => !state.roots.some((root) => lib.isUnder(entry.path, root.path))
  );
  if (loose.length > 0) {
    host.append(groupTitle(`Single files (${loose.length})`));
    for (const entry of loose) host.append(fileRow(entry));
  }
}

function countIn(node) {
  return node.files.length + node.folders.reduce((sum, child) => sum + countIn(child), 0);
}

// A file in the tree behaves like a file in the grid: it opens.
function fileRow(entry) {
  const row = document.createElement('div');
  row.className = 'row-item';

  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  row.append(twisty);

  const label = document.createElement('span');
  label.textContent = entry.name;
  label.title = entry.path;
  row.append(label);

  row.addEventListener('click', () => window.api.openEntry(entry.path));
  row.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await window.api.entryMenu((action) => void runAction(action, entry));
  });
  return row;
}

function folderNode(node, isRoot) {
  const wrapper = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'row-item';
  if (state.folder === node.path) row.classList.add('selected');

  const hasChildren = node.folders.length > 0 || node.files.length > 0;
  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  twisty.textContent = hasChildren ? (isRoot ? '▾' : '▸') : '';
  row.append(twisty);

  const label = document.createElement('span');
  label.textContent = node.name;
  label.title = node.path;
  row.append(label);

  const count = document.createElement('span');
  count.className = 'count';
  count.textContent = String(countIn(node));
  row.append(count);

  // Children are built the first time the folder opens, and folders below the
  // root start closed. A root with thousands of files would otherwise put
  // thousands of rows in the page before anyone asked to see them.
  const children = document.createElement('div');
  children.className = 'node';
  children.hidden = !isRoot;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    for (const child of node.folders) children.append(folderNode(child, false));
    for (const file of node.files) children.append(fileRow(file));
  };
  if (isRoot) build();

  row.addEventListener('click', () => {
    state.folder = state.folder === node.path ? null : node.path;
    state.shown = PAGE;
    render();
  });

  // The twisty is the one part of the row that opens the folder instead of
  // selecting it.
  twisty.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!hasChildren) return;
    build();
    children.hidden = !children.hidden;
    twisty.textContent = children.hidden ? '▸' : '▾';
  });

  // A root folder can be dropped from the library. Its files stay on disk.
  if (isRoot) {
    row.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await window.api.removeRoot(node.path);
    });
    row.title = `${node.path}\nRight click to remove this folder from the library`;
  }

  wrapper.append(row, children);
  return wrapper;
}

function catalogRow(label, token, count) {
  const row = document.createElement('div');
  row.className = 'row-item';
  row.dataset.token = token;
  row.innerHTML = `<span class="twisty"></span><span>${escapeHtml(label)}</span><span class="count">${count}</span>`;
  row.addEventListener('click', () => toggleToken(token));
  return row;
}

function groupTitle(text) {
  const title = document.createElement('div');
  title.className = 'group-title';
  title.textContent = text;
  return title;
}

function renderCatalog() {
  const host = $('catalog');
  host.textContent = '';
  const { tags, ratings, favorites } = derive();

  host.append(catalogRow('★ Favorites', 'fav', favorites));

  host.append(groupTitle('Rating'));
  for (let stars = 5; stars >= 1; stars--) {
    host.append(catalogRow('★'.repeat(stars), `rating:=${stars}`, ratings[stars]));
  }

  host.append(groupTitle(`Tags (${tags.length})`));
  if (tags.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No tags yet. Right click a file and open Properties.';
    host.append(empty);
  }
  for (const { tag, count } of tags) host.append(catalogRow(tag, `tag:${tag}`, count));

  // Feeds the search box autocomplete, so a tag never has to be typed twice.
  $('tag-list').innerHTML = tags
    .map(({ tag }) => `<option value="tag:${escapeHtml(tag)}">`)
    .join('');
}

function thumb(entry) {
  if (entry.kind === 'video') {
    // The #t fragment makes Chromium seek to that second and paint the frame,
    // which is a poster image without decoding the file ourselves.
    return `<video src="${fileUrl(entry.path)}#t=0.5" preload="metadata" muted></video>
            <span class="badge">VIDEO</span>`;
  }
  return `<img src="${fileUrl(entry.path)}" loading="lazy" alt="" />`;
}

function card(entry) {
  const element = document.createElement('div');
  element.className = 'card';
  element.dataset.path = entry.path;
  element.innerHTML = `
    <div class="thumb">${thumb(entry)}</div>
    <div class="card-body">
      <div class="card-name" title="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</div>
      <div class="card-meta">
        <span class="stars">${starsHtml(entry.rating)}</span>
        <span class="fav ${entry.favorite ? 'on' : ''}" data-fav="1">${entry.favorite ? '♥' : '♡'}</span>
      </div>
      <div>${entry.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</div>
    </div>`;
  return element;
}

// Which filter buttons and catalog rows are lit follows from the query text, so
// it is recomputed rather than tracked.
function syncTokens() {
  const active = new Set(state.query.trim().split(/\s+/).filter(Boolean));
  for (const button of $('filters').children) {
    const token = button.dataset.token;
    button.classList.toggle('on', token ? active.has(token) : active.size === 0);
  }
  for (const row of $('catalog').querySelectorAll('.row-item')) {
    row.classList.toggle('selected', active.has(row.dataset.token));
  }
}

function renderGrid() {
  const matches = visibleEntries();
  const page = matches.slice(0, state.shown);

  const grid = $('grid');
  grid.textContent = '';
  for (const entry of page) grid.append(card(entry));

  const where = state.folder ? ` in ${state.folder}` : '';
  $('status').textContent =
    matches.length === 0
      ? `No match${where}`
      : `${matches.length} file${matches.length === 1 ? '' : 's'}${where}` +
        (page.length < matches.length ? ` — showing ${page.length}` : '');

  $('show-more').hidden = page.length >= matches.length;
  syncTokens();
}

function render() {
  renderTree();
  renderCatalog();
  renderGrid();
}

/* ------------------------------------------------------------ file actions */

function entryAt(element) {
  const host = element.closest('.card');
  return host ? state.entries.find((entry) => entry.path === host.dataset.path) : null;
}

async function patch(entry, changes) {
  Object.assign(entry, changes);
  // Tag and rating counts in the catalog just changed.
  derived = null;
  await window.api.updateEntry(entry.path, changes);
  render();
}

async function runAction(action, entry) {
  if (action === 'open') return window.api.openEntry(entry.path);
  if (action === 'reveal') return window.api.revealEntry(entry.path);
  if (action === 'copyPath') return window.api.copyPath(entry.path);
  if (action === 'delete') return window.api.deleteEntry(entry.path);
  // Rename shares the Properties dialog, so there is one place that edits a
  // file's name, tags and rating.
  if (action === 'rename') return openProperties(entry, true);
  if (action === 'properties') return openProperties(entry, false);
}

/* ---------------------------------------------------------------- dialogs */

let propertyTarget = null;
let propertyRating = 0;

function openProperties(entry, focusName) {
  propertyTarget = entry;
  propertyRating = entry.rating;

  $('prop-name').value = entry.name;
  $('prop-tags').value = entry.tags.join(', ');
  $('prop-favorite').checked = entry.favorite;
  $('prop-stars').innerHTML = starsHtml(entry.rating);
  // Escaped for the same reason the card is: a folder named with a tag would
  // otherwise run its own markup here. kind comes from Rust and is safe today,
  // but escaping it too costs nothing and removes the need to remember which.
  $('prop-facts').innerHTML = `
    <dt>Type</dt><dd>${escapeHtml(entry.kind ?? 'file')}</dd>
    <dt>Size</dt><dd>${lib.formatSize(entry.size)}</dd>
    <dt>Modified</dt><dd>${entry.mtime ? new Date(entry.mtime).toLocaleString() : 'unknown'}</dd>
    <dt>Location</dt><dd>${escapeHtml(entry.dir)}</dd>`;

  $('properties').hidden = false;
  if (focusName) $('prop-name').select();
}

async function saveProperties() {
  const entry = propertyTarget;
  if (!entry) return;

  const tags = [...new Set($('prop-tags').value.split(',').map(normalizeTag).filter(Boolean))];
  await patch(entry, { rating: propertyRating, favorite: $('prop-favorite').checked, tags });

  const newName = $('prop-name').value.trim();
  if (newName && newName !== entry.name) {
    const result = await window.api.renameEntry(entry.path, newName);
    if (!result.ok && result.error) $('status').textContent = `Rename failed: ${result.error}`;
  }
  $('properties').hidden = true;
}

function openSettings() {
  $('set-theme').value = state.settings.theme;
  $('set-single-click').checked = state.settings.openOnSingleClick;
  $('set-card-size').value = state.settings.cardSize;
  $('set-data-dir').textContent = state.dataDir;
  $('set-version').textContent = state.version;
  $('settings').hidden = false;
}

async function saveCurrentSettings() {
  state.settings = {
    theme: $('set-theme').value,
    openOnSingleClick: $('set-single-click').checked,
    cardSize: Number($('set-card-size').value),
  };
  applySettings();
  await window.api.saveSettings(state.settings);
}

function applySettings() {
  const root = document.documentElement;
  if (state.settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.settings.theme);
  root.style.setProperty('--card-size', `${state.settings.cardSize}px`);
}

/* ------------------------------------------------------------------- wiring */

$('add-folder').addEventListener('click', () => window.api.addFolder());
$('add-files').addEventListener('click', () => window.api.addFiles());
$('rescan').addEventListener('click', () => window.api.rescan());
$('show-more').addEventListener('click', () => {
  state.shown += PAGE;
  renderGrid();
});

// Typing filters on the array already in memory, so no debounce is needed.
$('search').addEventListener('input', (event) => {
  state.query = event.target.value;
  state.shown = PAGE;
  renderGrid();
});

$('filters').addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (button) toggleToken(button.dataset.token);
});

$('grid').addEventListener('click', async (event) => {
  const entry = entryAt(event.target);
  if (!entry) return;

  const star = event.target.dataset.star;
  if (star) {
    // Clicking the star already set clears the rating.
    const value = Number(star);
    return patch(entry, { rating: entry.rating === value ? 0 : value });
  }
  if (event.target.dataset.fav) return patch(entry, { favorite: !entry.favorite });

  if (state.settings.openOnSingleClick) await window.api.openEntry(entry.path);
});

$('grid').addEventListener('dblclick', async (event) => {
  const entry = entryAt(event.target);
  if (entry && !state.settings.openOnSingleClick) await window.api.openEntry(entry.path);
});

$('grid').addEventListener('contextmenu', async (event) => {
  const entry = entryAt(event.target);
  if (!entry) return;
  event.preventDefault();
  await window.api.entryMenu((action) => void runAction(action, entry));
});

$('prop-stars').addEventListener('click', (event) => {
  const star = event.target.dataset.star;
  if (!star) return;
  propertyRating = propertyRating === Number(star) ? 0 : Number(star);
  $('prop-stars').innerHTML = starsHtml(propertyRating);
});

$('prop-cancel').addEventListener('click', () => {
  $('properties').hidden = true;
});
$('prop-save').addEventListener('click', () => void saveProperties());

$('set-theme').addEventListener('change', () => void saveCurrentSettings());
$('set-single-click').addEventListener('change', () => void saveCurrentSettings());
$('set-card-size').addEventListener('input', () => void saveCurrentSettings());
$('set-open-dir').addEventListener('click', () => window.api.openDataDir());
$('set-update').addEventListener('click', () => window.api.checkUpdate());
$('set-close').addEventListener('click', () => {
  $('settings').hidden = true;
});

$('open-settings').addEventListener('click', openSettings);

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    $('properties').hidden = true;
    $('settings').hidden = true;
    return;
  }
  // There is no menu bar to hang an accelerator on, so the page owns this one.
  if (event.key === 'f' && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    $('search').select();
  }
});

// Every mutating command answers with the whole library, and api.js routes it
// here. The page therefore never merges a partial update into its own copy.
window.api.onLibraryChanged((snapshot) => {
  state.roots = snapshot.roots;
  state.entries = snapshot.entries;
  derived = null;
  render();
});

window.api.getLibrary().then((snapshot) => {
  state = { ...state, ...snapshot };
  applySettings();
  render();
});
