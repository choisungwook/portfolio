'use strict';

// Pure logic shared by the desktop app and the web build: variable
// substitution, curl import/export, response value extraction and scenario
// assertions. No DOM, no Tauri, no fetch — node tests this file directly.

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// One state object owns everything the app persists.
function createState() {
  return {
    requests: [],
    variables: [],
    scenarios: [],
    settings: { verifySsl: true, timeoutSecs: 30, followRedirects: true },
  };
}

function createRequest(name) {
  return {
    id: newId(),
    name: name || 'Untitled',
    method: 'GET',
    url: '',
    headers: [],
    body: '',
  };
}

function createScenario(name) {
  return { id: newId(), name: name || 'Untitled scenario', steps: [] };
}

function createStep(requestId) {
  return { requestId, expectStatus: '', bodyContains: '', extracts: [] };
}

// ---------------------------------------------------------------- variables

function varsToMap(variables) {
  const map = {};
  for (const v of variables) {
    if (v.key) map[v.key] = v.value ?? '';
  }
  return map;
}

// {{name}} becomes the variable's value; unknown names stay as typed so the
// user sees what did not resolve.
function substitute(text, map) {
  if (!text) return text;
  return String(text).replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (whole, name) =>
    Object.prototype.hasOwnProperty.call(map, name) ? map[name] : whole
  );
}

// A request ready to hand to an engine: every field substituted, empty
// header rows dropped.
function resolveRequest(request, variables) {
  const map = varsToMap(variables);
  return {
    method: request.method,
    url: substitute(request.url, map),
    headers: request.headers
      .filter((h) => h.key)
      .map((h) => ({ key: substitute(h.key, map), value: substitute(h.value, map) })),
    body: substitute(request.body, map) || '',
  };
}

function upsertVariable(variables, key, value) {
  const found = variables.find((v) => v.key === key);
  if (found) found.value = value;
  else variables.push({ key, value });
}

// --------------------------------------------------------------------- curl

function shellQuote(text) {
  return "'" + String(text).replace(/'/g, "'\\''") + "'";
}

function toCurl(resolved, settings) {
  const parts = ['curl'];
  if (!settings.verifySsl) parts.push('-k');
  if (resolved.method !== 'GET') parts.push('-X', resolved.method);
  for (const h of resolved.headers) parts.push('-H', shellQuote(`${h.key}: ${h.value}`));
  if (resolved.body) parts.push('--data', shellQuote(resolved.body));
  parts.push(shellQuote(resolved.url));
  return parts.join(' ');
}

// Splits a shell command into words, honoring single quotes, double quotes
// and backslash-newline continuations. Enough for curl commands people paste.
function tokenize(command) {
  const text = String(command).replace(/\\\r?\n/g, ' ');
  const tokens = [];
  let current = '';
  let started = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'") {
      const end = text.indexOf("'", i + 1);
      const stop = end === -1 ? text.length : end;
      current += text.slice(i + 1, stop);
      started = true;
      i = stop + 1;
    } else if (ch === '"') {
      const end = text.indexOf('"', i + 1);
      const stop = end === -1 ? text.length : end;
      current += text.slice(i + 1, stop);
      started = true;
      i = stop + 1;
    } else if (/\s/.test(ch)) {
      if (started || current) tokens.push(current);
      current = '';
      started = false;
      i += 1;
    } else {
      current += ch;
      i += 1;
    }
  }
  if (started || current) tokens.push(current);
  return tokens;
}

// The subset of curl flags this app can represent. Unknown flags are
// skipped rather than failing the whole paste.
// ponytail: no -F/--form, no --data-urlencode, no @file bodies; add when a real paste needs them.
function parseCurl(command) {
  const tokens = tokenize(command);
  const request = { method: '', url: '', headers: [], body: '' };
  let i = tokens[0] === 'curl' ? 1 : 0;
  const takesValue = new Set([
    '-o', '--output', '-u', '--user', '-A', '--user-agent', '-b', '--cookie',
    '-e', '--referer', '--connect-timeout', '--max-time', '-m',
  ]);
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === '-X' || token === '--request') {
      request.method = (tokens[i + 1] || '').toUpperCase();
      i += 2;
    } else if (token === '-H' || token === '--header') {
      const raw = tokens[i + 1] || '';
      const colon = raw.indexOf(':');
      if (colon > 0) {
        request.headers.push({ key: raw.slice(0, colon).trim(), value: raw.slice(colon + 1).trim() });
      }
      i += 2;
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      request.body = tokens[i + 1] || '';
      i += 2;
    } else if (token === '--url') {
      request.url = tokens[i + 1] || '';
      i += 2;
    } else if (token === '-A' || takesValue.has(token)) {
      if (token === '-A' || token === '--user-agent') {
        request.headers.push({ key: 'User-Agent', value: tokens[i + 1] || '' });
      }
      i += 2;
    } else if (token.startsWith('-')) {
      i += 1;
    } else {
      if (!request.url) request.url = token;
      i += 1;
    }
  }
  if (!request.method) request.method = request.body ? 'POST' : 'GET';
  return request;
}

// ---------------------------------------------------- scenario run helpers

// "a.b.0.c" walks objects and arrays. Returns undefined when the path
// leaves the data.
function getByPath(value, path) {
  let current = value;
  for (const key of String(path).split('.')) {
    if (current == null) return undefined;
    current = current[key];
  }
  return current;
}

// A step passes when every filled-in assertion holds.
function runAssertions(step, response) {
  const failures = [];
  if (step.expectStatus !== '' && step.expectStatus != null) {
    const expected = Number(step.expectStatus);
    if (!Number.isFinite(expected)) {
      failures.push(`expected status "${step.expectStatus}" is not a number`);
    } else if (response.status !== expected) {
      failures.push(`status ${response.status}, expected ${expected}`);
    }
  }
  if (step.bodyContains) {
    if (!String(response.body).includes(step.bodyContains)) {
      failures.push(`body does not contain "${step.bodyContains}"`);
    }
  }
  return { passed: failures.length === 0, failures };
}

// Pulls values out of a JSON response body into variables, so later steps
// can use them as {{name}}. Returns what was extracted.
function applyExtracts(step, response, variables) {
  const extracted = [];
  if (!step.extracts || step.extracts.length === 0) return extracted;
  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch {
    return extracted;
  }
  for (const rule of step.extracts) {
    if (!rule.path || !rule.var) continue;
    const value = getByPath(parsed, rule.path);
    if (value === undefined) continue;
    const text = typeof value === 'string' ? value : JSON.stringify(value);
    upsertVariable(variables, rule.var, text);
    extracted.push({ key: rule.var, value: text });
  }
  return extracted;
}

// ------------------------------------------------------------- formatting

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function prettyBody(body, headers) {
  const contentType = (headers.find((h) => h.key.toLowerCase() === 'content-type') || {}).value || '';
  if (!contentType.toLowerCase().includes('json')) return body;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

const exported = {
  newId,
  createState,
  createRequest,
  createScenario,
  createStep,
  varsToMap,
  substitute,
  resolveRequest,
  upsertVariable,
  shellQuote,
  toCurl,
  tokenize,
  parseCurl,
  getByPath,
  runAssertions,
  applyExtracts,
  formatSize,
  prettyBody,
};

// A script tag makes top level names globals, so everything stays behind one
// name; node gets the same object through module.exports.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = exported;
} else {
  globalThis.requesthttpLib = exported;
}
