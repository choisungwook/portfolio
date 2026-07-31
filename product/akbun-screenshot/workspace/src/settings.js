'use strict';

const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mergeSettings } = require('./lib');

const DEFAULTS = {
  shortcut: 'CommandOrControl+Shift+4',
  saveDir: path.join(os.homedir(), 'Pictures', 'akbun-screenshot'),
  // Ships with macOS and covers Korean and English, so the editor renders both
  // without bundling a font.
  defaultFont: 'Apple SD Gothic Neo',
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function loadSettings() {
  let stored = null;
  try {
    stored = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    // first run or broken file: fall back to defaults
  }
  return mergeSettings(DEFAULTS, stored);
}

function saveSettings(settings) {
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

module.exports = { DEFAULTS, loadSettings, saveSettings };
