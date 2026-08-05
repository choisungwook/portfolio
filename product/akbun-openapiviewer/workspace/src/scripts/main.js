// The DOM side. Everything that needs arithmetic or parsing is handed to
// src/lib/spec.js, which is what the tests cover.
import {
  parseSpec,
  specTitle,
  listOperations,
  filterOperations,
  pageSlice,
  resolveRef,
  schemaText,
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

// view is either the paginated all-APIs view or one selected operation.
const state = {
  spec: null,
  ops: [],
  query: '',
  view: { kind: 'all', page: 1 },
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function visibleOps() {
  return filterOperations(state.ops, state.query);
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
    const rows = params
      .map((param) => `
        <tr>
          <td><code>${esc(param.name)}</code></td>
          <td>${esc(param.in)}</td>
          <td>${param.required ? '✓' : ''}</td>
          <td><code>${esc(schemaText(spec, param.schema).split('\n')[0])}</code></td>
          <td>${esc(param.description ?? '')}</td>
        </tr>`)
      .join('');
    parts.push(`
      <h3>Parameters</h3>
      <table class="params">
        <thead><tr><th>Name</th><th>In</th><th>Required</th><th>Type</th><th>Description</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`);
  }

  const body = operation.requestBody?.$ref
    ? resolveRef(spec, operation.requestBody.$ref)
    : operation.requestBody;
  if (body && typeof body === 'object') {
    parts.push(`<h3>Request body${body.required ? ' <span class="req">required</span>' : ''}</h3>`);
    if (body.description) parts.push(`<p class="op-desc">${esc(body.description)}</p>`);
    parts.push(contentHtml(body.content));
  }

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

// ===== Loading =====

function loadSpec(text) {
  const spec = parseSpec(text);
  state.spec = spec;
  state.ops = listOperations(spec);
  state.query = '';
  state.view = { kind: 'all', page: 1 };
  searchInput.value = '';
  specTitleEl.textContent = `${specTitle(spec)} · ${state.ops.length} APIs`;

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
  specInput.focus();
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

allButton.addEventListener('click', () => {
  state.view = { kind: 'all', page: 1 };
  render();
});

opList.addEventListener('click', (event) => {
  const item = event.target.closest('.op-item');
  if (!item) return;
  state.view = { kind: 'op', id: item.dataset.id };
  render();
});

detail.addEventListener('click', (event) => {
  const button = event.target.closest('[data-page]');
  if (!button || button.disabled) return;
  state.view = { kind: 'all', page: Number(button.dataset.page) };
  renderDetail();
});

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  if (state.view.kind === 'all') state.view.page = 1;
  render();
});

document.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
    return;
  }
  if (event.key === 'Escape' && loader.classList.contains('open') && state.spec) {
    closeLoader();
  }
});

// ===== Start =====

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
