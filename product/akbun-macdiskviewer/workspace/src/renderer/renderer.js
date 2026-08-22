'use strict';

const api = window.diskViewer;
const { filterWorktrees, formatBytes, sortWorktrees } = window.diskViewModel;
const state = {
  path: '/', scope: 'children', search: '', sort: 'size', direction: 'desc',
  page: 0, pageSize: 100, count: 0, catalog: null, view: 'disk',
  worktrees: [], terminals: null,
};

const elements = Object.fromEntries([
  'viewTitle', 'lastScanText', 'diskRing', 'usedPercent', 'usedText', 'capacityText',
  'capacityFill', 'itemCount', 'issueCount', 'scanPanel', 'scanTitle', 'scanPath',
  'scanStats', 'pauseButton', 'cancelButton', 'scanButton', 'searchInput', 'scopeSelect',
  'sortSelect', 'breadcrumbs', 'fileRows', 'emptyState', 'resultCount', 'pageText',
  'previousButton', 'nextButton', 'permissionBanner', 'permissionButton',
  'bannerPermissionButton', 'largestButton', 'recentButton', 'diskNav', 'worktreeNav',
  'diskView', 'worktreeView', 'diskSearchBox', 'worktreeSize', 'worktreeCount',
  'worktreeSearch', 'worktreeSort', 'worktreeRows', 'worktreeEmpty',
  'worktreeResultCount', 'contextMenu',
].map((id) => [id, document.getElementById(id)]));

function formatCount(value) {
  return new Intl.NumberFormat().format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(Number(value)));
}

function renderDisk(disk) {
  const percent = disk.total ? Math.round((disk.used / disk.total) * 100) : 0;
  elements.usedPercent.textContent = `${percent}%`;
  elements.usedText.textContent = `${formatBytes(disk.used)} used`;
  elements.capacityText.textContent = `${formatBytes(disk.free)} available of ${formatBytes(disk.total)}`;
  elements.capacityFill.style.width = `${percent}%`;
  elements.diskRing.style.background = `conic-gradient(var(--accent) ${percent}%, var(--soft) ${percent}%)`;
}

function renderCatalog(metadata) {
  state.catalog = metadata;
  if (!metadata) {
    elements.lastScanText.textContent = 'No completed scan yet';
    elements.itemCount.textContent = '—';
    elements.issueCount.textContent = '—';
    elements.permissionBanner.classList.add('hidden');
    return;
  }
  const completedValue = /^\d+$/.test(metadata.completedAt) ? Number(metadata.completedAt) : metadata.completedAt;
  elements.lastScanText.textContent = `Last complete scan ${new Date(completedValue).toLocaleString()}`;
  elements.itemCount.textContent = formatCount(metadata.root?.descendants ?? 0);
  elements.issueCount.textContent = formatCount(metadata.issues);
  elements.permissionBanner.classList.toggle('hidden', Number(metadata.issues) === 0);
}

function renderScan(scan) {
  const active = ['running', 'paused'].includes(scan.status);
  elements.scanPanel.classList.toggle('hidden', !active);
  elements.scanButton.disabled = active;
  elements.scanButton.textContent = active ? 'Scanning…' : 'Scan disk';
  if (scan.status === 'error') elements.lastScanText.textContent = `Scan failed: ${scan.error}`;
  if (!active) return;
  const progress = scan.progress ?? {};
  elements.scanTitle.textContent = scan.status === 'paused' ? 'Scan paused' : 'Scanning with low priority';
  elements.scanPath.textContent = progress.currentPath ?? '/';
  elements.scanStats.textContent = `${formatCount(progress.entries)} items · ${formatBytes(progress.bytes)} indexed · ${formatCount(progress.issues)} unavailable`;
  elements.pauseButton.textContent = scan.status === 'paused' ? 'Resume' : 'Pause';
}

function breadcrumbParts(targetPath) {
  if (targetPath === '/') return [{ label: 'Macintosh HD', path: '/' }];
  const parts = targetPath.split('/').filter(Boolean);
  return [{ label: 'Macintosh HD', path: '/' }, ...parts.map((label, index) => ({
    label,
    path: `/${parts.slice(0, index + 1).join('/')}`,
  }))];
}

function renderBreadcrumbs() {
  elements.breadcrumbs.replaceChildren();
  breadcrumbParts(state.path).forEach((part, index, all) => {
    const button = document.createElement('button');
    button.className = 'crumb';
    button.textContent = part.label;
    button.title = part.path;
    button.addEventListener('click', () => navigate(part.path));
    elements.breadcrumbs.append(button);
    if (index < all.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'crumb-separator';
      separator.textContent = '›';
      elements.breadcrumbs.append(separator);
    }
  });
}

async function loadTerminals() {
  if (!state.terminals) state.terminals = await api.terminals();
  return state.terminals;
}

function contextButton(label, action, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener('click', () => {
    elements.contextMenu.classList.add('hidden');
    void action();
  });
  return button;
}

async function showContextMenu(clientX, clientY, targetPath, kind) {
  const terminals = await loadTerminals();
  const items = [contextButton('Show in Finder', () => api.showInFinder(targetPath))];
  const separator = document.createElement('div');
  separator.className = 'context-separator';
  items.push(separator);
  if (terminals.length) {
    terminals.forEach((terminal) => {
      items.push(contextButton(`Open in ${terminal.name}`, () => api.openInTerminal(terminal.appPath, targetPath, kind)));
    });
  } else {
    items.push(contextButton('No terminal apps detected', async () => {}, true));
  }
  elements.contextMenu.replaceChildren(...items);
  elements.contextMenu.style.left = `${Math.min(clientX, window.innerWidth - 250)}px`;
  elements.contextMenu.style.top = `${Math.min(clientY, window.innerHeight - 220)}px`;
  elements.contextMenu.classList.remove('hidden');
}

function fileRow(item) {
  const row = document.createElement('tr');
  row.className = item.kind;
  row.title = item.path;
  const nameCell = document.createElement('td');
  const name = document.createElement('div');
  name.className = 'file-name';
  const icon = document.createElement('span');
  icon.className = 'file-icon';
  icon.textContent = item.kind === 'directory' ? '▰' : item.kind === 'link' ? '↗' : '▪';
  const label = document.createElement('span');
  label.textContent = item.name;
  name.append(icon, label);
  nameCell.append(name);
  const kindCell = document.createElement('td');
  kindCell.className = 'kind-label';
  kindCell.textContent = item.kind === 'directory' ? `${formatCount(item.descendants)} items` : item.kind;
  const sizeCell = document.createElement('td');
  sizeCell.className = 'number size-label';
  sizeCell.textContent = formatBytes(item.size_bytes);
  sizeCell.title = `Logical size: ${formatBytes(item.logical_bytes)}`;
  const dateCell = document.createElement('td');
  dateCell.className = 'date-label';
  dateCell.textContent = formatDate(item.modified_ms);
  row.append(nameCell, kindCell, sizeCell, dateCell);
  row.addEventListener('dblclick', () => {
    if (item.kind === 'directory') navigate(item.path);
  });
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    void showContextMenu(event.clientX, event.clientY, item.path, item.kind);
  });
  return row;
}

async function loadRows() {
  renderBreadcrumbs();
  const result = await api.query(state);
  state.count = Number(result.count) || 0;
  elements.fileRows.replaceChildren(...result.rows.map(fileRow));
  elements.emptyState.classList.toggle('hidden', result.rows.length !== 0);
  const start = state.count ? state.page * state.pageSize + 1 : 0;
  const end = Math.min((state.page + 1) * state.pageSize, state.count);
  elements.resultCount.textContent = `${formatCount(start)}–${formatCount(end)} of ${formatCount(state.count)} items`;
  elements.pageText.textContent = `Page ${state.page + 1}`;
  elements.previousButton.disabled = state.page === 0;
  elements.nextButton.disabled = end >= state.count;
}

function navigate(targetPath) {
  state.path = targetPath;
  state.scope = 'children';
  state.page = 0;
  elements.scopeSelect.value = 'children';
  void loadRows();
}

function setSort(sort, direction) {
  state.sort = sort;
  state.direction = direction;
  state.page = 0;
  elements.sortSelect.value = `${sort}-${direction}`;
  void loadRows();
}

function worktreeRow(item) {
  const row = document.createElement('tr');
  row.title = item.path;
  const identity = document.createElement('td');
  const name = document.createElement('strong');
  name.textContent = item.repository;
  const path = document.createElement('span');
  path.className = 'worktree-path';
  path.textContent = item.path;
  identity.append(name, path);
  const branch = document.createElement('td');
  const badge = document.createElement('span');
  badge.className = 'branch-badge';
  badge.textContent = item.branch || 'detached';
  branch.append(badge);
  const size = document.createElement('td');
  size.className = 'number size-label';
  size.textContent = formatBytes(item.sizeBytes);
  const modified = document.createElement('td');
  modified.className = 'date-label';
  modified.textContent = formatDate(item.modifiedMs);
  const actions = document.createElement('td');
  actions.className = 'row-actions';
  const finder = document.createElement('button');
  finder.className = 'mini-button';
  finder.textContent = 'Finder';
  finder.addEventListener('click', (event) => {
    event.stopPropagation();
    void api.showInFinder(item.path);
  });
  const terminal = document.createElement('button');
  terminal.className = 'mini-button';
  terminal.textContent = 'Terminal…';
  terminal.addEventListener('click', (event) => {
    event.stopPropagation();
    const bounds = terminal.getBoundingClientRect();
    void showContextMenu(bounds.left, bounds.bottom + 4, item.path, 'directory');
  });
  actions.append(finder, terminal);
  row.append(identity, branch, size, modified, actions);
  row.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    void showContextMenu(event.clientX, event.clientY, item.path, 'directory');
  });
  return row;
}

function renderWorktrees() {
  const filtered = filterWorktrees(state.worktrees, elements.worktreeSearch.value);
  const sorted = sortWorktrees(filtered, elements.worktreeSort.value);
  elements.worktreeRows.replaceChildren(...sorted.map(worktreeRow));
  elements.worktreeEmpty.classList.toggle('hidden', sorted.length !== 0);
  elements.worktreeResultCount.textContent = `${formatCount(sorted.length)} of ${formatCount(state.worktrees.length)} worktrees`;
}

async function loadWorktrees() {
  const catalog = await api.worktrees();
  state.worktrees = catalog.items;
  elements.worktreeSize.textContent = formatBytes(catalog.totalSizeBytes);
  elements.worktreeCount.textContent = formatCount(catalog.count);
  renderWorktrees();
}

function showView(view) {
  state.view = view;
  const worktrees = view === 'worktrees';
  elements.diskView.classList.toggle('hidden', worktrees);
  elements.worktreeView.classList.toggle('hidden', !worktrees);
  elements.diskSearchBox.classList.toggle('hidden', worktrees);
  elements.diskNav.classList.toggle('active', !worktrees);
  elements.worktreeNav.classList.toggle('active', worktrees);
  elements.viewTitle.textContent = worktrees ? 'Worktree storage' : 'Macintosh HD';
  if (worktrees) void loadWorktrees();
}

let searchTimer = null;
elements.searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.search = elements.searchInput.value;
    state.page = 0;
    void loadRows();
  }, 220);
});
elements.scopeSelect.addEventListener('change', () => {
  state.scope = elements.scopeSelect.value;
  state.page = 0;
  void loadRows();
});
elements.sortSelect.addEventListener('change', () => {
  const [sort, direction] = elements.sortSelect.value.split('-');
  setSort(sort, direction);
});
elements.previousButton.addEventListener('click', () => {
  state.page = Math.max(0, state.page - 1);
  void loadRows();
});
elements.nextButton.addEventListener('click', () => {
  state.page += 1;
  void loadRows();
});
elements.scanButton.addEventListener('click', () => void api.startScan());
elements.pauseButton.addEventListener('click', async () => {
  if (elements.pauseButton.textContent === 'Resume') await api.resumeScan();
  else await api.pauseScan();
});
elements.cancelButton.addEventListener('click', () => void api.cancelScan());
elements.permissionButton.addEventListener('click', () => void api.openFullDiskAccess());
elements.bannerPermissionButton.addEventListener('click', () => void api.openFullDiskAccess());
elements.diskNav.addEventListener('click', () => showView('disk'));
elements.worktreeNav.addEventListener('click', () => showView('worktrees'));
elements.largestButton.addEventListener('click', () => {
  showView('disk');
  state.path = '/';
  state.scope = 'all';
  elements.scopeSelect.value = 'all';
  setSort('size', 'desc');
});
elements.recentButton.addEventListener('click', () => {
  showView('disk');
  state.path = '/';
  state.scope = 'all';
  elements.scopeSelect.value = 'all';
  setSort('modified', 'desc');
});
elements.worktreeSearch.addEventListener('input', renderWorktrees);
elements.worktreeSort.addEventListener('change', renderWorktrees);
document.addEventListener('click', () => elements.contextMenu.classList.add('hidden'));
window.addEventListener('blur', () => elements.contextMenu.classList.add('hidden'));

void api.onScanState(async (scan) => {
  renderScan(scan);
  if (scan.status === 'complete') {
    const next = await api.getState();
    renderCatalog(next.catalog);
    await Promise.all([loadRows(), loadWorktrees()]);
  }
});

async function initialize() {
  const initial = await api.getState();
  renderDisk(initial.disk);
  renderCatalog(initial.catalog);
  renderScan(initial.scan);
  await Promise.all([loadRows(), loadWorktrees()]);
}

void initialize();
