// The DOM side. Everything that needs arithmetic or parsing is handed to
// src/lib/spec.js, which is what the tests cover.
import {
  parseSpec,
  specTitle,
  specJson,
  specFileName,
  listOperations,
  filterOperations,
  pageSlice,
  resolveRef,
  schemaText,
  snippet,
  SNIPPET_LANGS,
} from '../lib/spec.js';
import { SAMPLE_SPEC } from '../lib/sample.js';

const STORAGE_KEY = 'akbun-openapiviewer.spec';

const searchInput = document.getElementById('search');
const opList = document.getElementById('op-list');
const opCount = document.getElementById('op-count');
const allButton = document.getElementById('all-apis');
const detail = document.getElementById('detail');
const specTitleEl = document.getElementById('spec-title');
const loader = document.getElementById('loader');
const specInput = document.getElementById('spec-input');
const loadStatus = document.getElementById('load-status');
const fileInput = document.getElementById('file-input');
const exportButton = document.getElementById('export-json');
const paneLeft = document.getElementById('pane-left');
const paneBackdrop = document.getElementById('pane-backdrop');
const toggleList = document.getElementById('toggle-list');

// Below this width the sidebar is a drawer, not a pane. The same number lives
// in global.css; the two have to move together.
const drawerQuery = window.matchMedia('(max-width: 720px)');

// view is either the paginated all-APIs view or one selected operation.
// lang and pretty are the snippet choice, shared by every card on the page.
const state = {
  spec: null,
  ops: [],
  query: '',
  view: { kind: 'all', page: 1 },
  drawer: false,
  lang: SNIPPET_LANGS[0].id,
  pretty: true,
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function visibleOps() {
  return filterOperations(state.ops, state.query);
}

// ===== Drawer =====

// The drawer only exists below the breakpoint. Above it the pane is always
// there, so the open flag is ignored and the pane must never be inert.
function syncDrawer() {
  const isDrawer = drawerQuery.matches;
  if (!isDrawer) state.drawer = false;
  const open = isDrawer && state.drawer;
  paneLeft.classList.toggle('open', open);
  paneLeft.inert = isDrawer && !open;
  paneBackdrop.hidden = !open;
  toggleList.setAttribute('aria-expanded', String(open));
}

function setDrawer(open) {
  state.drawer = open;
  syncDrawer();
}

// ===== Sidebar =====

function renderSidebar() {
  const ops = visibleOps();
  opCount.textContent = state.spec ? String(ops.length) : '';
  allButton.classList.toggle('active', state.view.kind === 'all');

  opList.innerHTML = ops
    .map((op) => {
      const active = state.view.kind === 'op' && state.view.id === op.id;
      return `
        <button class="op-item${active ? ' active' : ''}${op.deprecated ? ' deprecated' : ''}"
                data-id="${esc(op.id)}" type="button">
          <span class="row">
            <span class="method m-${op.method.toLowerCase()}">${op.method}</span>
            <span class="op-path">${esc(op.path)}</span>
          </span>
          ${op.summary ? `<span class="op-summary">${esc(op.summary)}</span>` : ''}
        </button>`;
    })
    .join('');
}

// ===== Detail pane =====

function operationHtml(op) {
  const spec = state.spec;
  const operation = op.operation;
  const parts = [];

  parts.push(`
    <header class="op-head">
      <span class="method m-${op.method.toLowerCase()}">${op.method}</span>
      <code class="op-url">${esc(op.path)}</code>
      ${op.deprecated ? '<span class="badge-deprecated">deprecated</span>' : ''}
    </header>`);

  const meta = [];
  if (op.operationId) meta.push(`<code>${esc(op.operationId)}</code>`);
  for (const tag of op.tags) meta.push(`<span class="tag">${esc(tag)}</span>`);
  if (meta.length) parts.push(`<p class="op-meta">${meta.join(' ')}</p>`);

  if (op.summary) parts.push(`<p class="op-title">${esc(op.summary)}</p>`);
  if (operation.description) parts.push(`<p class="op-desc">${esc(operation.description)}</p>`);

  const params = op.parameters
    .map((param) => (param && param.$ref ? resolveRef(spec, param.$ref) : param))
    .filter((param) => param && typeof param === 'object');
  if (params.length) {
    // data-label carries the column header for the phone layout, where the
    // header row is hidden and each cell prints its own label.
    const rows = params
      .map((param) => `
        <tr>
          <td data-label="Name"><code>${esc(param.name)}</code></td>
          <td data-label="In">${esc(param.in)}</td>
          <td data-label="Required">${param.required ? '✓' : ''}</td>
          <td data-label="Type"><code>${esc(schemaText(spec, param.schema).split('\n')[0])}</code></td>
          <td data-label="Description">${esc(param.description ?? '')}</td>
        </tr>`)
      .join('');
    parts.push(`
      <h3>Parameters</h3>
      <div class="table-wrap">
        <table class="params">
          <thead><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th><th>Description</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`);
  }

  const body = operation.requestBody?.$ref
    ? resolveRef(spec, operation.requestBody.$ref)
    : operation.requestBody;
  if (body && typeof body === 'object') {
    parts.push(`<h3>Request body${body.required ? ' <span class="req">required</span>' : ''}</h3>`);
    if (body.description) parts.push(`<p class="op-desc">${esc(body.description)}</p>`);
    parts.push(contentHtml(body.content));
  }

  parts.push(`
    <h3>Request</h3>
    <div class="code-box" data-op="${esc(op.id)}">${codeBoxInner(op)}</div>`);

  const responses = Object.entries(operation.responses ?? {});
  if (responses.length) {
    parts.push('<h3>Responses</h3>');
    for (const [status, raw] of responses) {
      const response = raw?.$ref ? resolveRef(spec, raw.$ref) : raw;
      if (!response || typeof response !== 'object') continue;
      parts.push(`
        <div class="response">
          <p class="response-head"><code class="status-code s-${status[0]}">${esc(status)}</code>
            ${esc(response.description ?? '')}</p>
          ${contentHtml(response.content)}
        </div>`);
    }
  }

  return `<article class="op">${parts.join('')}</article>`;
}

// The tabs and the snippet, without the surrounding box, so a language or
// wrapping change can redraw the boxes in place instead of rebuilding the page
// and throwing the reader back to the top of it.
function codeBoxInner(op) {
  const tabs = SNIPPET_LANGS
    .map((lang) => `
      <button class="tab${lang.id === state.lang ? ' active' : ''}" type="button"
              data-lang="${lang.id}">${lang.label}</button>`)
    .join('');

  return `
    <div class="code-tabs">
      ${tabs}
      <span class="tab-gap"></span>
      <button class="tab" type="button" data-pretty="${state.pretty ? '0' : '1'}">
        ${state.pretty ? 'One line' : 'Pretty'}
      </button>
      <button class="tab" type="button" data-copy>Copy</button>
    </div>
    <pre class="snippet">${esc(snippet(state.spec, op, state.lang, state.pretty))}</pre>`;
}

function refreshCodeBoxes() {
  for (const box of detail.querySelectorAll('.code-box')) {
    const op = state.ops.find((candidate) => candidate.id === box.dataset.op);
    if (op) box.innerHTML = codeBoxInner(op);
  }
}

function contentHtml(content) {
  if (!content || typeof content !== 'object') return '';
  return Object.entries(content)
    .map(([type, media]) => `
      <div class="media">
        <p class="media-type"><code>${esc(type)}</code></p>
        <pre class="schema">${esc(schemaText(state.spec, media?.schema))}</pre>
      </div>`)
    .join('');
}

function renderDetail() {
  if (!state.spec) {
    detail.innerHTML = '<p class="empty">Load an OpenAPI spec to browse its APIs.</p>';
    return;
  }

  if (state.view.kind === 'op') {
    const op = state.ops.find((candidate) => candidate.id === state.view.id);
    detail.innerHTML = op ? operationHtml(op) : '<p class="empty">This API is gone from the loaded spec.</p>';
    detail.scrollTop = 0;
    return;
  }

  const { items, page, last } = pageSlice(visibleOps(), state.view.page);
  state.view.page = page;

  const pager = last > 1
    ? `
      <nav class="pager" aria-label="Pages">
        <button class="ghost" type="button" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>Prev</button>
        <span class="page-label">${page} / ${last}</span>
        <button class="ghost" type="button" data-page="${page + 1}" ${page >= last ? 'disabled' : ''}>Next</button>
      </nav>`
    : '';

  detail.innerHTML = `
    <div class="all-head">
      <h2>All APIs <span class="count">${visibleOps().length}</span></h2>
      ${pager}
    </div>
    ${items.length ? items.map(operationHtml).join('') : '<p class="empty">No API matches the search.</p>'}
    ${pager}`;
  detail.scrollTop = 0;
}

function render() {
  renderSidebar();
  renderDetail();
}

// ===== Export =====

// Exports the parsed document, not the pasted text, so a YAML spec comes back
// out as JSON. The object URL is revoked once the click has been handed off,
// or the whole document stays in memory for the life of the tab.
function exportJson() {
  if (!state.spec) return;
  const blob = new Blob([specJson(state.spec)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = specFileName(state.spec);
  anchor.click();
  URL.revokeObjectURL(url);
}

// ===== Loading =====

function loadSpec(text) {
  const spec = parseSpec(text);
  state.spec = spec;
  state.ops = listOperations(spec);
  state.query = '';
  state.view = { kind: 'all', page: 1 };
  setDrawer(false);
  searchInput.value = '';
  specTitleEl.textContent = specTitle(spec);
  exportButton.disabled = false;

  // A spec near the localStorage quota is not worth failing the load over.
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    /* quota exceeded: the page still works, it just starts empty next time */
  }
  render();
}

function openLoader() {
  loadStatus.textContent = '';
  loadStatus.classList.remove('error');
  loader.classList.add('open');
  // Focusing the textarea throws the on-screen keyboard over the dialog before
  // the reader has seen what it is asking for, so phones open it untouched.
  if (!drawerQuery.matches) specInput.focus();
}

function closeLoader() {
  loader.classList.remove('open');
}

function tryLoadFromInput() {
  try {
    loadSpec(specInput.value);
    closeLoader();
  } catch (error) {
    loadStatus.textContent = error?.message ?? String(error);
    loadStatus.classList.add('error');
  }
}

// ===== Wiring =====

document.getElementById('open-loader').addEventListener('click', openLoader);
exportButton.addEventListener('click', exportJson);
document.getElementById('close-loader').addEventListener('click', closeLoader);
document.getElementById('load-spec').addEventListener('click', tryLoadFromInput);
document.getElementById('load-sample').addEventListener('click', () => {
  specInput.value = SAMPLE_SPEC;
  tryLoadFromInput();
});

document.getElementById('pick-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  specInput.value = await file.text();
  fileInput.value = '';
  tryLoadFromInput();
});

toggleList.addEventListener('click', () => setDrawer(!state.drawer));
paneBackdrop.addEventListener('click', () => setDrawer(false));
drawerQuery.addEventListener('change', syncDrawer);

allButton.addEventListener('click', () => {
  state.view = { kind: 'all', page: 1 };
  setDrawer(false);
  render();
});

opList.addEventListener('click', (event) => {
  const item = event.target.closest?.('.op-item');
  if (!item) return;
  state.view = { kind: 'op', id: item.dataset.id };
  setDrawer(false);
  render();
});

detail.addEventListener('click', (event) => {
  const lang = event.target.closest?.('[data-lang]');
  if (lang) {
    state.lang = lang.dataset.lang;
    refreshCodeBoxes();
    return;
  }

  const pretty = event.target.closest?.('[data-pretty]');
  if (pretty) {
    state.pretty = pretty.dataset.pretty === '1';
    refreshCodeBoxes();
    return;
  }

  const copy = event.target.closest?.('[data-copy]');
  if (copy) {
    const code = copy.closest('.code-box').querySelector('.snippet').textContent;
    // No clipboard on an insecure origin, and the user can still select the
    // text, so a failure says so on the button rather than throwing.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(code))
      .then(() => flash(copy, 'Copied'), () => flash(copy, 'Failed'));
    return;
  }

  const button = event.target.closest?.('[data-page]');
  if (!button || button.disabled) return;
  state.view = { kind: 'all', page: Number(button.dataset.page) };
  renderDetail();
});

function flash(button, text) {
  const original = button.textContent;
  button.textContent = text;
  setTimeout(() => { button.textContent = original; }, 1200);
}

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  if (state.view.kind === 'all') state.view.page = 1;
  render();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    // The search box lives in the drawer, so it has to be on screen first.
    setDrawer(true);
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (event.key !== 'Escape') return;
  if (loader.classList.contains('open')) {
    if (state.spec) closeLoader();
    return;
  }
  setDrawer(false);
});

// ===== Start =====

syncDrawer();

const saved = localStorage.getItem(STORAGE_KEY);
if (saved) {
  try {
    loadSpec(saved);
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    render();
    openLoader();
  }
} else {
  render();
  openLoader();
}
