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
  // Set by clicking a folder in the tree. Shows its direct children, while a
  // search still scans every descendant under it.
  folder: null,
  lastOpenedPath: null,
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

// Which folders are open, by path. Selecting a folder calls render(), which
// rebuilds the tree from scratch; without this map that rebuild would close
// every folder the user had opened. Roots default open, everything else closed.
const expandedFolders = new Map();

function folderIcon(open) {
  return open ? '📂' : '📁';
}

function fileIcon(entry) {
  return entry.kind === 'video' ? '🎬' : '🖼️';
}

function markLastOpened(element, path) {
  element.classList.toggle('last-opened', state.lastOpenedPath === path);
}

function syncLastOpened() {
  for (const element of document.querySelectorAll('.file-entry')) {
    markLastOpened(element, element.dataset.path);
  }
}

async function openEntry(entry) {
  await window.api.openEntry(entry.path);
  state.lastOpenedPath = entry.path;
  syncLastOpened();
}

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
  row.className = 'row-item file-entry';
  row.dataset.path = entry.path;
  markLastOpened(row, entry.path);

  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  twisty.textContent = fileIcon(entry);
  row.append(twisty);

  const label = document.createElement('span');
  label.textContent = entry.name;
  label.title = entry.path;
  row.append(label);

  row.addEventListener('click', () => {
    if (state.settings.openOnSingleClick) void openEntry(entry);
  });
  row.addEventListener('dblclick', () => {
    if (!state.settings.openOnSingleClick) void openEntry(entry);
  });
  row.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    await window.api.entryMenu((action) => void runAction(action, entry), tagMenu(entry));
  });
  return row;
}

function folderNode(node, isRoot) {
  const wrapper = document.createElement('div');
  const row = document.createElement('div');
  row.className = 'row-item';
  if (state.folder === node.path) row.classList.add('selected');

  const hasChildren = node.folders.length > 0 || node.files.length > 0;
  const open = expandedFolders.get(node.path) ?? isRoot;
  const twisty = document.createElement('span');
  twisty.className = 'twisty';
  twisty.textContent = folderIcon(open && hasChildren);
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
  children.hidden = !open;
  let built = false;
  const build = () => {
    if (built) return;
    built = true;
    for (const child of node.folders) children.append(folderNode(child, false));
    for (const file of node.files) children.append(fileRow(file));
  };
  if (open) build();

  row.addEventListener('click', () => {
    const selecting = state.folder !== node.path;
    state.folder = selecting ? node.path : null;
    // Selecting a folder also opens it, so the first click shows its contents
    // in both panels instead of appearing to close the tree.
    if (selecting) expandedFolders.set(node.path, true);
    state.shown = PAGE;
    render();
  });

  // The folder icon is the one part of the row that opens the folder instead
  // of selecting it.
  twisty.addEventListener('click', (event) => {
    event.stopPropagation();
    if (!hasChildren) return;
    build();
    children.hidden = !children.hidden;
    expandedFolders.set(node.path, !children.hidden);
    twisty.textContent = folderIcon(!children.hidden);
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

/* ------------------------------------------------------------- thumbnails */

// A card reads a small cached JPEG instead of the original file, so a normal
// start never touches the added folders' disk — the reason a slow external
// drive froze the first paint. The cache fills lazily: when a card's
// thumbnail is missing, the original is read once, drawn small on a canvas,
// and the JPEG bytes are handed to Rust to keep for every later run.
const THUMB_EDGE = 512;
// ponytail: 2 concurrent reads keeps a spinning external disk responsive.
// Make it a setting if a fast NAS ever needs more.
const THUMB_JOBS = 2;
const thumbQueue = [];
const thumbQueued = new Set();
// A drive that is unplugged fails every read. Remembered for the session so a
// dead disk is asked once per file, not once per render.
const thumbFailed = new Set();
// Thumbnails built this session. Their cache URL 404ed once before the build,
// so a re-render asks with a changed URL rather than trusting the webview not
// to have remembered that 404.
const thumbBuilt = new Set();
const thumbWaiting = new Map();
let thumbActive = 0;

function thumbUrl(entry) {
  const url = fileUrl(`${state.thumbsDir}/${lib.thumbName(entry.path, entry.mtime, entry.size)}`);
  return thumbBuilt.has(entry.path) ? `${url}?fresh` : url;
}

function markMissing(img) {
  const host = img.closest('.thumb');
  if (host) host.classList.add('missing');
  img.remove();
}

// A read from a dying disk can hang rather than fail, and it would pin one of
// the queue slots forever.
function withTimeout(promise, seconds) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), seconds * 1000);
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function drawThumb(source, width, height) {
  const scale = Math.min(1, THUMB_EDGE / Math.max(width, height, 1));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('cannot draw'))), 'image/jpeg', 0.82)
  );
}

function loadPhoto(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    // The asset protocol is a different origin from the page. Without a CORS
    // load the canvas is tainted and toBlob fails, so nothing ever reaches the
    // cache. Tauri answers with Access-Control-Allow-Origin for exactly this.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`cannot read ${path}`));
    image.src = fileUrl(path);
  }).then((image) => drawThumb(image, image.naturalWidth, image.naturalHeight));
}

function loadVideoFrame(path) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.muted = true;
    // Same as loadPhoto: a non-CORS load taints the canvas and the poster
    // frame can never be drawn out of it.
    video.crossOrigin = 'anonymous';
    // metadata is enough: the seek itself pulls the range around the target
    // frame, and auto would read far more of the file than a poster needs.
    video.preload = 'metadata';
    // Clearing src releases the file handle, or a later rename or delete of
    // the video would fail while this element is still holding it.
    const done = (blob, error) => {
      video.removeAttribute('src');
      video.load();
      if (error) reject(error);
      else resolve(blob);
    };
    video.onerror = () => done(null, new Error(`cannot read ${path}`));
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(0.5, video.duration || 0);
    };
    video.onseeked = () =>
      drawThumb(video, video.videoWidth, video.videoHeight).then(done, (error) => done(null, error));
    video.src = fileUrl(path);
  });
}

async function makeThumb(entry) {
  const blob =
    entry.kind === 'video' ? await loadVideoFrame(entry.path) : await loadPhoto(entry.path);
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
  await window.api.saveThumb(lib.thumbName(entry.path, entry.mtime, entry.size), bytes);
  return blob;
}

function showThumb(path, blob) {
  thumbBuilt.add(path);
  const img = thumbWaiting.get(path);
  if (!img || !img.isConnected) return;
  // The blob that was just drawn is shown directly; the saved file serves the
  // next run. Re-pointing at the cache here could hit the 404 the browser
  // already remembers for this URL.
  img.onerror = () => markMissing(img);
  img.onload = () => URL.revokeObjectURL(img.src);
  img.src = URL.createObjectURL(blob);
}

function pumpThumbs() {
  while (thumbActive < THUMB_JOBS && thumbQueue.length > 0) {
    const entry = thumbQueue.shift();
    thumbActive += 1;
    withTimeout(makeThumb(entry), 30)
      .then((blob) => showThumb(entry.path, blob))
      .catch(() => {
        thumbFailed.add(entry.path);
        const img = thumbWaiting.get(entry.path);
        if (img && img.isConnected) markMissing(img);
      })
      .finally(() => {
        thumbQueued.delete(entry.path);
        thumbWaiting.delete(entry.path);
        thumbActive -= 1;
        pumpThumbs();
      });
  }
}

function requestThumb(entry, img) {
  if (thumbFailed.has(entry.path)) return markMissing(img);
  if (!thumbQueued.has(entry.path)) {
    thumbQueued.add(entry.path);
    thumbQueue.push(entry);
  }
  // The latest rendered card wins; an older one is disconnected by now.
  thumbWaiting.set(entry.path, img);
  pumpThumbs();
}

function thumb(entry) {
  const badge = entry.kind === 'video' ? '<span class="badge">VIDEO</span>' : '';
  if (entry.kind === 'video' && !state.settings.showVideoThumbs) return badge;
  return `<img src="${thumbUrl(entry)}" loading="lazy" alt="" />${badge}`;
}

function card(entry) {
  const element = document.createElement('div');
  element.className = 'card file-entry';
  element.dataset.path = entry.path;
  markLastOpened(element, entry.path);
  const videoOff = entry.kind === 'video' && !state.settings.showVideoThumbs;
  element.innerHTML = `
    <div class="thumb${videoOff ? ' off' : ''}">${thumb(entry)}</div>
    <div class="card-body">
      <div class="card-name" title="${escapeHtml(entry.path)}"><span class="entry-icon">${fileIcon(entry)}</span>${escapeHtml(entry.name)}</div>
      <div class="card-meta">
        <span class="stars">${starsHtml(entry.rating)}</span>
        <span class="fav ${entry.favorite ? 'on' : ''}" data-fav="1">${entry.favorite ? '♥' : '♡'}</span>
      </div>
      <div>${entry.tags.map((tag) => `<span class="tag-chip">${escapeHtml(tag)}</span>`).join('')}</div>
    </div>`;
  // A missing thumbnail is the signal to build one. loading="lazy" means only
  // cards near the viewport fire this, which is the queue's natural window.
  const img = element.querySelector('.thumb img');
  if (img) img.onerror = () => requestThumb(entry, img);
  return element;
}

// Detail rows like the file explorer. No images at all, which also makes it
// the fast view for a disk with no thumbnails yet.
function listRow(entry) {
  const element = document.createElement('div');
  element.className = 'list-item file-entry';
  element.dataset.path = entry.path;
  markLastOpened(element, entry.path);
  element.innerHTML = `
    <span class="entry-icon">${fileIcon(entry)}</span>
    <span class="list-name" title="${escapeHtml(entry.path)}">${escapeHtml(entry.name)}</span>
    ${entry.kind === 'video' ? '<span class="badge">VIDEO</span>' : ''}
    <span class="stars">${starsHtml(entry.rating)}</span>
    <span class="fav ${entry.favorite ? 'on' : ''}" data-fav="1">${entry.favorite ? '♥' : '♡'}</span>
    <span class="list-size">${lib.formatSize(entry.size)}</span>
    <span class="list-date">${entry.mtime ? new Date(entry.mtime).toLocaleDateString() : ''}</span>`;
  return element;
}

function openFolder(node) {
  state.folder = node.path;
  state.shown = PAGE;
  expandedFolders.set(node.path, true);
  render();
}

function folderCard(node) {
  const element = document.createElement('div');
  element.className = 'folder-card';
  element.title = `${node.path}\nDouble click to open`;
  element.innerHTML = `
    <span class="folder-card-icon">📁</span>
    <span class="folder-card-body">
      <span class="folder-card-name">${escapeHtml(node.name)}</span>
      <span class="folder-card-count">${countIn(node)} file${countIn(node) === 1 ? '' : 's'}</span>
    </span>`;
  element.addEventListener('dblclick', () => openFolder(node));
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

function syncViews() {
  const listMode = state.settings.view === 'list';
  $('view-grid').classList.toggle('on', !listMode);
  $('view-list').classList.toggle('on', listMode);
}

function renderGrid() {
  const selectedFolder = state.folder
    ? lib.findTreeNode(derive().tree, state.folder)
    : null;
  if (selectedFolder && state.query.trim() === '') {
    renderFolderContents(selectedFolder);
    return;
  }

  let matches = visibleEntries();
  // Filter results come from anywhere in the library, so a flat list loses
  // where each file lives. Sorting by folder and putting a folder header over
  // each run keeps the tree visible in the results.
  const grouped = state.query.trim() !== '';
  if (grouped) {
    matches = [...matches].sort(
      (a, b) => a.dir.localeCompare(b.dir) || a.name.localeCompare(b.name)
    );
  }
  const page = matches.slice(0, state.shown);
  const listMode = state.settings.view === 'list';

  const grid = $('grid');
  grid.textContent = '';
  grid.classList.toggle('list', listMode);
  let lastDir = null;
  for (const entry of page) {
    if (grouped && entry.dir !== lastDir) {
      lastDir = entry.dir;
      grid.append(groupTitle(`📂 ${entry.dir}`));
    }
    grid.append(listMode ? listRow(entry) : card(entry));
  }
  syncViews();

  const where = state.folder ? ` in ${state.folder}` : '';
  $('status').textContent =
    matches.length === 0
      ? `No match${where}`
      : `${matches.length} file${matches.length === 1 ? '' : 's'}${where}` +
        (page.length < matches.length ? ` — showing ${page.length}` : '');

  $('show-more').hidden = page.length >= matches.length;
  syncTokens();
}

function renderFolderContents(node) {
  const listMode = state.settings.view === 'list';
  const folders = node.folders;
  const files = node.files;
  const visibleFolders = folders.slice(0, state.shown);
  const fileSlots = Math.max(0, state.shown - visibleFolders.length);
  const visibleFiles = files.slice(0, fileSlots);

  const grid = $('grid');
  grid.textContent = '';
  grid.classList.toggle('list', listMode);

  if (folders.length > 0) {
    grid.append(groupTitle(`📁 Folders (${folders.length})`));
    for (const folder of visibleFolders) grid.append(folderCard(folder));
  }
  if (files.length > 0 && fileSlots > 0) {
    grid.append(groupTitle(`📄 Files (${files.length})`));
    for (const entry of visibleFiles) grid.append(listMode ? listRow(entry) : card(entry));
  }
  if (folders.length === 0 && files.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'This folder has no indexed files.';
    grid.append(empty);
  }

  syncViews();
  syncTokens();
  syncLastOpened();
  $('status').textContent =
    `${folders.length} folder${folders.length === 1 ? '' : 's'}, ` +
    `${files.length} file${files.length === 1 ? '' : 's'} in ${node.path}`;
  $('show-more').hidden = visibleFolders.length + visibleFiles.length >= folders.length + files.length;
}

function render() {
  renderTree();
  renderCatalog();
  renderGrid();
}

/* ------------------------------------------------------------ file actions */

function entryAt(element) {
  const host = element.closest('.card, .list-item');
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
  if (action === 'open') return openEntry(entry);
  if (action === 'reveal') return window.api.revealEntry(entry.path);
  if (action === 'copyPath') return window.api.copyPath(entry.path);
  if (action === 'delete') return window.api.deleteEntry(entry.path);
  // Rename shares the Properties dialog, so there is one place that edits a
  // file's name, tags and rating. A brand-new tag lands there too, because it
  // needs typing and a native menu cannot take text.
  if (action === 'rename') return openProperties(entry, 'name');
  if (action === 'newTag') return openProperties(entry, 'tags');
  if (action === 'properties') return openProperties(entry);
  if (action.startsWith('tag:')) {
    const tag = action.slice(4);
    const tags = entry.tags.includes(tag)
      ? entry.tags.filter((existing) => existing !== tag)
      : [...entry.tags, tag];
    return patch(entry, { tags });
  }
}

// Every tag in the library, checked when this file already has it, so the
// context menu can toggle tags without opening a dialog.
function tagMenu(entry) {
  const known = derive().tags.map(({ tag }) => tag);
  return [...new Set([...known, ...entry.tags])].map((tag) => ({
    tag,
    on: entry.tags.includes(tag),
  }));
}

/* ---------------------------------------------------------------- dialogs */

let propertyTarget = null;
let propertyRating = 0;

// focus names the field the user came for: 'name' from Rename, 'tags' from
// New Tag…, nothing from Properties itself.
function openProperties(entry, focus) {
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
  if (focus === 'name') $('prop-name').select();
  if (focus === 'tags') $('prop-tags').focus();
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
  $('set-video-thumbs').checked = state.settings.showVideoThumbs;
  $('set-card-size').value = state.settings.cardSize;
  $('set-data-dir').textContent = state.dataDir;
  $('set-version').textContent = state.version;
  $('settings').hidden = false;
}

async function saveCurrentSettings() {
  // Spread first: the view mode lives in settings but is set from the
  // toolbar, and rebuilding from the dialog alone would drop it.
  state.settings = {
    ...state.settings,
    theme: $('set-theme').value,
    openOnSingleClick: $('set-single-click').checked,
    showVideoThumbs: $('set-video-thumbs').checked,
    cardSize: Number($('set-card-size').value),
  };
  applySettings();
  // Toggling video thumbnails changes what the cards show.
  renderGrid();
  await window.api.saveSettings(state.settings);
}

function applySettings() {
  const root = document.documentElement;
  if (state.settings.theme === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', state.settings.theme);
  root.style.setProperty('--card-size', `${state.settings.cardSize}px`);
}

/* ------------------------------------------------------------------- wiring */

// A walk of a big or slow disk takes a while. The command runs off the main
// thread, so the window stays alive; this makes the wait visible instead of
// looking like a dead button.
async function busy(button, label, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  try {
    return await task();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

$('add-folder').addEventListener('click', () =>
  busy($('add-folder'), 'Scanning…', () => window.api.addFolder())
);
$('add-files').addEventListener('click', () => window.api.addFiles());
$('rescan').addEventListener('click', () =>
  busy($('rescan'), 'Rescanning…', () => window.api.rescan())
);
$('refresh-thumbs').addEventListener('click', () =>
  busy($('refresh-thumbs'), 'Clearing…', async () => {
    if (!(await window.api.refreshThumbs())) return;
    // Forget this session's failures too, so a re-plugged drive gets retried.
    thumbFailed.clear();
    thumbBuilt.clear();
    renderGrid();
  })
);

async function setView(view) {
  if (state.settings.view === view) return;
  state.settings.view = view;
  renderGrid();
  await window.api.saveSettings(state.settings);
}

$('view-grid').addEventListener('click', () => void setView('grid'));
$('view-list').addEventListener('click', () => void setView('list'));
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

  if (state.settings.openOnSingleClick) await openEntry(entry);
});

$('grid').addEventListener('dblclick', async (event) => {
  const entry = entryAt(event.target);
  if (entry && !state.settings.openOnSingleClick) await openEntry(entry);
});

$('grid').addEventListener('contextmenu', async (event) => {
  const entry = entryAt(event.target);
  if (!entry) return;
  event.preventDefault();
  await window.api.entryMenu((action) => void runAction(action, entry), tagMenu(entry));
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
$('set-video-thumbs').addEventListener('change', () => void saveCurrentSettings());
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
