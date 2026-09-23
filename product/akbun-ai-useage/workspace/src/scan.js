'use strict';

// Walks local log directories and parses each file once per change. Claude Code
// and Codex logs grow to hundreds of MB, so a refresh every few minutes must
// not reread files whose mtime and size are unchanged.

const fs = require('node:fs/promises');
const path = require('node:path');

async function listFiles(dir, extension, sinceMs) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(full, extension, sinceMs)));
    } else if (entry.name.endsWith(extension)) {
      const stat = await fs.stat(full).catch(() => null);
      if (stat && stat.mtimeMs >= sinceMs) files.push({ path: full, mtimeMs: stat.mtimeMs, size: stat.size });
    }
  }
  return files;
}

// Returns parse(text) for each file, reusing the cached result when unchanged.
// Entries for files that fell out of the window are dropped.
async function parseFiles(files, parse, cache) {
  const seen = new Set();
  const results = [];
  for (const file of files) {
    seen.add(file.path);
    const cached = cache.get(file.path);
    if (cached && cached.mtimeMs === file.mtimeMs && cached.size === file.size) {
      results.push(cached.value);
      continue;
    }
    const text = await fs.readFile(file.path, 'utf-8').catch(() => '');
    const value = parse(text);
    cache.set(file.path, { mtimeMs: file.mtimeMs, size: file.size, value });
    results.push(value);
  }
  for (const key of cache.keys()) if (!seen.has(key)) cache.delete(key);
  return results;
}

function eachJsonLine(text, visit) {
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    visit(row);
  }
}

module.exports = { eachJsonLine, listFiles, parseFiles };
