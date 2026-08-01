'use strict';

// What the page does with the library once it has it: search, the tree, the
// counts. Plain node, no app binary, so the pull request job needs neither
// Rust nor a webview.
//
// Scanning, the rescan merge and the settings fallback live in Rust now and are
// tested in src-tauri/src/library.rs.

const assert = require('node:assert');
const { test } = require('node:test');
const {
  buildTree,
  formatSize,
  normalizeTag,
  parseQuery,
  ratingCounts,
  searchEntries,
  tagCounts,
} = require('../src/library');

// The shape Rust serialises. Written out here rather than built by a helper
// from the source, so that a field rename in Rust fails this test.
function entry(path, extra = {}) {
  const name = path.split(/[\\/]/).pop();
  return {
    path,
    name,
    dir: path.slice(0, path.length - name.length - 1),
    kind: /\.(mp4|mov|mkv)$/i.test(name) ? 'video' : 'photo',
    size: 1024,
    mtime: 0,
    rating: 0,
    favorite: false,
    tags: [],
    ...extra,
  };
}

const LIBRARY = [
  entry('C:\\photos\\trip\\beach.jpg', { rating: 5, favorite: true, tags: ['beach', 'summer'] }),
  entry('C:\\photos\\trip\\sunset.png', { rating: 3, tags: ['beach'] }),
  entry('C:\\photos\\clips\\dive.mp4', { rating: 4, tags: ['summer'] }),
  entry('C:\\photos\\notes.jpg'),
];

test('normalizeTag folds case and closes the gap that would break tag:', () => {
  assert.strictEqual(normalizeTag('  Beach Trip '), 'beach-trip');
});

test('free text matches the file name and ignores case', () => {
  const found = searchEntries(LIBRARY, 'BEACH');
  assert.deepStrictEqual(found.map((item) => item.name), ['beach.jpg']);
});

test('search tokens filter by tag, rating, type and favorite', () => {
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'tag:beach').map((item) => item.name),
    ['beach.jpg', 'sunset.png']
  );
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'type:video').map((item) => item.name),
    ['dive.mp4']
  );
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'fav').map((item) => item.name),
    ['beach.jpg']
  );
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'rating:>=4').map((item) => item.name),
    ['beach.jpg', 'dive.mp4']
  );
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'rating:=3').map((item) => item.name),
    ['sunset.png']
  );
});

test('tokens combine, and two tags mean both rather than either', () => {
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'tag:beach tag:summer').map((item) => item.name),
    ['beach.jpg']
  );
  assert.deepStrictEqual(
    searchEntries(LIBRARY, 'sun tag:beach rating:>=3').map((item) => item.name),
    ['sunset.png']
  );
});

test('an unknown token stays free text instead of dropping out', () => {
  assert.strictEqual(parseQuery('holiday size:big').text, 'holiday size:big');
});

test('rating:12 and type:audio are ignored rather than matching nothing', () => {
  assert.strictEqual(parseQuery('rating:12').rating, null);
  assert.strictEqual(parseQuery('type:audio').kind, null);
});

test('the tree keeps folders and files apart and sorts both', () => {
  const [root] = buildTree([{ path: 'C:\\photos' }], LIBRARY);

  assert.strictEqual(root.name, 'photos');
  assert.deepStrictEqual(root.folders.map((folder) => folder.name), ['clips', 'trip']);
  assert.deepStrictEqual(root.files.map((file) => file.name), ['notes.jpg']);
  assert.deepStrictEqual(
    root.folders[1].files.map((file) => file.name),
    ['beach.jpg', 'sunset.png']
  );
});

test('a sibling folder with a shared prefix does not leak into the tree', () => {
  const [root] = buildTree([{ path: 'C:\\photos' }], [
    ...LIBRARY,
    entry('C:\\photos-backup\\other.jpg'),
  ]);
  assert.ok(!root.folders.some((folder) => folder.name.includes('backup')));
  assert.strictEqual(root.files.length, 1);
});

test('tag counts are ordered by use', () => {
  assert.deepStrictEqual(tagCounts(LIBRARY), [
    { tag: 'beach', count: 2 },
    { tag: 'summer', count: 2 },
  ]);
  assert.deepStrictEqual(ratingCounts(LIBRARY), [1, 0, 0, 1, 1, 1]);
});

test('formatSize picks the unit', () => {
  assert.strictEqual(formatSize(512), '512 B');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(5 * 1024 * 1024), '5.0 MB');
});
