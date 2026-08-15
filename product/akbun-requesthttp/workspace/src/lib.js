'use strict';

// Pure logic shared by the desktop app and the web build: state migration,
// variable substitution, and curl/.http import. No DOM, no Tauri, no fetch —
// node tests this file directly.

const DEFAULT_FOLDER_ID = 'default';

function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// One state object owns everything the app persists.
function createState() {
  return {
    folders: [createFolder('Default', true)],
    globalVariables: [],
    settings: { verifySsl: true, timeoutSecs: 30, followRedirects: true },
  };
}

function createFolder(name, isDefault = false) {
  return {
    id: isDefault ? DEFAULT_FOLDER_ID : newId(),
    name: name || 'Untitled folder',
    isDefault,
    requests: [],
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
    localVariables: [],
  };
}

function normalizeState(loaded) {
  const source = loaded || {};
  const state = createState();
  const folders = Array.isArray(source.folders)
    ? source.folders.map((folder) => Object.assign(createFolder(folder.name), folder, {
      isDefault: folder.id === DEFAULT_FOLDER_ID || folder.isDefault === true,
      requests: Array.isArray(folder.requests) ? folder.requests.map(normalizeRequest) : [],
    }))
    : [];
  const loadedDefault = folders.find((folder) => folder.isDefault);
  const defaultFolder = loadedDefault || state.folders[0];
  defaultFolder.id = DEFAULT_FOLDER_ID;
  defaultFolder.name = 'Default';
  defaultFolder.isDefault = true;
  const oldRequests = Array.isArray(source.requests) ? source.requests.map(normalizeRequest) : [];
  defaultFolder.requests.push(...oldRequests);
  const namedFolders = folders.filter((folder) => folder !== loadedDefault);
  for (const folder of namedFolders) {
    if (folder.id === DEFAULT_FOLDER_ID) folder.id = newId();
    folder.isDefault = false;
  }
  state.folders = [defaultFolder, ...namedFolders];
  state.globalVariables = Array.isArray(source.globalVariables)
    ? source.globalVariables
    : Array.isArray(source.variables) ? source.variables : [];
  state.settings = Object.assign(state.settings, source.settings || {});
  return state;
}

function normalizeRequest(request) {
  return Object.assign(createRequest(''), request, {
    headers: Array.isArray(request.headers) ? request.headers : [],
    localVariables: Array.isArray(request.localVariables) ? request.localVariables : [],
  });
}

function duplicateRequest(request) {
  return Object.assign({}, request, {
    id: newId(),
    name: `${request.name} copy`,
    headers: request.headers.map((header) => Object.assign({}, header)),
    localVariables: (request.localVariables || []).map((variable) => Object.assign({}, variable)),
  });
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
function resolveRequest(request, globalVariables) {
  const map = Object.assign(
    varsToMap(globalVariables),
    varsToMap(request.localVariables || [])
  );
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

// -------------------------------------------------------------------- .http

function httpFolderName(fileName) {
  const base = String(fileName || '').split(/[\\/]/).pop() || '';
  return base || 'Imported';
}

function parseHttpFile(content) {
  const text = String(content || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const variables = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\s*@([\w.-]+)\s*=\s*(.*?)\s*$/);
    if (match) upsertVariable(variables, match[1], match[2]);
  }

  const sections = [];
  let label = '';
  let lines = [];
  for (const line of text.split('\n')) {
    const separator = line.match(/^\s*###(?:\s+(.*?))?\s*$/);
    if (separator) {
      sections.push({ label, lines });
      label = separator[1] || '';
      lines = [];
    } else {
      lines.push(line);
    }
  }
  sections.push({ label, lines });

  return sections
    .map((section) => parseHttpSection(section, variables))
    .filter(Boolean);
}

function parseHttpSection(section, variables) {
  const methodPattern = /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|TRACE|CONNECT)\s+(\S+?)(?:\s+HTTP\/\d(?:\.\d+)?)?\s*$/i;
  let name = '';
  let requestLineIndex = -1;
  let method = '';
  let url = '';

  section.lines.forEach((line, index) => {
    if (requestLineIndex !== -1) return;
    const nameMatch = line.match(/^\s*(?:#|\/{2})\s*@name\s+(.+?)\s*$/i);
    if (nameMatch) name = nameMatch[1];
    const requestMatch = line.trim().match(methodPattern);
    if (requestMatch) {
      requestLineIndex = index;
      method = requestMatch[1].toUpperCase();
      url = requestMatch[2];
    }
  });
  if (requestLineIndex === -1) return null;

  const headers = [];
  let cursor = requestLineIndex + 1;
  while (cursor < section.lines.length && section.lines[cursor].trim() !== '') {
    const header = section.lines[cursor].match(/^\s*([^:#][^:]*):\s*(.*)$/);
    if (header) headers.push({ key: header[1].trim(), value: header[2].trim() });
    cursor += 1;
  }
  while (cursor < section.lines.length && section.lines[cursor].trim() === '') cursor += 1;
  const body = section.lines.slice(cursor).join('\n').trimEnd();
  const request = createRequest(name || section.label || `${method} ${url}`);
  request.method = method;
  request.url = url;
  request.headers = headers;
  request.body = body;
  request.localVariables = variables.map((variable) => Object.assign({}, variable));
  return request;
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
  DEFAULT_FOLDER_ID,
  newId,
  createState,
  createFolder,
  createRequest,
  normalizeState,
  duplicateRequest,
  varsToMap,
  substitute,
  resolveRequest,
  upsertVariable,
  shellQuote,
  toCurl,
  tokenize,
  parseCurl,
  httpFolderName,
  parseHttpFile,
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
