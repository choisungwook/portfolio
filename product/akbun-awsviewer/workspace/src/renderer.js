'use strict';

// Page state and rendering. The page owns the instance array; filtering and
// sorting run over it locally (lib.js) so typing in the filter never causes
// an AWS call. Data changes only on Refresh, profile switch, and login.

const api = globalThis.awsviewerApi;
// Accessed through the namespace only. Classic scripts share one global
// scope, so a top-level `const { filterInstances } = …` here collides with
// lib.js's function declarations and kills this whole file with a parse
// error before a single listener is wired. That was the v0.1.0/v0.1.1 bug.
const lib = globalThis.awsviewerLib;

const state = {
  snapshot: null,
  instances: [],
  loaded: false,
  filter: '',
  spotOnly: false,
  sort: { key: 'name', direction: 'asc' },
  selectedId: null,
  detail: null,
  detailTab: 'details',
};

const $ = (selector) => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function dash(value) {
  return value === null || value === undefined || value === '' ? '-' : String(value);
}

// ---------------------------------------------------------------- errors

function showError(message) {
  const dialog = $('#error-dialog');
  $('#error-message').textContent = message;
  if (!dialog.open) dialog.showModal();
  $('#confirm-error-dialog').focus();
}

function clearError() {
  const dialog = $('#error-dialog');
  if (dialog.open) dialog.close();
}

/// Command failures arrive as { kind, message } from the backend, or as a
/// plain string when something below that blew up.
function errorInfo(error) {
  if (error && typeof error === 'object' && error.kind) {
    return { kind: error.kind, message: error.message || String(error) };
  }
  return { kind: 'unknown', message: String(error) };
}

function handleError(error) {
  const info = errorInfo(error);
  reportError(`${info.kind}: ${info.message}`);
  if (info.kind === 'login_required') {
    setLoginHint(true);
    showError('The session for this profile is missing or expired. Use AWS login in the top right.');
  } else if (info.kind === 'cancelled') {
    clearError();
  } else {
    showError(info.message);
  }
  return info;
}

// ---------------------------------------------------------------- topbar

function renderTopbar() {
  const settings = state.snapshot?.settings || {};
  const session = state.snapshot?.session || null;
  $('#current-profile').textContent = settings.profile || 'none';
  const badge = $('#session-badge');
  badge.textContent = lib.sessionLabel(session);
  badge.classList.toggle('logged-in', Boolean(session?.loggedIn));
  badge.classList.toggle('logged-out', !session?.loggedIn);
}

// ---------------------------------------------------------------- instances

function setLoginHint(visible) {
  $('#instance-login-hint').classList.toggle('hidden', !visible);
}

function renderInstances() {
  const rows = lib.sortInstances(
    lib.filterInstances(state.instances, state.filter, state.spotOnly),
    state.sort.key,
    state.sort.direction,
  );

  for (const th of document.querySelectorAll('#instance-table th.sortable')) {
    if (th.dataset.sortKey === state.sort.key) {
      th.setAttribute('aria-sort', state.sort.direction === 'asc' ? 'ascending' : 'descending');
    } else {
      th.setAttribute('aria-sort', 'none');
    }
  }

  const body = $('#instance-table tbody');
  body.replaceChildren();
  const nowMs = Date.now();
  for (const instance of rows) {
    const tr = document.createElement('tr');
    tr.dataset.instanceId = instance.instanceId;
    if (instance.instanceId === state.selectedId) tr.classList.add('selected');
    tr.append(
      el('td', null, dash(instance.name)),
      el('td', null, instance.instanceId),
      el('td', lib.stateClass(instance.state) || null, dash(instance.state)),
      el('td', null, dash(instance.instanceType)),
      el('td', lib.capacityClass(instance.capacity) || null, dash(instance.capacity)),
      el('td', null, dash(instance.karpenterNodePool)),
      el('td', null, dash(instance.availabilityZone)),
      el('td', null, dash(instance.privateIp)),
      el('td', null, dash(instance.publicIp)),
      el('td', null, dash(lib.formatAge(instance.launchTime, nowMs))),
    );
    tr.addEventListener('click', () => openDetail(instance.instanceId));
    body.append(tr);
  }
  $('#instance-empty').classList.toggle('hidden', !(state.loaded && rows.length === 0));
}

async function loadInstances() {
  const button = $('#refresh-instances');
  button.disabled = true;
  try {
    state.instances = await api.listInstances();
    state.loaded = true;
    clearError();
    setLoginHint(false);
  } catch (error) {
    state.instances = [];
    state.loaded = false;
    handleError(error);
  } finally {
    button.disabled = false;
    renderInstances();
  }
}

// ---------------------------------------------------------------- detail

function kvSection(title, pairs) {
  const section = el('div', 'detail-section');
  if (title) section.append(el('h3', null, title));
  const list = el('dl', 'kv');
  for (const [key, value] of pairs) {
    list.append(el('dt', null, key), el('dd', null, dash(value)));
  }
  section.append(list);
  return section;
}

function ruleTable(rules) {
  const table = document.createElement('table');
  const head = document.createElement('thead');
  const headRow = document.createElement('tr');
  headRow.append(el('th', null, 'Protocol'), el('th', null, 'Ports'), el('th', null, 'Source'));
  head.append(headRow);
  const body = document.createElement('tbody');
  for (const rule of rules) {
    const tr = document.createElement('tr');
    tr.append(
      el('td', null, lib.formatProtocol(rule.protocol)),
      el('td', null, lib.formatPortRange(rule.fromPort, rule.toPort)),
      el('td', null, rule.sources.length ? rule.sources.join(', ') : '-'),
    );
    body.append(tr);
  }
  table.append(head, body);
  return table;
}

function renderDetailBody() {
  const container = $('#detail-body');
  container.replaceChildren();
  const detail = state.detail;
  if (!detail) return;

  if (state.detailTab === 'details') {
    container.append(
      kvSection(null, [
        ['Instance ID', detail.summary.instanceId],
        ['Name', detail.summary.name],
        ['State', detail.summary.state],
        ['Type', detail.summary.instanceType],
        ['Capacity', detail.summary.capacity],
        ['Karpenter NodePool', detail.summary.karpenterNodePool],
        ['Launch time', detail.summary.launchTime],
        ['AMI', detail.details.imageId],
        ['Architecture', detail.details.architecture],
        ['Platform', detail.details.platform],
        ['Key pair', detail.details.keyName],
        ['IAM profile', detail.details.iamInstanceProfile],
        ['Monitoring', detail.details.monitoring],
      ]),
    );
    if (detail.details.tags.length) {
      container.append(
        kvSection('Tags', detail.details.tags.map((tag) => [tag.key, tag.value])),
      );
    }
  } else if (state.detailTab === 'network') {
    container.append(
      kvSection(null, [
        ['VPC', detail.network.vpcId],
        ['Subnet', detail.network.subnetId],
        ['AZ', detail.network.availabilityZone],
        ['Private IP', detail.network.privateIp],
        ['Public IP', detail.network.publicIp],
        ['Private DNS', detail.network.privateDns],
        ['Public DNS', detail.network.publicDns],
      ]),
    );
    for (const eni of detail.network.interfaces) {
      container.append(
        kvSection(eni.eniId || 'interface', [
          ['Subnet', eni.subnetId],
          ['Private IP', eni.privateIp],
          ['Public IP', eni.publicIp],
          ['Status', eni.status],
          ['Description', eni.description],
        ]),
      );
    }
  } else if (state.detailTab === 'storage') {
    if (!detail.storage.length) {
      container.append(el('p', 'empty', 'No block devices.'));
    }
    for (const volume of detail.storage) {
      const title = `${volume.deviceName || 'device'}${volume.rootDevice ? ' (root)' : ''}`;
      container.append(
        kvSection(title, [
          ['Volume ID', volume.volumeId],
          ['Size', volume.sizeGib === null || volume.sizeGib === undefined ? null : `${volume.sizeGib} GiB`],
          ['Type', volume.volumeType],
          ['IOPS', volume.iops],
          ['Throughput', volume.throughput],
          ['Encrypted', volume.encrypted],
          ['Delete on termination', volume.deleteOnTermination],
        ]),
      );
    }
  } else if (state.detailTab === 'security') {
    if (!detail.security.length) {
      container.append(el('p', 'empty', 'No security groups.'));
    }
    for (const group of detail.security) {
      const section = el('div', 'detail-section');
      section.append(el('h3', null, `${group.groupName || ''} (${group.groupId || '-'})`));
      if (group.description) section.append(el('p', 'help', group.description));
      section.append(el('h3', null, 'Inbound'));
      section.append(
        group.ingress.length ? ruleTable(group.ingress) : el('p', 'empty', 'No inbound rules.'),
      );
      section.append(el('h3', null, 'Outbound'));
      section.append(
        group.egress.length ? ruleTable(group.egress) : el('p', 'empty', 'No outbound rules.'),
      );
      container.append(section);
    }
  }
}

async function openDetail(instanceId) {
  state.selectedId = instanceId;
  renderInstances();
  $('#detail-panel').classList.remove('hidden');
  $('#detail-title').textContent = instanceId;
  $('#detail-body').replaceChildren(el('p', 'empty', 'Loading…'));
  try {
    state.detail = await api.instanceDetail(instanceId);
    const name = state.detail.summary.name;
    $('#detail-title').textContent = name ? `${name} — ${instanceId}` : instanceId;
    clearError();
    renderDetailBody();
  } catch (error) {
    state.detail = null;
    $('#detail-body').replaceChildren();
    handleError(error);
  }
}

function closeDetail() {
  state.selectedId = null;
  state.detail = null;
  $('#detail-panel').classList.add('hidden');
  renderInstances();
}

// ---------------------------------------------------------------- profiles

// Read-only listing; signing in to a profile happens in the AWS login
// dialog, not here.
function renderProfiles() {
  const profiles = state.snapshot?.profiles || [];
  const current = state.snapshot?.settings?.profile || null;
  const body = $('#profile-table tbody');
  body.replaceChildren();
  for (const profile of profiles) {
    const tr = document.createElement('tr');
    const sso = profile.sso;
    const action = el('td');
    if (profile.name === current) {
      action.append(el('span', 'badge current', 'current'));
    }
    tr.append(
      el('td', null, profile.name),
      el('td', null, dash(profile.region)),
      el('td', null, sso ? sso.sessionName || sso.startUrl : 'not configured'),
      el('td', null, dash(sso?.accountId)),
      el('td', null, dash(sso?.roleName)),
      action,
    );
    body.append(tr);
  }
  $('#profile-empty').classList.toggle('hidden', profiles.length > 0);
}

function applySnapshot(snapshot) {
  state.snapshot = snapshot;
  renderTopbar();
  renderProfiles();
  $('#insecure-tls').checked = Boolean(snapshot.settings.insecureTls);
  $('#app-version').textContent = snapshot.version;
  $('#log-dir').textContent = snapshot.logDir || '';
}

async function useProfile(name) {
  try {
    applySnapshot(await api.selectProfile(name));
    state.instances = [];
    state.loaded = false;
    closeDetail();
    clearError();
    if (state.snapshot.session?.loggedIn) {
      setLoginHint(false);
      await loadInstances();
    } else {
      renderInstances();
      setLoginHint(true);
    }
  } catch (error) {
    handleError(error);
  }
}

// ---------------------------------------------------------------- login

// The dialog lists only profiles the SSO flow can use; the AWS Profile tab
// keeps showing everything.
function renderLoginDialog() {
  const profiles = (state.snapshot?.profiles || []).filter((profile) => profile.sso);
  const current = state.snapshot?.settings?.profile || null;
  const list = $('#login-profile-list');
  list.replaceChildren();
  for (const profile of profiles) {
    const item = document.createElement('li');
    const button = el('button', 'login-profile-row');
    button.type = 'button';
    const name = el('span', null, profile.name);
    if (profile.name === current) {
      name.append(' ', el('span', 'badge current', 'current'));
    }
    const meta = [profile.region, profile.sso.accountId, profile.sso.roleName]
      .filter(Boolean)
      .join(' · ');
    button.append(name, el('span', 'login-profile-meta', meta));
    button.addEventListener('click', () => loginWithProfile(profile.name));
    item.append(button);
    list.append(item);
  }
  $('#login-profile-empty').classList.toggle('hidden', profiles.length > 0);
}

async function openLoginDialog() {
  // Re-read ~/.aws/config on every open so a profile added while the app is
  // running shows up without a restart.
  try {
    applySnapshot(await api.getSnapshot());
  } catch (error) {
    handleError(error);
    return;
  }
  renderLoginDialog();
  $('#login-dialog').showModal();
}

function closeLoginDialog() {
  const dialog = $('#login-dialog');
  if (dialog.open) dialog.close();
}

async function loginWithProfile(name) {
  closeLoginDialog();
  await useProfile(name);
  // Selection failed (already reported) — do not sign in to the old profile.
  if (state.snapshot?.settings?.profile !== name) return;
  if (state.snapshot?.session?.loggedIn) return;
  await login();
}

// ------------------------------------------------------------ login relay

// The backend runs `aws sso login` and opens the page it prints in its own
// window. This modal is the page's half of that: it names the profile, carries
// the code the window may ask for, and owns cancel. It is opened by the
// verification event, never by a click.
function showRelayDialog(verification) {
  $('#relay-profile').textContent = verification.profile || '-';
  const code = verification.userCode || '';
  $('#relay-code').textContent = code;
  $('#relay-code-box').classList.toggle('hidden', !code);
  $('#relay-url').textContent = verification.url || '';
  const dialog = $('#relay-dialog');
  if (!dialog.open) dialog.showModal();
}

function closeRelayDialog() {
  const dialog = $('#relay-dialog');
  if (dialog.open) dialog.close();
}

// Cancel means closing the sign-in window: that window's absence is what the
// login task polls, so there is one way to cancel rather than two states to
// keep in step.
async function cancelLogin() {
  closeRelayDialog();
  try {
    await api.cancelLogin();
  } catch (error) {
    reportError(`cancel login: ${error?.message || error}`);
  }
}

async function login() {
  const button = $('#login-button');
  button.disabled = true;
  button.textContent = 'Waiting for sign-in…';
  try {
    await api.cliLogin();
    closeRelayDialog();
    applySnapshot(await api.getSnapshot());
    clearError();
    setLoginHint(false);
    await loadInstances();
  } catch (error) {
    closeRelayDialog();
    handleError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'AWS login';
    renderTopbar();
  }
}

// ---------------------------------------------------------------- wiring

function switchTab(name) {
  for (const tabButton of document.querySelectorAll('#sidebar .tab-button')) {
    tabButton.classList.toggle('active', tabButton.dataset.tab === name);
  }
  for (const tab of document.querySelectorAll('main .tab')) {
    tab.classList.toggle('active', tab.id === `tab-${name}`);
  }
}

function wire() {
  const errorDialog = $('#error-dialog');
  const closeErrorDialog = () => errorDialog.close();
  $('#close-error-dialog').addEventListener('click', closeErrorDialog);
  $('#confirm-error-dialog').addEventListener('click', closeErrorDialog);
  errorDialog.addEventListener('click', (event) => {
    if (event.target === errorDialog) closeErrorDialog();
  });

  for (const tabButton of document.querySelectorAll('#sidebar .tab-button')) {
    tabButton.addEventListener('click', () => switchTab(tabButton.dataset.tab));
  }

  const loginDialog = $('#login-dialog');
  $('#close-login-dialog').addEventListener('click', closeLoginDialog);
  loginDialog.addEventListener('click', (event) => {
    if (event.target === loginDialog) closeLoginDialog();
  });

  const relayDialog = $('#relay-dialog');
  $('#relay-cancel').addEventListener('click', () => void cancelLogin());
  $('#relay-reopen').addEventListener('click', () => {
    api.reopenLoginWindow().catch(handleError);
  });
  // Esc closes a dialog on its own. Without this the modal would vanish while
  // the CLI kept waiting, leaving no way to cancel or get the window back.
  relayDialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    void cancelLogin();
  });

  $('#login-button').addEventListener('click', openLoginDialog);
  $('#refresh-instances').addEventListener('click', loadInstances);
  $('#instance-filter').addEventListener('input', (event) => {
    state.filter = event.target.value;
    renderInstances();
  });
  $('#spot-only').addEventListener('change', (event) => {
    state.spotOnly = event.target.checked;
    renderInstances();
  });

  for (const th of document.querySelectorAll('#instance-table th.sortable')) {
    const activate = () => {
      const key = th.dataset.sortKey;
      if (state.sort.key === key) {
        state.sort.direction = state.sort.direction === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort = { key, direction: 'asc' };
      }
      renderInstances();
    };
    th.addEventListener('click', activate);
    th.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        activate();
      }
    });
  }

  for (const tabButton of document.querySelectorAll('.detail-tab-button')) {
    tabButton.addEventListener('click', () => {
      state.detailTab = tabButton.dataset.detailTab;
      for (const other of document.querySelectorAll('.detail-tab-button')) {
        other.classList.toggle('active', other === tabButton);
      }
      renderDetailBody();
    });
  }
  $('#close-detail').addEventListener('click', closeDetail);
  $('#refresh-detail').addEventListener('click', () => {
    if (state.selectedId) openDetail(state.selectedId);
  });

  $('#insecure-tls').addEventListener('change', async (event) => {
    try {
      applySnapshot(await api.setInsecureTls(event.target.checked));
    } catch (error) {
      // The toggle did not persist; put the checkbox back where the stored
      // settings are so the UI never claims a state the backend refused.
      event.target.checked = Boolean(state.snapshot?.settings?.insecureTls);
      handleError(error);
    }
  });

  // Two entry points, one flow: the topbar button mirrors the Settings one so
  // an update is reachable without knowing the Settings tab exists.
  for (const button of [$('#update-button'), $('#check-updates')]) {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await api.checkUpdate();
      } finally {
        button.disabled = false;
      }
    });
  }

  $('#open-log-dir').addEventListener('click', () => {
    api.openLogDir().catch(handleError);
  });
}

async function init() {
  wire();
  try {
    await api.onLoginVerification(showRelayDialog);
  } catch (error) {
    // Without the listener the sign-in window still opens and the flow still
    // works; only the modal is missing. Log it and carry on.
    reportError(`cannot listen for login verification: ${error?.message || error}`);
  }
  try {
    applySnapshot(await api.getSnapshot());
    if (state.snapshot.session?.loggedIn) {
      await loadInstances();
    } else if (state.snapshot.settings.profile) {
      setLoginHint(true);
    }
  } catch (error) {
    handleError(error);
  }
}

init();
