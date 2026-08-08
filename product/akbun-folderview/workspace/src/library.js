'use strict';

// What the window does with the library once Rust has handed it over: search,
// the folder tree, and the tag and rating counts.
//
// Everything here is pure, so the tests run on plain node with no app binary.
// Scanning the disk and persisting the library live in Rust instead; this file
// never learns where an entry came from.
//
// The library only holds files the user added. Search never touches the disk,
// so it is a scan over an in-memory array rather than a query to the operating
// system, and that is what makes it feel instant.

// Windows paths use "\", the tests and a macOS dev run use "/".
// Splitting on both keeps this module free of a platform choice.
const SEPARATOR = /[\\/]/;

function baseName(filePath) {
  const parts = filePath.split(SEPARATOR);
  return parts[parts.length - 1];
}

function parentPath(filePath) {
  const cut = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  return cut < 0 ? '' : filePath.slice(0, cut);
}

// Tags are compared lowercase so "Trip" and "trip" are one tag. Spaces would
// break the "tag:value" search token, so they collapse into "-".
function normalizeTag(tag) {
  return String(tag).trim().toLowerCase().replace(/\s+/g, '-');
}

// Lowercased name, cached on the entry so a keystroke does not lowercase the
// whole library again. Not persisted; it is rebuilt when the library loads.
function searchKey(entry) {
  if (entry._key === undefined) entry._key = entry.name.toLowerCase();
  return entry._key;
}

// Understands "holiday tag:beach rating:>=4 type:photo fav". Anything that is
// not a known token is free text matched against the file name.
function parseQuery(text) {
  const query = { text: '', tags: [], rating: null, ratingOp: '>=', kind: null, favorite: false };
  const words = [];

  for (const token of String(text).trim().split(/\s+/)) {
    if (!token) continue;
    const lower = token.toLowerCase();

    if (lower.startsWith('tag:')) {
      const tag = normalizeTag(lower.slice(4));
      if (tag) query.tags.push(tag);
    } else if (lower.startsWith('rating:')) {
      const match = lower.slice(7).match(/^(>=|<=|=)?(\d)$/);
      if (match) {
        query.ratingOp = match[1] === '=' ? '=' : (match[1] ?? '>=');
        query.rating = Number(match[2]);
      }
    } else if (lower.startsWith('type:')) {
      const kind = lower.slice(5);
      if (kind === 'photo' || kind === 'video') query.kind = kind;
    } else if (lower === 'fav' || lower === 'favorite' || lower === 'is:favorite') {
      query.favorite = true;
    } else {
      words.push(lower);
    }
  }

  query.text = words.join(' ');
  return query;
}

function matchesRating(entry, query) {
  if (query.rating === null) return true;
  if (query.ratingOp === '=') return entry.rating === query.rating;
  if (query.ratingOp === '<=') return entry.rating <= query.rating;
  return entry.rating >= query.rating;
}

function matchesEntry(entry, query) {
  if (query.favorite && !entry.favorite) return false;
  if (query.kind && entry.kind !== query.kind) return false;
  if (!matchesRating(entry, query)) return false;
  if (query.tags.some((tag) => !entry.tags.includes(tag))) return false;
  if (query.text && !searchKey(entry).includes(query.text)) return false;
  return true;
}

// ponytail: a linear scan. It stays under a frame for the tens of thousands of
// files a hand-picked library holds. Build an inverted index on name trigrams
// if a library ever grows past a few hundred thousand.
function searchEntries(entries, text) {
  const query = parseQuery(text);
  return entries.filter((entry) => matchesEntry(entry, query));
}

// Every tag in the library with its count, most used first. Feeds both the
// catalog panel and the search box autocomplete.
function tagCounts(entries) {
  const counts = new Map();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

// How many files carry each star count, 1 through 5.
function ratingCounts(entries) {
  const counts = [0, 0, 0, 0, 0, 0];
  for (const entry of entries) counts[entry.rating] += 1;
  return counts;
}

function isUnder(filePath, rootPath) {
  return filePath.startsWith(rootPath) && SEPARATOR.test(filePath.slice(rootPath.length, rootPath.length + 1));
}

function makeNode(name, nodePath) {
  return { name, path: nodePath, folders: [], files: [] };
}

function childFolder(node, name, separator) {
  const found = node.folders.find((folder) => folder.name === name);
  if (found) return found;
  const created = makeNode(name, node.path + separator + name);
  node.folders.push(created);
  return created;
}

function sortNode(node) {
  node.folders.sort((a, b) => a.name.localeCompare(b.name));
  node.files.sort((a, b) => a.name.localeCompare(b.name));
  node.folders.forEach(sortNode);
}

// The tree is derived from the indexed files rather than read from disk, so
// what it shows and what search finds can never disagree.
function buildTree(roots, entries) {
  return roots.map((root) => {
    const separator = root.path.includes('\\') ? '\\' : '/';
    const node = makeNode(baseName(root.path) || root.path, root.path);

    for (const entry of entries) {
      if (!isUnder(entry.path, root.path)) continue;
      const segments = entry.path.slice(root.path.length + 1).split(SEPARATOR);
      let cursor = node;
      for (const folderName of segments.slice(0, -1)) {
        cursor = childFolder(cursor, folderName, separator);
      }
      cursor.files.push(entry);
    }

    sortNode(node);
    return node;
  });
}

function findTreeNode(nodes, path) {
  for (const node of nodes) {
    if (node.path === path) return node;
    const found = findTreeNode(node.folders, path);
    if (found) return found;
  }
  return null;
}

// The thumbnail file name for an entry. Path, mtime and size together, so an
// edited or replaced file gets a fresh thumbnail and the stale one is simply
// never asked for again. FNV-1a, 64 bits so a large library will not collide.
function thumbName(filePath, mtime, size) {
  const text = `${filePath}|${mtime}|${size}`;
  let hash = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return `${hash.toString(16).padStart(16, '0')}.jpg`;
}

function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${unit === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

const exported = {
  baseName,
  buildTree,
  findTreeNode,
  formatSize,
  isUnder,
  matchesEntry,
  normalizeTag,
  parentPath,
  parseQuery,
  ratingCounts,
  searchEntries,
  tagCounts,
  thumbName,
};

// Loaded two ways on purpose. The tests require it; the page takes it as a
// plain script tag, because search has to run on the page's own copy of the
// entries. Asking Rust on every keystroke would be the slow way to do the same
// thing, and it is the reason this logic is here rather than in the backend.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.folderviewLib = exported;
}
