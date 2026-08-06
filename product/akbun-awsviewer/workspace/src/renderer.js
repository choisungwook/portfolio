'use strict';

// Page state and rendering. The page owns the instance array; filtering and
// sorting run over it locally (lib.js) so typing in the filter never causes
// an AWS call. Data changes only on Refresh, profile switch, and login.

const api = globalThis.awsviewerApi;
const { filterInstances, sortInstances, formatProtocol, formatPortRange, sessionLabel } =
  globalThis.awsviewerLib;

const state = {
  snapshot: null,
  instances: [],
  loaded: false,
  filter: '',
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
  const banner = $('#error-banner');
  banner.textContent = message;
  banner.classList.remove('hidden');
}

function clearError() {
  $('#error-banner').classList.add('hidden');
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
  if (info.kind === 'login_required') {
    setLoginHint(true);
    showError('The session for this profile is missing or expired. Log in from the top right.');
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
  badge.textContent = sessionLabel(session);
  badge.classList.toggle('logged-in', Boolean(session?.loggedIn));
  badge.classList.toggle('logged-out', !session?.loggedIn);
}

// ---------------------------------------------------------------- instances

function setLoginHint(visible) {
  $('#instance-login-hint').classList.toggle('hidden', !visible);
}

function renderInstances() {
  const rows = sortInstances(
    filterInstances(state.instances, state.filter),
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
  for (const instance of rows) {
    const tr = document.createElement('tr');
    tr.dataset.instanceId = instance.instanceId;
    if (instance.instanceId === state.selectedId) tr.classList.add('selected');
    tr.append(
      el('td', null, dash(instance.name)),
      el('td', null, instance.instanceId),
      el('td', instance.state === 'running' ? 'state-running' : 'state-stopped', dash(instance.state)),
      el('td', null, dash(instance.instanceType)),
      el('td', null, dash(instance.availabilityZone)),
      el('td', null, dash(instance.privateIp)),
      el('td', null, dash(instance.publicIp)),
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
      el('td', null, formatProtocol(rule.protocol)),
      el('td', null, formatPortRange(rule.fromPort, rule.toPort)),
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
    } else {
      const button = el('button', 'select-profile', 'Use');
      button.addEventListener('click', () => useProfile(profile.name));
      action.append(button);
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

async function login() {
  const button = $('#login-button');
  if (!state.snapshot?.settings?.profile) {
    showError('Pick a profile in the AWS Profile tab first.');
    return;
  }
  button.disabled = true;
  button.textContent = 'Waiting for sign-in…';
  try {
    await api.ssoLogin();
    applySnapshot(await api.getSnapshot());
    clearError();
    setLoginHint(false);
    await loadInstances();
  } catch (error) {
    handleError(error);
  } finally {
    button.disabled = false;
    button.textContent = 'Log in';
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
  for (const tabButton of document.querySelectorAll('#sidebar .tab-button')) {
    tabButton.addEventListener('click', () => switchTab(tabButton.dataset.tab));
  }

  $('#login-button').addEventListener('click', login);
  $('#refresh-instances').addEventListener('click', loadInstances);
  $('#instance-filter').addEventListener('input', (event) => {
    state.filter = event.target.value;
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
      handleError(error);
    }
  });

  $('#check-updates').addEventListener('click', async () => {
    const status = $('#update-status');
    const button = $('#check-updates');
    button.disabled = true;
    try {
      await api.checkUpdate((text) => {
        status.textContent = text;
      });
    } catch (error) {
      status.textContent = `Update failed: ${errorInfo(error).message}`;
    } finally {
      button.disabled = false;
    }
  });
}

async function init() {
  wire();
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
