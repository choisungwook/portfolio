'use strict';

// The library model has no electron import, so these run on plain node and the
// pull request job needs no app binary.

const assert = require('node:assert');
const { test } = require('node:test');
const {
  buildTree,
  fileKind,
  formatSize,
  makeEntry,
  mergeScan,
  mergeSettings,
  normalizeTag,
  parseQuery,
  ratingCounts,
  searchEntries,
  tagCounts,
} = require('../src/library');

function entry(filePath, extra = {}) {
  return { ...makeEntry(filePath), ...extra };
}

const LIBRARY = [
  entry('C:\\photos\\trip\\beach.jpg', { rating: 5, favorite: true, tags: ['beach', 'summer'] }),
  entry('C:\\photos\\trip\\sunset.png', { rating: 3, tags: ['beach'] }),
  entry('C:\\photos\\clips\\dive.mp4', { rating: 4, tags: ['summer'] }),
  entry('C:\\photos\\notes.jpg'),
];

test('fileKind knows photos from videos and ignores anything else', () => {
  assert.strictEqual(fileKind('a.JPG'), 'photo');
  assert.strictEqual(fileKind('a.mp4'), 'video');
  assert.strictEqual(fileKind('a.txt'), null);
  assert.strictEqual(fileKind('README'), null);
});

test('makeEntry splits a Windows path into name and folder', () => {
  const made = makeEntry('C:\\photos\\trip\\beach.jpg', { size: 10, mtime: 1 });
  assert.strictEqual(made.name, 'beach.jpg');
  assert.strictEqual(made.dir, 'C:\\photos\\trip');
  assert.strictEqual(made.kind, 'photo');
  assert.deepStrictEqual(made.tags, []);
});

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
  const query = parseQuery('holiday size:big');
  assert.strictEqual(query.text, 'holiday size:big');
});

test('rating:9 and type:audio are ignored rather than matching nothing', () => {
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

test('a file outside the root does not leak into its tree', () => {
  const [root] = buildTree([{ path: 'C:\\photos' }], [
    ...LIBRARY,
    entry('C:\\photos-backup\\other.jpg'),
  ]);
  assert.ok(!root.folders.some((folder) => folder.name.includes('backup')));
  assert.strictEqual(root.files.length, 1);
});

test('a rescan keeps the tags, rating and favorite the user set', () => {
  const scanned = [
    makeEntry('C:\\photos\\trip\\beach.jpg', { size: 999, mtime: 2 }),
    makeEntry('C:\\photos\\trip\\new.jpg'),
  ];
  const merged = mergeScan(LIBRARY, scanned);

  assert.deepStrictEqual(merged[0].tags, ['beach', 'summer']);
  assert.strictEqual(merged[0].rating, 5);
  assert.strictEqual(merged[0].favorite, true);
  // The file itself changed on disk, so the size does come from the scan.
  assert.strictEqual(merged[0].size, 999);
  assert.strictEqual(merged[1].rating, 0);
});

test('tag counts are ordered by use', () => {
  assert.deepStrictEqual(tagCounts(LIBRARY), [
    { tag: 'beach', count: 2 },
    { tag: 'summer', count: 2 },
  ]);
  assert.deepStrictEqual(ratingCounts(LIBRARY), [1, 0, 0, 1, 1, 1]);
});

test('stored settings keep only keys of the expected type', () => {
  const defaults = { theme: 'system', cardSize: 180 };
  assert.deepStrictEqual(mergeSettings(defaults, { theme: 'dark' }), {
    theme: 'dark',
    cardSize: 180,
  });
  // A hand-edited file with the wrong type must not break the window.
  assert.deepStrictEqual(mergeSettings(defaults, { cardSize: 'huge', junk: 1 }), defaults);
  assert.deepStrictEqual(mergeSettings(defaults, null), defaults);
});

test('formatSize picks the unit', () => {
  assert.strictEqual(formatSize(512), '512 B');
  assert.strictEqual(formatSize(1536), '1.5 KB');
  assert.strictEqual(formatSize(5 * 1024 * 1024), '5.0 MB');
});
