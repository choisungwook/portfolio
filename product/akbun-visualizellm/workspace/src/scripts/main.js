// The DOM side. Everything that needs arithmetic, parsing or layout is handed
// to src/lib, which is what the tests cover. The 3D view is imported only when
// it is first opened, so three.js stays out of the first paint.
import { parseConfig, deriveModel, summary, humanCount } from '../lib/model.js';
import { buildDiagram, annotations } from '../lib/diagram.js';
import { SAMPLES } from '../lib/samples.js';

const STORAGE_KEY = 'akbun-visualizellm.state';

const el = (id) => document.getElementById(id);
const sidePane = el('pane-side');
const backdrop = el('pane-backdrop');
const modelName = el('model-name');
const modelType = el('model-type');
const summaryList = el('summary');
const configView = el('config-view');
const diagramEl = el('diagram');
const laneEl = el('lane');
const blocksEl = el('blocks');
const arrowsEl = el('arrows');
const tip = el('tip');
const view2d = el('view-2d');
const view3d = el('view-3d');
const loader = el('loader');
const configInput = el('config-input');
const loadStatus = el('load-status');
const fileInput = el('file-input');
const samplesEl = el('samples');
const annotationsToggle = el('toggle-annotations');

const SVG_NS = 'http://www.w3.org/2000/svg';
// Matches the phone breakpoint in global.css. The two have to move together.
const phoneQuery = window.matchMedia('(max-width: 860px)');

const state = {
  model: null,
  diagram: null,
  fields: [],
  mode: '2d',
  showAnnotations: true,
  drawer: false,
};

let scene3d = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ===== Loading =====

function loadText(text, label) {
  try {
    const config = parseConfig(text);
    const model = deriveModel(config);
    state.model = model;
    state.diagram = buildDiagram(model);
    state.fields = annotations(model, state.diagram);
    save(text);
    renderAll();
    closeLoader();
    return true;
  } catch (error) {
    setStatus(error.message, true);
    if (label) console.warn(`${label}: ${error.message}`);
    return false;
  }
}

function setStatus(message, isError = false) {
  loadStatus.textContent = message;
  loadStatus.classList.toggle('is-error', isError);
}

function save(text) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      text,
      mode: state.mode,
      showAnnotations: state.showAnnotations,
    }));
  } catch {
    // A full or blocked storage is not a reason to lose the view.
  }
}

function restore() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    saved = null;
  }
  if (saved && typeof saved.showAnnotations === 'boolean') {
    state.showAnnotations = saved.showAnnotations;
    annotationsToggle.checked = saved.showAnnotations;
  }
  const text = saved?.text ?? JSON.stringify(SAMPLES[0].config, null, 2);
  configInput.value = text;
  if (!loadText(text) && text !== null) {
    loadText(JSON.stringify(SAMPLES[0].config, null, 2));
  }
  if (saved?.mode === '3d') setMode('3d');
}

// ===== Side pane =====

function renderSide() {
  const model = state.model;
  modelName.textContent = model.name;
  modelType.textContent = [model.modelType, `${humanCount(model.params.total)} params (estimated)`]
    .filter(Boolean).join(' · ');

  summaryList.innerHTML = summary(model).map((row) => `
    <dt>${esc(row.label)}</dt>
    <dd${row.field ? ` data-field="${esc(row.field)}"` : ''}>${esc(row.value)}</dd>
  `).join('');

  configView.innerHTML = configLines(model);
  for (const line of configView.querySelectorAll('.used')) {
    line.addEventListener('mouseenter', () => highlight(line.dataset.field));
    line.addEventListener('mouseleave', () => highlight(null));
  }
}

// The config is printed as it was loaded, with the fields the diagram reads
// marked. Hovering one lights up the blocks its value shaped.
function configLines(model) {
  const used = new Set(state.fields.map((row) => row.field));
  const json = JSON.stringify(model.config, null, 2);
  return json.split('\n').map((line) => {
    const match = line.match(/^\s*"([^"]+)":/);
    if (match && used.has(match[1])) {
      return `<span class="used" data-field="${esc(match[1])}">${esc(line)}</span>`;
    }
    return esc(line);
  }).join('\n');
}

// ===== 2D diagram =====

function render2D() {
  const parts = [];
  for (const section of state.diagram.sections) {
    if (section.kind === 'stack') {
      parts.push(`
        <div class="stack">
          <div class="stack-head" data-node="${esc(section.id)}">
            <h3>${esc(section.title)}</h3>
            <span>${esc(section.subtitle)}</span>
          </div>
          ${section.nodes.map(blockHtml).join('<div class="connector"></div>')}
        </div>
      `);
    } else {
      parts.push(`<div class="section-title">${esc(section.title)}</div>`);
      parts.push(section.nodes.map(blockHtml).join('<div class="connector"></div>'));
    }
  }
  blocksEl.innerHTML = parts.join('<div class="connector"></div>');
  wireBlockTips();
  layoutLane();
}

function blockHtml(node) {
  const fields = node.fields.filter(Boolean);
  return `
    <div class="block" data-node="${esc(node.id)}" style="--tone: var(--t-${esc(node.tone)})">
      <div class="block-title">${esc(node.title)}</div>
      <div class="block-shape">${esc(node.shape)}</div>
      <div class="block-fields${fields.length ? ' has-fields' : ''}">${fields.map((f) => `${esc(f)}`).join(' · ')}</div>
    </div>
  `;
}

function nodeById(id) {
  for (const section of state.diagram.sections) {
    if (section.id === id) return section;
    const found = section.nodes.find((node) => node.id === id);
    if (found) return found;
  }
  return null;
}

function wireBlockTips() {
  for (const element of blocksEl.querySelectorAll('[data-node]')) {
    const node = nodeById(element.dataset.node);
    if (!node) continue;
    element.addEventListener('mouseenter', (event) => {
      showTip(tipHtml(node), event);
      highlight(null, node.id);
    });
    element.addEventListener('mousemove', (event) => placeTip(event));
    element.addEventListener('mouseleave', () => {
      hideTip();
      highlight(null);
    });
  }
}

function tipHtml(node) {
  const fields = (node.fields ?? []).filter(Boolean);
  return `
    <h4>${esc(node.title ?? node.subtitle ?? '')}</h4>
    ${node.shape ? `<div class="tip-shape">${esc(node.shape)}</div>` : ''}
    <p>${esc(node.role)}</p>
    ${node.params ? `<div class="tip-fields">${humanCount(node.params)} parameters</div>` : ''}
    ${fields.length ? `<div class="tip-fields">from ${fields.map(esc).join(', ')}</div>` : ''}
  `;
}

// Chips sit in their own column beside the blocks, each one at the height of
// the first block it points at, pushed down when two would collide. Both
// columns scroll together, so the arrows are drawn once in content
// coordinates and never have to follow a scroll event.
function layoutLane() {
  laneEl.innerHTML = '';
  arrowsEl.innerHTML = '';
  const off = !state.showAnnotations || phoneQuery.matches;
  diagramEl.classList.toggle('no-lane', !state.showAnnotations);
  if (off) return;

  const base = diagramEl.getBoundingClientRect();
  const rows = state.fields
    .map((row) => ({ row, targets: row.nodes.map((id) => blocksEl.querySelector(`[data-node="${id}"]`)).filter(Boolean) }))
    .filter((entry) => entry.targets.length > 0)
    .map((entry) => ({ ...entry, y: centerY(entry.targets[0], base) }))
    .sort((a, b) => a.y - b.y);

  let lastBottom = -Infinity;
  for (const entry of rows) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.field = entry.row.field;
    chip.innerHTML = `<b>${esc(entry.row.field)}</b>: ${esc(formatValue(entry.row.value))}`;
    laneEl.appendChild(chip);
    const height = chip.getBoundingClientRect().height;
    const top = Math.max(entry.y - height / 2, lastBottom + 6);
    chip.style.top = `${top}px`;
    lastBottom = top + height;
    entry.chip = chip;
    chip.addEventListener('mouseenter', () => highlight(entry.row.field));
    chip.addEventListener('mouseleave', () => highlight(null));
  }

  for (const entry of rows) {
    const from = entry.chip.getBoundingClientRect();
    for (const target of entry.targets) {
      const to = target.getBoundingClientRect();
      arrowsEl.appendChild(arrowPath(
        from.right - base.left,
        from.top + from.height / 2 - base.top,
        to.left - base.left - 2,
        to.top + Math.min(to.height / 2, 22) - base.top,
        entry.row.field,
      ));
    }
  }
}

function formatValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

function centerY(element, base) {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2 - base.top;
}

function arrowPath(x1, y1, x2, y2, field) {
  const group = document.createElementNS(SVG_NS, 'g');
  group.dataset.field = field;
  const mid = x1 + (x2 - x1) * 0.55;
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'var(--accent)');
  path.setAttribute('stroke-width', '1.5');
  path.setAttribute('opacity', '0.75');
  const head = document.createElementNS(SVG_NS, 'path');
  head.setAttribute('d', `M ${x2} ${y2} l -6 -3.5 l 0 7 z`);
  head.setAttribute('fill', 'var(--accent)');
  group.append(path, head);
  return group;
}

// Hover anywhere in the chain (chip, config line, block) and the rest of the
// chain lights up, which is the whole point of the arrows.
function highlight(field, nodeId = null) {
  const fields = field ? [field] : (nodeId ? fieldsOf(nodeId) : []);
  const nodes = new Set(nodeId ? [nodeId] : []);
  for (const row of state.fields) {
    if (!fields.includes(row.field)) continue;
    for (const id of row.nodes) nodes.add(id);
  }
  for (const chip of laneEl.querySelectorAll('.chip')) {
    chip.classList.toggle('is-hot', fields.includes(chip.dataset.field));
  }
  for (const group of arrowsEl.querySelectorAll('g')) {
    group.setAttribute('opacity', fields.length === 0 || fields.includes(group.dataset.field) ? '1' : '0.15');
  }
  for (const line of configView.querySelectorAll('.used')) {
    line.classList.toggle('is-hot', fields.includes(line.dataset.field));
  }
  for (const block of blocksEl.querySelectorAll('[data-node]')) {
    block.classList.toggle('is-hot', field !== null && nodes.has(block.dataset.node));
  }
}

function fieldsOf(nodeId) {
  return state.fields.filter((row) => row.nodes.includes(nodeId)).map((row) => row.field);
}

// ===== Tooltip =====

function showTip(html, event) {
  tip.innerHTML = html;
  tip.hidden = false;
  placeTip(event);
}

function placeTip(event) {
  if (tip.hidden) return;
  const rect = tip.getBoundingClientRect();
  const x = Math.min(event.clientX + 16, window.innerWidth - rect.width - 10);
  const y = Math.min(event.clientY + 16, window.innerHeight - rect.height - 10);
  tip.style.left = `${Math.max(8, x)}px`;
  tip.style.top = `${Math.max(8, y)}px`;
}

function hideTip() {
  tip.hidden = true;
}

// ===== Modes =====

async function setMode(mode) {
  state.mode = mode;
  el('mode-2d').classList.toggle('is-active', mode === '2d');
  el('mode-3d').classList.toggle('is-active', mode === '3d');
  el('mode-2d').setAttribute('aria-pressed', String(mode === '2d'));
  el('mode-3d').setAttribute('aria-pressed', String(mode === '3d'));
  view2d.hidden = mode !== '2d';
  view3d.hidden = mode !== '3d';
  hideTip();
  if (mode === '3d') {
    if (!scene3d) {
      const module = await import('./view3d.js');
      scene3d = module.createSceneView({
        canvas: el('scene'),
        legend: el('legend'),
        // A scene block names itself `label`; the tooltip is shared with the
        // 2D view, which calls that `title`.
        onHover: (block, event) => (block ? showTip(tipHtml({ ...block, title: block.label }), event) : hideTip()),
      });
      el('view-start').addEventListener('click', () => scene3d.focusStart());
      el('view-all').addEventListener('click', () => scene3d.fitAll());
    }
    scene3d.show(state.model);
  } else if (scene3d) {
    scene3d.hide();
    layoutLane();
  }
  save(configInput.value);
}

function renderAll() {
  renderSide();
  render2D();
  if (state.mode === '3d' && scene3d) scene3d.show(state.model);
}

// ===== Loader dialog =====

function openLoader() {
  loader.classList.add('is-open');
  setStatus('');
  configInput.focus();
}

function closeLoader() {
  loader.classList.remove('is-open');
}

function renderSamples() {
  samplesEl.innerHTML = SAMPLES.map((sample) => `
    <button class="sample-button" type="button" data-sample="${esc(sample.id)}">
      <b>${esc(sample.label)}</b><span>${esc(sample.note)}</span>
    </button>
  `).join('');
  for (const button of samplesEl.querySelectorAll('[data-sample]')) {
    button.addEventListener('click', () => {
      const sample = SAMPLES.find((entry) => entry.id === button.dataset.sample);
      configInput.value = JSON.stringify(sample.config, null, 2);
      loadText(configInput.value, sample.id);
    });
  }
}

function setDrawer(open) {
  state.drawer = open;
  sidePane.classList.toggle('is-open', open);
  backdrop.hidden = !open;
  el('toggle-side').setAttribute('aria-expanded', String(open));
}

// ===== Wiring =====

el('open-loader').addEventListener('click', openLoader);
el('close-loader').addEventListener('click', closeLoader);
el('load-config').addEventListener('click', () => loadText(configInput.value));
el('pick-file').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  const text = await file.text();
  configInput.value = text;
  loadText(text, file.name);
  fileInput.value = '';
});
loader.addEventListener('click', (event) => {
  if (event.target === loader) closeLoader();
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeLoader();
    setDrawer(false);
  }
});

el('mode-2d').addEventListener('click', () => setMode('2d'));
el('mode-3d').addEventListener('click', () => setMode('3d'));
annotationsToggle.addEventListener('change', () => {
  state.showAnnotations = annotationsToggle.checked;
  save(configInput.value);
  layoutLane();
});
el('toggle-side').addEventListener('click', () => setDrawer(!state.drawer));
backdrop.addEventListener('click', () => setDrawer(false));

let resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (state.mode === '2d') layoutLane();
  }, 120);
});

// Web fonts land after the first paint and move every block a few pixels, which
// would leave the arrows pointing at where the blocks used to be.
if (document.fonts?.ready) document.fonts.ready.then(() => layoutLane());

renderSamples();
restore();
