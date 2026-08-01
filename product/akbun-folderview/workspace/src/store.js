'use strict';

// Where the library and the settings live between runs.
//
// Both files sit under Electron's userData path, which on Windows is
// %APPDATA%\akbun-folderview. Not Program Files: that directory is read only
// for a normal user, so a write there fails or lands in a per user shadow copy
// the app cannot find again. See adr/2026-08-settings-in-appdata.md.

const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { DEFAULT_SETTINGS, mergeSettings } = require('./library');

const EMPTY_LIBRARY = { roots: [], entries: [] };

function filePath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJson(name) {
  try {
    return JSON.parse(fs.readFileSync(filePath(name), 'utf8'));
  } catch {
    // First run, or a file somebody broke by hand. Defaults either way.
    return null;
  }
}

// Write to a temp file and rename over the target. A crash halfway through a
// direct write would leave a truncated library.json, and every tag and rating
// in it would be gone.
function writeJson(name, value) {
  const target = filePath(name);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, target);
}

function loadLibrary() {
  const stored = readJson('library.json');
  if (!stored || !Array.isArray(stored.roots) || !Array.isArray(stored.entries)) {
    return { ...EMPTY_LIBRARY };
  }
  return stored;
}

function saveLibrary(library) {
  // The search key is a cache rebuilt on load. Persisting it would double the
  // file size for nothing.
  writeJson('library.json', {
    roots: library.roots,
    entries: library.entries.map(({ _key, ...entry }) => entry),
  });
}

function loadSettings() {
  return mergeSettings(DEFAULT_SETTINGS, readJson('settings.json'));
}

function saveSettings(settings) {
  writeJson('settings.json', settings);
}

function dataDir() {
  return app.getPath('userData');
}

module.exports = { dataDir, loadLibrary, loadSettings, saveLibrary, saveSettings };
