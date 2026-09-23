'use strict';

// Settings are a JSON file the user edits directly, opened from the tray menu.
// It is reread on every refresh, so an edit applies without a restart.

const fs = require('node:fs');

const DEFAULTS = {
  refreshMinutes: 5,
  claude: { enabled: true, limits: false },
  codex: { enabled: true },
  kiro: { enabled: true, command: 'kiro-cli' },
  anthropicAdmin: { apiKey: '' },
  openaiAdmin: { apiKey: '' },
};

function merge(defaults, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return defaults;
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    const fallback = defaults[key];
    result[key] = fallback && typeof fallback === 'object' ? merge(fallback, value[key]) : (value[key] ?? fallback);
  }
  return result;
}

// Writes the defaults on first run so there is a file to open. The file holds
// admin keys, so it is readable by the owner only.
function loadSettings(file) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, `${JSON.stringify(DEFAULTS, null, 2)}\n`, { mode: 0o600 });
    return merge(DEFAULTS, {});
  }
  try {
    return merge(DEFAULTS, JSON.parse(fs.readFileSync(file, 'utf-8')));
  } catch {
    return merge(DEFAULTS, {});
  }
}

module.exports = { DEFAULTS, loadSettings, merge };
