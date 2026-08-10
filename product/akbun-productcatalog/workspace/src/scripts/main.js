// The DOM side. Fetching, rendering and event wiring. Everything that needs
// parsing, sorting or filtering is handed to src/lib/catalog.js, which is what
// the tests cover.
import {
  parseCatalog,
  sortProducts,
  filterProducts,
  kindCounts,
  shortDate,
  KINDS,
  REMOTE_CATALOG_URL,
} from '../lib/catalog.js';

// GitHub raw is the source of truth; the copy inlined into the page at build
// time is only there so a blocked or slow raw does not leave an empty page.
const FETCH_TIMEOUT_MS = 6000;

const searchInput = document.getElementById('search');
const chipRow = document.getElementById('kinds');
const grid = document.getElementById('grid');
const statusEl = document.getElementById('status');
const sourceEl = document.getElementById('source');

const state = {
  products: [],
  query: '',
  kind: 'all',
  updated: '',
  source: '',
};

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

async function fetchCatalog(url) {
  // A hung request is worse than a failed one here, because the fallback never
  // gets its turn. AbortSignal.timeout puts a ceiling on both attempts.
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return parseCatalog(await response.text());
}

async function loadCatalog() {
  try {
    const catalog = await fetchCatalog(REMOTE_CATALOG_URL);
    return { ...catalog, source: 'GitHub raw' };
  } catch (remoteError) {
    try {
      const catalog = parseCatalog(document.getElementById('catalog-fallback').textContent);
      return { ...catalog, source: '배포본 사본' };
    } catch {
      // The remote failure is the one worth reporting: the inlined copy only
      // fails too when the whole page failed to load.
      throw remoteError;
    }
  }
}

function productCard(product) {
  const site = product.site
    ? `<a class="button ghost" href="${esc(product.site)}" target="_blank" rel="noopener noreferrer">사이트 열기</a>`
    : '';
  const tags = product.tags
    .map((tag) => `<li>${esc(tag)}</li>`)
    .join('');
  const date = shortDate(product.released);

  return `
    <article class="card">
      <div class="card-head">
        <h2>${esc(product.name)}</h2>
        <span class="badge kind-${esc(product.kind)}">${esc(product.kind)}</span>
      </div>
      <p class="card-desc">${esc(product.description)}</p>
      ${tags ? `<ul class="tags">${tags}</ul>` : ''}
      <div class="card-foot">
        <span class="date">${esc(date)}</span>
        <div class="card-actions">
          ${site}
          <a class="button" href="${esc(product.repo)}" target="_blank" rel="noopener noreferrer">저장소</a>
        </div>
      </div>
    </article>
  `;
}

function renderChips(counts) {
  chipRow.innerHTML = KINDS.map(({ id, label }) => {
    const count = counts[id] ?? 0;
    const pressed = state.kind === id;
    return `
      <button type="button" class="chip${pressed ? ' on' : ''}" data-kind="${esc(id)}"
              aria-pressed="${pressed}"${count ? '' : ' disabled'}>
        ${esc(label)} <span class="count">${count}</span>
      </button>
    `;
  }).join('');
}

function render() {
  // The chips count what the search box left behind, so a chip reading 0 says
  // "not in these results" rather than "click me for an empty grid".
  const searched = filterProducts(state.products, state.query, 'all');
  renderChips(kindCounts(searched));

  const shown = filterProducts(searched, '', state.kind);
  grid.innerHTML = shown.map(productCard).join('');

  if (!state.products.length) return;
  statusEl.textContent = shown.length
    ? `${shown.length}개`
    : '검색 결과 없음';
  statusEl.classList.toggle('empty', !shown.length);
}

function showError(message) {
  grid.innerHTML = '';
  statusEl.classList.add('error');
  statusEl.innerHTML = `목록을 불러오지 못했습니다: ${esc(message)} <button id="retry" type="button" class="button ghost">다시 시도</button>`;
  document.getElementById('retry').addEventListener('click', start);
}

async function start() {
  statusEl.className = 'status';
  statusEl.textContent = '불러오는 중…';
  grid.innerHTML = '';

  try {
    const { products, updated, source } = await loadCatalog();
    state.products = sortProducts(products);
    state.updated = updated;
    state.source = source;
    sourceEl.textContent = updated ? `${updated} 기준 · ${source}` : source;
    render();
  } catch (error) {
    showError(error.message);
  }
}

searchInput.addEventListener('input', () => {
  state.query = searchInput.value;
  render();
});

chipRow.addEventListener('click', (event) => {
  const chip = event.target.closest('.chip');
  if (!chip) return;
  state.kind = chip.dataset.kind;
  render();
});

// Ctrl/Cmd + K is where the search box is on every other page like this one.
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }
  if (event.key === 'Escape' && document.activeElement === searchInput && searchInput.value) {
    searchInput.value = '';
    state.query = '';
    render();
  }
});

start();
