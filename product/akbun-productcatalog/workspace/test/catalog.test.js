import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseCatalog,
  sortProducts,
  filterProducts,
  kindCounts,
  shortDate,
  DEFAULT_REPO_BASE,
  KINDS,
} from '../src/lib/catalog.js';

const DOC = {
  repoBase: 'https://github.com/choisungwook/portfolio/tree/master/product',
  updated: '2026-08-10',
  products: [
    {
      id: 'akbun-openapiviewer',
      description: 'OpenAPI 스펙을 탐색하는 웹 페이지',
      kind: 'web',
      tags: ['astro', 'openapi'],
      released: '2026-08-05',
    },
    {
      id: 'akbun-screenshot',
      name: 'screenshot',
      kind: 'desktop',
      tags: ['electron', 'macos'],
      released: '2026-07-31',
    },
    { id: 'slo', kind: 'web', site: 'https://slo.akbun.com' },
  ],
};

function doc(overrides) {
  return { ...DOC, ...overrides };
}

test('parseCatalog derives the repo link from the id', () => {
  const { products } = parseCatalog(DOC);
  assert.equal(
    products[0].repo,
    'https://github.com/choisungwook/portfolio/tree/master/product/akbun-openapiviewer',
  );
});

test('parseCatalog accepts text as well as an object', () => {
  const fromText = parseCatalog(JSON.stringify(DOC));
  assert.deepEqual(fromText, parseCatalog(DOC));
  assert.equal(fromText.updated, '2026-08-10');
});

test('parseCatalog falls back to the default repo base', () => {
  const { products } = parseCatalog(doc({ repoBase: undefined }));
  assert.equal(products[0].repo, `${DEFAULT_REPO_BASE}/akbun-openapiviewer`);
});

test('parseCatalog fills the optional fields', () => {
  const { products } = parseCatalog(DOC);
  const slo = products[2];
  assert.equal(slo.name, 'slo', 'name defaults to the id');
  assert.equal(slo.description, '');
  assert.deepEqual(slo.tags, []);
  assert.equal(slo.released, '');
  assert.equal(slo.download, '', 'a product with no release carries no download link');
  assert.equal(products[1].name, 'screenshot', 'an explicit name wins');
});

// The download link is written out rather than derived from the id, because
// the release tags do not all start with the directory name.
test('parseCatalog keeps the download link', () => {
  const { products } = parseCatalog(doc({
    products: [{ id: 'akbun-gitdesktop', download: 'https://github.com/choisungwook/portfolio/releases?q=gitdesktop' }],
  }));
  assert.match(products[0].download, /releases\?q=gitdesktop$/);
});

test('parseCatalog rejects a download link that is not http or https', () => {
  assert.throws(
    () => parseCatalog(doc({ products: [{ id: 'x', download: 'javascript:alert(1)' }] })),
    /must be http or https/,
  );
});

test('parseCatalog keeps an explicit repo override', () => {
  const { products } = parseCatalog(doc({
    products: [{ id: 'tistory-skin', repo: 'https://github.com/choisungwook/portfolio/tree/master/product/tistory-skin/akbun' }],
  }));
  assert.match(products[0].repo, /tistory-skin\/akbun$/);
});

test('parseCatalog rejects a document that is not a catalog', () => {
  assert.throws(() => parseCatalog('[]'), /not an object/);
  assert.throws(() => parseCatalog({}), /no "products" array/);
  assert.throws(() => parseCatalog(doc({ products: [null] })), /products\[0\] is not an object/);
});

test('parseCatalog names the entry it rejects', () => {
  assert.throws(() => parseCatalog(doc({ products: [{ name: 'no id' }] })), /products\[0\] has no "id"/);
  assert.throws(() => parseCatalog(doc({ products: [{ id: 'x', kind: 'toaster' }] })), /products\[0\]\.kind/);
  assert.throws(
    () => parseCatalog(doc({ products: [{ id: 'a' }, { id: 'a' }] })),
    /Duplicate product id: a/,
  );
});

// The document is fetched over the network and its links go straight into an
// href, so a non http(s) scheme has to die at the parse, not at the click.
test('parseCatalog rejects a link that is not http or https', () => {
  assert.throws(
    () => parseCatalog(doc({ products: [{ id: 'x', site: 'javascript:alert(1)' }] })),
    /must be http or https/,
  );
  assert.throws(
    () => parseCatalog(doc({ products: [{ id: 'x', repo: 'data:text/html,hi' }] })),
    /must be http or https/,
  );
  assert.throws(
    () => parseCatalog(doc({ products: [{ id: 'x', site: 'not a url' }] })),
    /products\[0\]\.site is not a URL/,
  );
});

test('sortProducts puts the newest first and the undated last', () => {
  const { products } = parseCatalog(DOC);
  assert.deepEqual(
    sortProducts(products).map((product) => product.id),
    ['akbun-openapiviewer', 'akbun-screenshot', 'slo'],
  );
});

test('sortProducts breaks a tie by name', () => {
  const { products } = parseCatalog(doc({
    products: [
      { id: 'b', released: '2026-08-02' },
      { id: 'a', released: '2026-08-02' },
    ],
  }));
  assert.deepEqual(sortProducts(products).map((product) => product.id), ['a', 'b']);
});

test('filterProducts matches over name, description, kind and tags', () => {
  const { products } = parseCatalog(DOC);
  assert.deepEqual(filterProducts(products, 'openapi').map((p) => p.id), ['akbun-openapiviewer']);
  assert.deepEqual(filterProducts(products, 'electron').map((p) => p.id), ['akbun-screenshot']);
  assert.deepEqual(filterProducts(products, '스펙').map((p) => p.id), ['akbun-openapiviewer']);
  assert.equal(filterProducts(products, 'WEB').length, 2, 'the match is case insensitive');
});

test('filterProducts requires every word to match', () => {
  const { products } = parseCatalog(DOC);
  assert.equal(filterProducts(products, 'astro openapi').length, 1);
  assert.equal(filterProducts(products, 'astro electron').length, 0);
});

test('filterProducts combines the kind chip with the search box', () => {
  const { products } = parseCatalog(DOC);
  assert.equal(filterProducts(products, '', 'desktop').length, 1);
  assert.equal(filterProducts(products, '', 'all').length, 3);
  assert.equal(filterProducts(products, 'openapi', 'desktop').length, 0);
});

test('kindCounts counts every chip, empty ones included', () => {
  const { products } = parseCatalog(DOC);
  const counts = kindCounts(products);
  assert.equal(counts.all, 3);
  assert.equal(counts.web, 2);
  assert.equal(counts.desktop, 1);
  assert.equal(counts.reference, 0, 'a chip with nothing behind it still reports zero');
  assert.equal(counts.backend, 0);
  assert.equal(counts.skin, 0);
});

test('shortDate reads as the README does', () => {
  assert.equal(shortDate('2026-08-05'), '26.8.5');
  assert.equal(shortDate('2026-03-02'), '26.3.2');
  assert.equal(shortDate(''), '');
  assert.equal(shortDate('nonsense'), '');
});

// product/products.json is what GitHub raw serves and what the page inlines as
// its fallback, so a typo in it has to fail here rather than on the site.
test('the published catalog parses', () => {
  const raw = readFileSync(new URL('../../../products.json', import.meta.url), 'utf8');
  const { products } = parseCatalog(raw);

  assert.ok(products.length >= 20);
  assert.ok(products.some((product) => product.id === 'akbun-productcatalog'));
  for (const product of products) {
    assert.ok(product.description, `${product.id} has no description`);
    assert.ok(product.repo.startsWith('https://github.com/choisungwook/portfolio/'), product.id);
    assert.ok(KINDS.some((kind) => kind.id === product.kind), `${product.id} has kind ${product.kind}`);
  }
});

// A web product is one whose whole delivery is a URL, so an entry marked web
// with nothing to open is either mis-classified or missing its domain. Both
// show up on the site as a card nobody can act on.
test('every web product in the published catalog has a deployed domain', () => {
  const raw = readFileSync(new URL('../../../products.json', import.meta.url), 'utf8');
  const { products } = parseCatalog(raw);

  for (const product of products) {
    if (product.kind !== 'web') continue;
    assert.ok(product.site, `${product.id} is kind web but has no site`);
  }
});
