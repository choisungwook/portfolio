'use strict';

// UI glue only. All logic that can live without the DOM is in lib.js, and
// everything that leaves the page goes through window.api.

const L = window.requesthttpLib;
const $ = (id) => document.getElementById(id);

// The page owns the whole state; engines and storage are dumb.
let state = L.createState();
// The editor works on currentRequest. It is either a scratch request or a
// direct reference to a request nested in one folder.
let currentRequest = L.createRequest('');
let selectedFolderId = L.DEFAULT_FOLDER_ID;
let lastResponse = null;
let requestInFlight = false;

// ------------------------------------------------------------- persistence

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    api.saveState(JSON.stringify(state)).catch((error) => console.error('save failed', error));
  }, 300);
}

async function loadPersisted() {
  try {
    const raw = await api.loadState();
    if (!raw) return;
    state = L.normalizeState(JSON.parse(raw));
    selectedFolderId = L.DEFAULT_FOLDER_ID;
  } catch (error) {
    console.error('load failed', error);
  }
}

function engineSettings() {
  return L.createEngineSettings(state.settings, api.canToggleSsl);
}

// ---------------------------------------------------------------- sidebar

function findRequestFolder(request) {
  return state.folders.find((folder) => folder.requests.includes(request));
}

function findFolder(id) {
  return state.folders.find((folder) => folder.id === id) || state.folders[0];
}

function selectRequest(request, folder) {
  currentRequest = request;
  selectedFolderId = folder.id;
  lastResponse = null;
  renderSidebar();
  renderEditor();
  renderResponse();
}

function renderSidebar() {
  const root = $('folder-list');
  root.textContent = '';
  for (const folder of state.folders) {
    const group = document.createElement('section');
    group.className = 'folder-group';
    const heading = document.createElement('div');
    heading.className = 'folder-heading';
    const name = document.createElement('span');
    name.className = 'folder-name';
    name.textContent = folder.name;
    const count = document.createElement('span');
    count.className = 'folder-count';
    count.textContent = String(folder.requests.length);
    heading.append(name, count);
    if (!folder.isDefault) {
      const removeFolder = document.createElement('button');
      removeFolder.className = 'folder-delete';
      removeFolder.textContent = '✕';
      removeFolder.title = `Delete ${folder.name}`;
      removeFolder.addEventListener('click', async () => {
        if (!(await api.ask(`Delete folder "${folder.name}" and its requests?`))) return;
        if (folder.requests.includes(currentRequest)) {
          currentRequest = L.createRequest('');
          selectedFolderId = L.DEFAULT_FOLDER_ID;
          lastResponse = null;
        }
        state.folders = state.folders.filter((item) => item !== folder);
        persist();
        renderSidebar();
        renderEditor();
        renderResponse();
      });
      heading.append(removeFolder);
    }

    const requestList = document.createElement('ul');
    requestList.className = 'request-list';
    for (const request of folder.requests) {
      requestList.append(renderRequestItem(folder, request, requestList));
    }
    group.append(heading, requestList);
    root.append(group);
  }
}

function renderRequestItem(folder, request, requestList) {
  const item = document.createElement('li');
  if (request === currentRequest) item.className = 'active';
  const method = document.createElement('span');
  method.className = 'item-method';
  method.textContent = request.method;
  const name = document.createElement('span');
  name.className = 'item-name';
  name.textContent = request.name;
  const actions = document.createElement('details');
  actions.className = 'item-actions';
  const actionsToggle = document.createElement('summary');
  actionsToggle.textContent = '⋯';
  actionsToggle.title = 'Request actions';
  actionsToggle.setAttribute('aria-label', `Actions for ${request.name}`);
  const actionsMenu = document.createElement('div');
  actionsMenu.className = 'item-actions-menu';
  const duplicate = document.createElement('button');
  duplicate.textContent = 'Duplicate Request';
  duplicate.addEventListener('click', (event) => {
    event.stopPropagation();
    const copy = L.duplicateRequest(request);
    const index = folder.requests.indexOf(request);
    folder.requests.splice(index + 1, 0, copy);
    selectRequest(copy, folder);
    persist();
  });
  const remove = document.createElement('button');
  remove.textContent = 'Delete Request';
  remove.addEventListener('click', async (event) => {
    event.stopPropagation();
    if (!(await api.ask(`Delete "${request.name}"?`))) return;
    folder.requests = folder.requests.filter((item) => item !== request);
    if (currentRequest === request) {
      currentRequest = L.createRequest('');
      selectedFolderId = L.DEFAULT_FOLDER_ID;
      lastResponse = null;
    }
    persist();
    renderSidebar();
    renderEditor();
    renderResponse();
  });
  actionsMenu.append(duplicate, remove);
  actions.append(actionsToggle, actionsMenu);
  actions.addEventListener('click', (event) => event.stopPropagation());
  actions.addEventListener('toggle', () => {
    if (!actions.open) return;
    requestList.querySelectorAll('.item-actions[open]').forEach((menu) => {
      if (menu !== actions) menu.open = false;
    });
  });
  item.append(method, name, actions);
  item.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    actions.open = true;
  });
  item.addEventListener('click', () => selectRequest(request, folder));
  return item;
}

// ------------------------------------------------------------------ editor

// Generic editable key/value rows, used by headers and variables. Only a
// removal re-renders, so typing keeps its focus.
function renderKvRows(container, list, onChange) {
  container.textContent = '';
  list.forEach((entry, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row';
    const key = document.createElement('input');
    key.placeholder = 'key';
    key.value = entry.key || '';
    key.addEventListener('input', () => {
      entry.key = key.value;
      onChange();
    });
    const value = document.createElement('input');
    value.placeholder = 'value';
    value.value = entry.value || '';
    value.addEventListener('input', () => {
      entry.value = value.value;
      onChange();
    });
    const remove = document.createElement('button');
    remove.className = 'small';
    remove.textContent = '✕';
    remove.addEventListener('click', () => {
      list.splice(index, 1);
      renderKvRows(container, list, onChange);
      onChange();
    });
    row.append(key, value, remove);
    container.append(row);
  });
}

function renderEditor() {
  const savedFolder = findRequestFolder(currentRequest);
  const folderSelect = $('request-folder');
  folderSelect.textContent = '';
  for (const folder of state.folders) {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folder.name;
    folderSelect.append(option);
  }
  folderSelect.value = savedFolder ? savedFolder.id : selectedFolderId;
  $('request-name').value = currentRequest.name;
  $('method').value = currentRequest.method;
  $('url').value = currentRequest.url;
  $('body').value = currentRequest.body;
  renderKvRows($('headers-rows'), currentRequest.headers, persist);
  renderKvRows($('local-variables-rows'), currentRequest.localVariables, persist);
}

function bindEditor() {
  $('request-folder').addEventListener('change', (event) => {
    const targetFolder = findFolder(event.target.value);
    const savedFolder = findRequestFolder(currentRequest);
    selectedFolderId = targetFolder.id;
    if (savedFolder && savedFolder !== targetFolder) {
      savedFolder.requests = savedFolder.requests.filter((request) => request !== currentRequest);
      targetFolder.requests.push(currentRequest);
      persist();
      renderSidebar();
    }
  });
  $('request-name').addEventListener('input', (event) => {
    currentRequest.name = event.target.value;
    persist();
    renderSidebar();
  });
  $('method').addEventListener('change', (event) => {
    currentRequest.method = event.target.value;
    persist();
    renderSidebar();
  });
  $('url').addEventListener('input', (event) => {
    currentRequest.url = event.target.value;
    persist();
  });
  $('body').addEventListener('input', (event) => {
    currentRequest.body = event.target.value;
    persist();
  });
  $('btn-add-header').addEventListener('click', () => {
    currentRequest.headers.push({ key: '', value: '' });
    renderKvRows($('headers-rows'), currentRequest.headers, persist);
  });
  $('btn-add-local-variable').addEventListener('click', () => {
    currentRequest.localVariables.push({ key: '', value: '' });
    renderKvRows($('local-variables-rows'), currentRequest.localVariables, persist);
  });
  $('btn-save-request').addEventListener('click', () => {
    if (!currentRequest.name) currentRequest.name = currentRequest.url || 'Untitled';
    if (!findRequestFolder(currentRequest)) findFolder(selectedFolderId).requests.push(currentRequest);
    persist();
    renderSidebar();
    renderEditor();
  });
  $('btn-send').addEventListener('click', sendRequest);
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') sendRequest();
  });
}

// -------------------------------------------------------------- send flow

function setRequestLoading(loading) {
  const button = $('btn-send');
  button.disabled = loading;
  button.textContent = loading ? 'Sending…' : 'Send';
  button.setAttribute('aria-busy', String(loading));
  $('request-progress').hidden = !loading;
}

async function sendRequest() {
  if (requestInFlight) return;
  const resolved = L.resolveRequest(currentRequest, state.globalVariables);
  if (!resolved.url) {
    await api.message('URL is empty.');
    return;
  }
  requestInFlight = true;
  setRequestLoading(true);
  try {
    lastResponse = await api.send(resolved, engineSettings());
  } catch (error) {
    lastResponse = { status: 0, statusText: '', headers: [], body: String(error), elapsedMs: 0, sizeBytes: 0 };
  } finally {
    requestInFlight = false;
    setRequestLoading(false);
  }
  renderResponse();
}

function renderResponse() {
  const section = $('response');
  if (!lastResponse) {
    section.hidden = true;
    return;
  }
  section.hidden = false;
  const status = $('resp-status');
  if (lastResponse.status === 0) {
    status.textContent = 'Error';
    status.className = 'bad';
    $('resp-meta').textContent = '';
  } else {
    status.textContent = `${lastResponse.status} ${lastResponse.statusText}`.trim();
    status.className = lastResponse.status < 400 ? 'ok' : 'bad';
    $('resp-meta').textContent =
      `${lastResponse.elapsedMs} ms · ${L.formatSize(lastResponse.sizeBytes)}`;
  }
  const pretty = $('resp-pretty').checked;
  $('resp-body').textContent = pretty
    ? L.prettyBody(lastResponse.body, lastResponse.headers)
    : lastResponse.body;
  $('resp-headers').textContent = lastResponse.headers
    .map((h) => `${h.key}: ${h.value}`)
    .join('\n');
}

function bindResponse() {
  $('resp-pretty').addEventListener('change', renderResponse);
  $('resp-tab-body').addEventListener('click', () => {
    $('resp-tab-body').classList.add('active');
    $('resp-tab-headers').classList.remove('active');
    $('resp-body').hidden = false;
    $('resp-headers').hidden = true;
  });
  $('resp-tab-headers').addEventListener('click', () => {
    $('resp-tab-headers').classList.add('active');
    $('resp-tab-body').classList.remove('active');
    $('resp-body').hidden = true;
    $('resp-headers').hidden = false;
  });
}

// -------------------------------------------------------------------- curl

function bindCurl() {
  $('btn-copy-curl').addEventListener('click', async () => {
    const command = L.toCurl(
      L.resolveRequest(currentRequest, state.globalVariables),
      engineSettings()
    );
    try {
      await navigator.clipboard.writeText(command);
      await api.message('curl command copied.');
    } catch {
      // Clipboard access can be denied; the dialog still lets the user copy.
      $('curl-input').value = command;
      $('curl-dialog').showModal();
      $('curl-input').select();
    }
  });
  $('btn-import-curl').addEventListener('click', () => {
    $('curl-input').value = '';
    $('curl-dialog').showModal();
  });
  $('btn-close-curl').addEventListener('click', () => $('curl-dialog').close());
  $('btn-do-import-curl').addEventListener('click', () => {
    const parsed = L.parseCurl($('curl-input').value);
    if (!parsed.url) return;
    currentRequest = Object.assign(L.createRequest(parsed.url), parsed);
    selectedFolderId = L.DEFAULT_FOLDER_ID;
    $('curl-dialog').close();
    renderSidebar();
    renderEditor();
  });
}

// -------------------------------------------------------------------- .http

function bindHttpImport() {
  $('btn-import-http').addEventListener('click', () => $('http-file-input').click());
  $('http-file-input').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const requests = L.parseHttpFile(await file.text());
      if (requests.length === 0) {
        await api.message('No HTTP requests found in this file.');
        return;
      }
      const folder = L.createFolder(L.httpFolderName(file.name));
      folder.requests.push(...requests);
      state.folders.push(folder);
      selectRequest(requests[0], folder);
      persist();
    } catch (error) {
      await api.message(`Cannot import the HTTP file.\n\n${error}`);
    }
  });
}

// ----------------------------------------------------------------- dialogs

function bindDialogs() {
  $('btn-new-folder').addEventListener('click', () => {
    $('folder-name').value = '';
    $('folder-dialog').showModal();
    $('folder-name').focus();
  });
  $('btn-close-folder').addEventListener('click', () => $('folder-dialog').close());
  $('btn-create-folder').addEventListener('click', () => {
    const name = $('folder-name').value.trim();
    if (!name) return;
    const folder = L.createFolder(name);
    state.folders.push(folder);
    selectedFolderId = folder.id;
    persist();
    $('folder-dialog').close();
    renderSidebar();
    renderEditor();
  });
  $('btn-global-variables').addEventListener('click', () => {
    renderKvRows($('global-variables-rows'), state.globalVariables, persist);
    $('global-variables-dialog').showModal();
  });
  $('btn-add-global-variable').addEventListener('click', () => {
    state.globalVariables.push({ key: '', value: '' });
    renderKvRows($('global-variables-rows'), state.globalVariables, persist);
  });
  $('btn-close-global-variables').addEventListener('click', () => {
    $('global-variables-dialog').close();
  });

  $('btn-settings').addEventListener('click', () => {
    $('setting-verify-ssl').checked = state.settings.verifySsl;
    $('setting-verify-ssl').disabled = !api.canToggleSsl;
    $('setting-verify-ssl-web-note').hidden = api.canToggleSsl;
    $('setting-timeout').value = state.settings.timeoutSecs;
    $('setting-follow-redirects').checked = state.settings.followRedirects;
    $('settings-dialog').showModal();
  });
  $('setting-verify-ssl').addEventListener('change', (event) => {
    state.settings.verifySsl = event.target.checked;
    persist();
  });
  $('setting-timeout').addEventListener('change', (event) => {
    const seconds = Number(event.target.value);
    if (Number.isFinite(seconds) && seconds >= 1) state.settings.timeoutSecs = Math.floor(seconds);
    persist();
  });
  $('setting-follow-redirects').addEventListener('change', (event) => {
    state.settings.followRedirects = event.target.checked;
    persist();
  });
  $('btn-close-settings').addEventListener('click', () => $('settings-dialog').close());
}

// -------------------------------------------------------------------- init

(async function init() {
  await loadPersisted();
  document.addEventListener('click', () => {
    document.querySelectorAll('.item-actions[open]').forEach((menu) => {
      menu.open = false;
    });
  });
  $('btn-new-request').addEventListener('click', () => {
    currentRequest = L.createRequest('');
    selectedFolderId = L.DEFAULT_FOLDER_ID;
    lastResponse = null;
    renderSidebar();
    renderEditor();
    renderResponse();
  });
  $('btn-update').addEventListener('click', () => api.checkUpdate());
  if (api.platform === 'web') $('btn-update').hidden = true;
  bindEditor();
  bindResponse();
  bindCurl();
  bindHttpImport();
  bindDialogs();
  renderSidebar();
  renderEditor();
})();
