// Pure helpers over the catalog document. Nothing here touches the DOM or the
// network, so `node --test` runs them without a browser.

// The catalog is read from GitHub raw at page load, so editing the JSON on
// GitHub changes the live page without waiting for a Cloudflare build. The
// same file is also published with the site, and is the fallback below.
export const REMOTE_CATALOG_URL =
  'https://raw.githubusercontent.com/choisungwook/portfolio/master/product/akbun-productcatalog/workspace/public/data/products.json';

export const LOCAL_CATALOG_URL = '/data/products.json';

// Used when a product carries no repoBase of its own and the document omits it.
export const DEFAULT_REPO_BASE = 'https://github.com/choisungwook/portfolio/tree/master/product';

// The filter row. `all` is first and is the state the page opens in.
// A product either runs in a browser or it is installed, so `web` and
// `desktop` carry everything that is a product; `reference` is the shelf for
// the two layout libraries, which are neither.
export const KINDS = [
  { id: 'all', label: 'All' },
  { id: 'web', label: 'Web' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'reference', label: 'Reference' },
];

const KIND_IDS = new Set(KINDS.map((kind) => kind.id).filter((id) => id !== 'all'));

/**
 * Rejects anything that is not an http(s) URL.
 * Every link on the page comes from a document fetched over the network, so a
 * `javascript:` value would be script injection through an href that escaping
 * alone does not stop.
 */
function safeUrl(value, field, index) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`products[${index}].${field} is not a URL: ${raw}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`products[${index}].${field} must be http or https.`);
  }
  return parsed.href;
}

function normalizeProduct(entry, index, repoBase) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`products[${index}] is not an object.`);
  }

  const id = String(entry.id ?? '').trim();
  if (!id) throw new Error(`products[${index}] has no "id".`);

  const kind = String(entry.kind ?? '').trim().toLowerCase();
  if (kind && !KIND_IDS.has(kind)) {
    throw new Error(`products[${index}].kind is "${kind}", which is not one of ${[...KIND_IDS].join(', ')}.`);
  }

  // The repo link is derived from the id, because every product is a directory
  // of the same name. An entry that lives elsewhere overrides it with "repo".
  const repo = entry.repo
    ? safeUrl(entry.repo, 'repo', index)
    : `${repoBase.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;

  return {
    id,
    name: String(entry.name ?? id).trim() || id,
    description: String(entry.description ?? '').trim(),
    kind: kind || 'web',
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag).trim()).filter(Boolean) : [],
    released: String(entry.released ?? '').trim(),
    repo,
    site: safeUrl(entry.site, 'site', index),
  };
}

/**
 * Parses the catalog document, given either as text or as an already parsed
 * object, into `{ updated, products }` with every link resolved.
 * Throws naming the offending index, because the document is edited by hand
 * and a silent skip hides the typo that dropped a product from the page.
 */
export function parseCatalog(input) {
  const doc = typeof input === 'string' ? JSON.parse(input) : input;

  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    throw new Error('The catalog is not an object.');
  }
  if (!Array.isArray(doc.products)) {
    throw new Error('The catalog has no "products" array.');
  }

  const repoBase = String(doc.repoBase ?? '').trim() || DEFAULT_REPO_BASE;
  const products = doc.products.map((entry, index) => normalizeProduct(entry, index, repoBase));

  const seen = new Set();
  for (const product of products) {
    if (seen.has(product.id)) throw new Error(`Duplicate product id: ${product.id}`);
    seen.add(product.id);
  }

  return { updated: String(doc.updated ?? '').trim(), products };
}

/**
 * Newest first, undated last, ties broken by name so the order never depends
 * on how the file happens to be written.
 */
export function sortProducts(products) {
  return [...products].sort((a, b) => {
    if (a.released !== b.released) {
      if (!a.released) return 1;
      if (!b.released) return -1;
      return a.released < b.released ? 1 : -1;
    }
    return a.name.localeCompare(b.name);
  });
}

function haystack(product) {
  return [product.name, product.id, product.description, product.kind, ...product.tags]
    .join(' ')
    .toLowerCase();
}

/**
 * Filters by kind and by search text. Every word has to match somewhere, so
 * typing more words narrows the grid instead of widening it.
 */
export function filterProducts(products, query = '', kind = 'all') {
  const words = String(query ?? '').toLowerCase().split(/\s+/).filter(Boolean);

  return products.filter((product) => {
    if (kind !== 'all' && product.kind !== kind) return false;
    if (!words.length) return true;
    const text = haystack(product);
    return words.every((word) => text.includes(word));
  });
}

/** How many products each filter chip would show, `all` included. */
export function kindCounts(products) {
  const counts = { all: products.length };
  for (const { id } of KINDS) {
    if (id !== 'all') counts[id] = 0;
  }
  for (const product of products) {
    counts[product.kind] = (counts[product.kind] ?? 0) + 1;
  }
  return counts;
}

/** `2026-08-05` reads as `26.8.5`, the format the repository README uses. */
export function shortDate(released) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(released ?? '').trim());
  if (!match) return '';
  const [, year, month, day] = match;
  return `${year.slice(2)}.${Number(month)}.${Number(day)}`;
}
