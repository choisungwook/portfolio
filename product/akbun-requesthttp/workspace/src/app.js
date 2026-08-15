'use strict';

// UI glue only. All logic that can live without the DOM is in lib.js, and
// everything that leaves the page goes through window.api.

const L = window.requesthttpLib;
const $ = (id) => document.getElementById(id);

// The page owns the whole state; engines and storage are dumb.
let state = L.createState();
// The editor works on currentRequest. It is either a scratch request not in
// state.requests yet, or a direct reference to a saved one (edits then
// persist automatically).
let currentRequest = L.createRequest('');
let currentScenarioId = null;
let lastResponse = null;
let requestInFlight = false;
// scenarioId -> per-step results of the last run, display only.
const scenarioResults = {};

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
  } catch (error) {
    console.error('load failed', error);
  }
}

function engineSettings() {
  return {
    // The web engine cannot skip verification; keep the desktop toggle from
    // leaking into a persisted state the web build then displays as active.
    verifySsl: api.canToggleSsl ? state.settings.verifySsl : true,
    timeoutSecs: state.settings.timeoutSecs,
    followRedirects: state.settings.followRedirects,
  };
}

// ---------------------------------------------------------------- sidebar

function renderSidebar() {
  const requestList = $('request-list');
  requestList.textContent = '';
  for (const request of state.requests) {
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
      const index = state.requests.indexOf(request);
      state.requests.splice(index + 1, 0, copy);
      currentRequest = copy;
      persist();
      showRequestView();
      renderSidebar();
      renderEditor();
    });
    const remove = document.createElement('button');
    remove.textContent = 'Delete Request';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!(await api.ask(`Delete "${request.name}"?`))) return;
      state.requests = state.requests.filter((r) => r !== request);
      if (currentRequest === request) currentRequest = L.createRequest('');
      persist();
      renderSidebar();
      renderEditor();
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
    item.addEventListener('click', () => {
      currentRequest = request;
      showRequestView();
      renderSidebar();
      renderEditor();
    });
    requestList.append(item);
  }

  const scenarioList = $('scenario-list');
  scenarioList.textContent = '';
  for (const scenario of state.scenarios) {
    const item = document.createElement('li');
    if (scenario.id === currentScenarioId) item.className = 'active';
    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = scenario.name;
    const remove = document.createElement('button');
    remove.className = 'item-delete';
    remove.textContent = '✕';
    remove.title = 'Delete';
    remove.addEventListener('click', async (event) => {
      event.stopPropagation();
      if (!(await api.ask(`Delete "${scenario.name}"?`))) return;
      state.scenarios = state.scenarios.filter((s) => s !== scenario);
      if (currentScenarioId === scenario.id) {
        currentScenarioId = null;
        showRequestView();
      }
      persist();
      renderSidebar();
    });
    item.append(name, remove);
    item.addEventListener('click', () => {
      currentScenarioId = scenario.id;
      showScenarioView();
      renderSidebar();
      renderScenario();
    });
    scenarioList.append(item);
  }
}

function selectSidebarTab(tab) {
  $('tab-requests').classList.toggle('active', tab === 'requests');
  $('tab-scenarios').classList.toggle('active', tab === 'scenarios');
  $('requests-pane').hidden = tab !== 'requests';
  $('scenarios-pane').hidden = tab !== 'scenarios';
}

function showRequestView() {
  $('request-view').hidden = false;
  $('scenario-view').hidden = true;
}

function showScenarioView() {
  $('request-view').hidden = true;
  $('scenario-view').hidden = false;
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
  $('request-name').value = currentRequest.name;
  $('method').value = currentRequest.method;
  $('url').value = currentRequest.url;
  $('body').value = currentRequest.body;
  renderKvRows($('headers-rows'), currentRequest.headers, persist);
  renderKvRows($('local-variables-rows'), currentRequest.localVariables, persist);
}

function bindEditor() {
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
    if (!state.requests.includes(currentRequest)) state.requests.push(currentRequest);
    persist();
    selectSidebarTab('requests');
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
    // Imports always land in a fresh scratch request, never over a bookmark.
    currentRequest = Object.assign(L.createRequest(parsed.url), parsed);
    $('curl-dialog').close();
    showRequestView();
    renderSidebar();
    renderEditor();
  });
}

// --------------------------------------------------------------- scenarios

function findScenario(id) {
  return state.scenarios.find((s) => s.id === id);
}

function renderScenario() {
  const scenario = findScenario(currentScenarioId);
  if (!scenario) return;
  $('scenario-name').value = scenario.name;
  const stepsRoot = $('steps');
  stepsRoot.textContent = '';
  const results = scenarioResults[scenario.id] || [];
  scenario.steps.forEach((step, index) => {
    stepsRoot.append(renderStep(scenario, step, index, results[index]));
  });
}

function renderStep(scenario, step, index, result) {
  const item = document.createElement('li');
  item.className = 'step';

  const head = document.createElement('div');
  head.className = 'row';
  const select = document.createElement('select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '— saved request —';
  select.append(placeholder);
  for (const request of state.requests) {
    const option = document.createElement('option');
    option.value = request.id;
    option.textContent = `${request.method} ${request.name}`;
    select.append(option);
  }
  select.value = step.requestId || '';
  select.addEventListener('change', () => {
    step.requestId = select.value;
    persist();
  });
  const badge = document.createElement('span');
  badge.className = 'badge';
  if (result) {
    if (result.error) {
      badge.textContent = 'ERROR';
      badge.classList.add('fail');
    } else {
      badge.textContent = result.passed ? `PASS ${result.status}` : `FAIL ${result.status}`;
      badge.classList.add(result.passed ? 'pass' : 'fail');
    }
  }
  const spacer = document.createElement('span');
  spacer.className = 'spacer';
  const remove = document.createElement('button');
  remove.className = 'small';
  remove.textContent = '✕';
  remove.addEventListener('click', () => {
    scenario.steps.splice(index, 1);
    persist();
    renderScenario();
  });
  head.append(select, badge, spacer, remove);

  const asserts = document.createElement('div');
  asserts.className = 'row';
  const expectStatus = document.createElement('input');
  expectStatus.placeholder = 'expected status (e.g. 200)';
  expectStatus.value = step.expectStatus;
  expectStatus.addEventListener('input', () => {
    step.expectStatus = expectStatus.value.trim();
    persist();
  });
  const bodyContains = document.createElement('input');
  bodyContains.placeholder = 'body contains…';
  bodyContains.value = step.bodyContains;
  bodyContains.addEventListener('input', () => {
    step.bodyContains = bodyContains.value;
    persist();
  });
  asserts.append(expectStatus, bodyContains);

  const extracts = document.createElement('div');
  extracts.className = 'kv-rows';
  step.extracts.forEach((rule, ruleIndex) => {
    const row = document.createElement('div');
    row.className = 'kv-row';
    const path = document.createElement('input');
    path.placeholder = 'json path, e.g. data.token';
    path.value = rule.path || '';
    path.addEventListener('input', () => {
      rule.path = path.value.trim();
      persist();
    });
    const name = document.createElement('input');
    name.placeholder = 'to variable';
    name.value = rule.var || '';
    name.addEventListener('input', () => {
      rule.var = name.value.trim();
      persist();
    });
    const drop = document.createElement('button');
    drop.className = 'small';
    drop.textContent = '✕';
    drop.addEventListener('click', () => {
      step.extracts.splice(ruleIndex, 1);
      persist();
      renderScenario();
    });
    row.append(path, name, drop);
    extracts.append(row);
  });
  const addExtract = document.createElement('button');
  addExtract.className = 'small';
  addExtract.textContent = '+ Extract';
  addExtract.addEventListener('click', () => {
    step.extracts.push({ path: '', var: '' });
    persist();
    renderScenario();
  });

  item.append(head, asserts, extracts, addExtract);

  if (result) {
    if (result.error) {
      const error = document.createElement('p');
      error.className = 'failures';
      error.textContent = result.error;
      item.append(error);
    }
    if (result.failures && result.failures.length) {
      const failures = document.createElement('p');
      failures.className = 'failures';
      failures.textContent = result.failures.join(' · ');
      item.append(failures);
    }
    if (result.extracted && result.extracted.length) {
      const extracted = document.createElement('p');
      extracted.className = 'extracted';
      extracted.textContent =
        'extracted ' + result.extracted.map((e) => `${e.key}=${e.value}`).join(', ');
      item.append(extracted);
    }
  }
  return item;
}

async function runScenario() {
  const scenario = findScenario(currentScenarioId);
  if (!scenario || scenario.steps.length === 0) return;
  const results = [];
  scenarioResults[scenario.id] = results;
  renderScenario();
  for (const step of scenario.steps) {
    const request = state.requests.find((r) => r.id === step.requestId);
    if (!request) {
      results.push({ error: 'no request selected for this step' });
      renderScenario();
      continue;
    }
    // Resolved fresh per step, so extracts from earlier steps apply.
    const resolved = L.resolveRequest(request, state.globalVariables);
    try {
      const response = await api.send(resolved, engineSettings());
      const verdict = L.runAssertions(step, response);
      const extracted = L.applyExtracts(step, response, state.globalVariables);
      results.push({
        passed: verdict.passed,
        failures: verdict.failures,
        extracted,
        status: response.status,
      });
      if (extracted.length) persist();
    } catch (error) {
      results.push({ error: String(error) });
    }
    renderScenario();
  }
}

function bindScenario() {
  $('scenario-name').addEventListener('input', (event) => {
    const scenario = findScenario(currentScenarioId);
    if (!scenario) return;
    scenario.name = event.target.value;
    persist();
    renderSidebar();
  });
  $('btn-add-step').addEventListener('click', () => {
    const scenario = findScenario(currentScenarioId);
    if (!scenario) return;
    scenario.steps.push(L.createStep(''));
    persist();
    renderScenario();
  });
  $('btn-run-scenario').addEventListener('click', runScenario);
}

// ----------------------------------------------------------------- dialogs

function bindDialogs() {
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
  $('tab-requests').addEventListener('click', () => selectSidebarTab('requests'));
  $('tab-scenarios').addEventListener('click', () => selectSidebarTab('scenarios'));
  document.addEventListener('click', () => {
    document.querySelectorAll('.item-actions[open]').forEach((menu) => {
      menu.open = false;
    });
  });
  $('btn-new-request').addEventListener('click', () => {
    currentRequest = L.createRequest('');
    showRequestView();
    renderSidebar();
    renderEditor();
  });
  $('btn-new-scenario').addEventListener('click', () => {
    const scenario = L.createScenario('');
    state.scenarios.push(scenario);
    currentScenarioId = scenario.id;
    persist();
    showScenarioView();
    renderSidebar();
    renderScenario();
  });
  $('btn-update').addEventListener('click', () => api.checkUpdate());
  if (api.platform === 'web') $('btn-update').hidden = true;
  bindEditor();
  bindResponse();
  bindCurl();
  bindScenario();
  bindDialogs();
  renderSidebar();
  renderEditor();
})();
