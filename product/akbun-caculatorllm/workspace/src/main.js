import './styles.css';
import {
  calculateModelLoad,
  calculateVram,
  DEFAULT_INPUT,
  DEFAULT_MODEL,
  detectModelFormat,
  MODEL_FORMATS,
  modelFromConfig,
} from './lib/calculator.js';

const byId = (id) => document.getElementById(id);
const form = byId('calculator-form');
const errorBanner = byId('error-banner');
const loadStatus = byId('load-status');
let model = { ...DEFAULT_MODEL };
let manualParameterOverride = false;

const number = (value, digits = 2) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value);

const compactInteger = (value) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
}).format(value);

function selectedModelBytes() {
  const format = byId('model-format').value;
  if (format === 'custom') return Number(byId('custom-model-bits').value) / 8;
  return MODEL_FORMATS[format].bytes;
}

function selectedFormatLabel() {
  const option = byId('model-format').selectedOptions[0];
  return option.textContent.split(' · ')[0];
}

function readInput() {
  const selectedGpu = byId('gpu-gib').value;
  return {
    gpuGib: Number(selectedGpu === 'custom' ? byId('custom-gpu-gib').value : selectedGpu),
    contextTokens: Number(byId('context-tokens').value),
    concurrentRequests: Number(byId('concurrent-requests').value),
    modelBytes: selectedModelBytes(),
    kvBytes: Number(byId('kv-bytes').value),
    alphaPercent: Number(byId('alpha-percent').value),
  };
}

function renderError(message) {
  errorBanner.textContent = message;
  errorBanner.hidden = false;
}

function clearError() {
  errorBanner.textContent = '';
  errorBanner.hidden = true;
}

function setText(id, value) {
  byId(id).textContent = value;
}

function toggleCustomFields() {
  byId('custom-gpu-field').hidden = byId('gpu-gib').value !== 'custom';
  byId('custom-model-bits-field').hidden = byId('model-format').value !== 'custom';
}

function setModel(nextModel, config = null) {
  model = nextModel;
  manualParameterOverride = false;
  if (Number.isFinite(model.parameterCount)) {
    byId('parameter-billions').value = number(model.parameterCount / 1e9, 3);
  } else {
    byId('parameter-billions').value = '';
    byId('model-advanced-settings').open = true;
  }
  if (config) byId('model-format').value = detectModelFormat(config);
  toggleCustomFields();
  setText('parameter-source', `${model.parameterSource}.`);
  setText(
    'model-shape',
    `${model.layers} layers · ${model.kvHeads} KV heads · ${number(model.headDim, 0)} head dimension · ${model.modelType}`,
  );
  update();
}

function setLayer(labelId, liquidId, gib, capacityGib, scale, lowerDisplayPercent) {
  const rawPercent = (gib / capacityGib) * 100;
  const displayPercent = rawPercent * scale;
  byId(liquidId).style.flexBasis = `${displayPercent}%`;

  const label = byId(labelId);
  label.style.bottom = `${13 + ((lowerDisplayPercent + (displayPercent / 2)) * 0.7)}%`;
  label.hidden = displayPercent < 10;
  return lowerDisplayPercent + displayPercent;
}

function setJarState(prefix, result) {
  const stage = byId(`${prefix}-jar-stage`);
  stage.classList.toggle('oom', !result.fits);
  stage.classList.toggle('fits', result.fits);
  byId(`${prefix}-overflow-label`).hidden = result.fits;
  stage.querySelector('.jar-image').alt = `Glass jar showing ${number(result.utilization * 100, 0)}% of GPU VRAM used`;
}

function renderLoadJar(input, result) {
  const rawTotalPercent = result.utilization * 100;
  const displayTotalPercent = Math.min(rawTotalPercent, 128);
  const scale = rawTotalPercent > 0 ? displayTotalPercent / rawTotalPercent : 1;

  setLayer(
    'load-model-layer-label',
    'load-model-liquid',
    result.modelGib,
    input.gpuGib,
    scale,
    0,
  );
  setText('load-jar-model', `${number(result.modelGib, 1)} GiB`);
  setText('load-legend-model', `${number(result.modelGib, 1)} GiB`);
  setText('load-capacity-label', `${number(input.gpuGib, input.gpuGib % 1 ? 1 : 0)} GiB`);
  setJarState('load', result);
}

function renderWorkloadJar(input, result) {
  const rawTotalPercent = result.utilization * 100;
  const displayTotalPercent = Math.min(rawTotalPercent, 128);
  const scale = rawTotalPercent > 0 ? displayTotalPercent / rawTotalPercent : 1;
  let lowerDisplayPercent = 0;

  lowerDisplayPercent = setLayer(
    'workload-extra-layer-label',
    'workload-extra-liquid',
    result.alphaGib,
    input.gpuGib,
    scale,
    lowerDisplayPercent,
  );
  lowerDisplayPercent = setLayer(
    'workload-kv-layer-label',
    'workload-kv-liquid',
    result.kvGib,
    input.gpuGib,
    scale,
    lowerDisplayPercent,
  );
  setLayer(
    'workload-model-layer-label',
    'workload-model-liquid',
    result.modelGib,
    input.gpuGib,
    scale,
    lowerDisplayPercent,
  );

  setText('workload-jar-model', `${number(result.modelGib, 1)} GiB`);
  setText('workload-jar-kv', `${number(result.kvGib, 1)} GiB`);
  setText('workload-jar-extra', `${number(result.alphaGib, 1)} GiB`);
  setText('workload-legend-model', `${number(result.modelGib, 1)} GiB`);
  setText('workload-legend-kv', `${number(result.kvGib, 1)} GiB`);
  setText('workload-legend-extra', `${number(result.alphaGib, 1)} GiB`);
  setText('workload-capacity-label', `${number(input.gpuGib, input.gpuGib % 1 ? 1 : 0)} GiB`);
  setJarState('workload', result);
}

function renderResult(prefix, result, mode) {
  const fitStatus = byId(`${prefix}-fit-status`);
  fitStatus.textContent = result.fits ? 'Fits' : 'Out of memory';
  fitStatus.className = result.fits ? 'fits' : 'oom';

  setText(`${prefix}-total-needed`, `${number(result.totalGib, 1)} GiB`);
  setText(`${prefix}-total-available`, `${number(result.capacityGib, 1)} GiB`);
  setText(`${prefix}-difference-label`, result.fits ? 'Free' : 'Over');
  setText(`${prefix}-difference-value`, `${number(result.fits ? result.remainingGib : result.overflowGib, 1)} GiB`);

  const differenceMetric = byId(`${prefix}-difference-value`).closest('.difference-metric');
  differenceMetric.classList.toggle('is-over', !result.fits);
  differenceMetric.classList.toggle('is-free', result.fits);

  const subject = mode === 'load' ? 'The model weights' : 'The workload';
  const verb = mode === 'load' ? 'need' : 'needs';
  const fitVerb = mode === 'load' ? 'fit' : 'fits';
  setText(
    `${prefix}-plain-verdict`,
    result.fits
      ? `${subject} ${fitVerb} with ${number(result.remainingGib, 1)} GiB free.`
      : `${subject} ${verb} ${number(result.overflowGib, 1)} GiB more VRAM.`,
  );
}

function renderFormulae(input, loadResult, workloadResult) {
  const parameterBillions = model.parameterCount / 1e9;
  setText(
    'load-model-formula',
    `${number(parameterBillions, 3)}B parameters × ${number(input.modelBytes, 3)} bytes (${selectedFormatLabel()}) ÷ 1,073,741,824`,
  );
  setText('load-model-result', `${number(loadResult.modelGib, 2)} GiB`);
  setText('workload-model-result', `${number(loadResult.modelGib, 2)} GiB`);
  setText(
    'workload-kv-formula',
    `2 (K + V) × ${compactInteger(model.layers)} layers × ${compactInteger(model.kvHeads)} KV heads × ${compactInteger(model.headDim)} head dim × ${number(input.kvBytes, 1)} bytes × ${compactInteger(input.contextTokens)} tokens × ${compactInteger(input.concurrentRequests)} ${input.concurrentRequests === 1 ? 'request' : 'requests'}`,
  );
  setText(
    'workload-extra-formula',
    `(${number(workloadResult.modelGib, 2)} GiB model + ${number(workloadResult.kvGib, 2)} GiB KV) × ${number(input.alphaPercent, 0)}%`,
  );
  setText(
    'workload-total-formula',
    `${number(workloadResult.modelGib, 2)} GiB + ${number(workloadResult.kvGib, 2)} GiB + ${number(workloadResult.alphaGib, 2)} GiB`,
  );
  setText('workload-kv-result', `${number(workloadResult.kvGib, 2)} GiB`);
  setText('workload-extra-result', `${number(workloadResult.alphaGib, 2)} GiB`);
  setText('workload-total-result', `${number(workloadResult.totalGib, 2)} GiB`);
}

function update() {
  if (manualParameterOverride || !Number.isFinite(model.parameterCount)) {
    const parameterBillions = Number(byId('parameter-billions').value);
    model = {
      ...model,
      parameterCount: Number.isFinite(parameterBillions) && parameterBillions > 0
        ? parameterBillions * 1e9
        : null,
    };
  }

  const input = readInput();
  const loadResult = calculateModelLoad(input, model);
  if (loadResult.errors.length) {
    renderError(loadResult.errors[0]);
    return;
  }

  renderLoadJar(input, loadResult);
  renderResult('load', loadResult, 'load');

  const workloadResult = calculateVram(input, model);
  if (workloadResult.errors.length) {
    renderError(workloadResult.errors[0]);
    return;
  }

  clearError();
  renderWorkloadJar(input, workloadResult);
  renderResult('workload', workloadResult, 'workload');
  renderFormulae(input, loadResult, workloadResult);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Hugging Face returned ${response.status}.`);
  return response.json();
}

async function loadHuggingFaceModel() {
  const modelId = byId('model-id').value.trim();
  if (!modelId || !modelId.includes('/')) {
    renderError('Enter a Hugging Face model ID such as Qwen/Qwen2.5-7B-Instruct.');
    return;
  }

  const path = modelId.split('/').map(encodeURIComponent).join('/');
  const button = byId('load-model');
  button.disabled = true;
  button.textContent = 'Loading…';
  loadStatus.textContent = 'Reading config.json and model metadata…';
  clearError();

  try {
    const config = await fetchJson(`https://huggingface.co/${path}/resolve/main/config.json`);
    let exactParameterCount = null;
    try {
      const metadata = await fetchJson(`https://huggingface.co/api/models/${path}`);
      exactParameterCount = Number(metadata.safetensors?.total) || null;
    } catch {
      exactParameterCount = null;
    }
    const nextModel = modelFromConfig(config, exactParameterCount, modelId);
    nextModel.id = modelId;
    byId('model-id').value = modelId;
    setModel(nextModel, config);
    loadStatus.textContent = `${modelId} loaded.`;
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Could not load this model.');
    loadStatus.textContent = 'Model not loaded.';
  } finally {
    button.disabled = false;
    button.textContent = 'Load';
  }
}

async function loadConfigFile(file) {
  clearError();
  loadStatus.textContent = `Reading ${file.name}…`;
  try {
    const config = JSON.parse(await file.text());
    const nextModel = modelFromConfig(config, null, file.name);
    byId('model-id').value = config._name_or_path || file.name;
    setModel(nextModel, config);
    loadStatus.textContent = `${file.name} loaded.`;
  } catch (error) {
    renderError(error instanceof Error ? error.message : 'Could not read config.json.');
    loadStatus.textContent = 'Config not loaded.';
  }
}

form.addEventListener('input', (event) => {
  if (event.target.id === 'model-id' || event.target.id === 'config-file') return;
  if (event.target.id === 'parameter-billions') {
    manualParameterOverride = true;
    model.parameterSource = 'Manual input';
    setText('parameter-source', 'Manual input.');
  }
  update();
});

byId('gpu-gib').addEventListener('change', () => {
  toggleCustomFields();
  update();
});
byId('model-format').addEventListener('change', () => {
  toggleCustomFields();
  update();
});

byId('load-model').addEventListener('click', loadHuggingFaceModel);
byId('model-id').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadHuggingFaceModel();
  }
});
byId('config-file').addEventListener('change', (event) => {
  const [file] = event.target.files;
  if (file) loadConfigFile(file);
});

Object.entries(DEFAULT_INPUT).forEach(([key, value]) => {
  const input = form.elements.namedItem(key);
  if (input) input.value = String(value);
});
setModel({ ...DEFAULT_MODEL });
