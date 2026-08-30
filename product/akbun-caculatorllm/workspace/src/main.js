import './styles.css';
import {
  calculateVram,
  DEFAULT_INPUT,
  DEFAULT_MODEL,
  detectModelBytes,
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

function readInput() {
  const selectedGpu = byId('gpu-gib').value;
  return {
    gpuGib: Number(selectedGpu === 'custom' ? byId('custom-gpu-gib').value : selectedGpu),
    contextTokens: Number(byId('context-tokens').value),
    concurrentRequests: Number(byId('concurrent-requests').value),
    modelBytes: Number(byId('model-bytes').value),
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

function setModel(nextModel, config = null) {
  model = nextModel;
  manualParameterOverride = false;
  if (Number.isFinite(model.parameterCount)) {
    byId('parameter-billions').value = number(model.parameterCount / 1e9, 3);
  } else {
    byId('parameter-billions').value = '';
    byId('advanced-settings').open = true;
  }
  if (config) byId('model-bytes').value = String(detectModelBytes(config));
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
  const liquid = byId(liquidId);
  liquid.style.flexBasis = `${displayPercent}%`;

  const label = byId(labelId);
  label.style.bottom = `${13 + ((lowerDisplayPercent + (displayPercent / 2)) * 0.7)}%`;
  label.hidden = displayPercent < 10;
  return lowerDisplayPercent + displayPercent;
}

function renderJar(input, result) {
  const rawTotalPercent = result.utilization * 100;
  const displayTotalPercent = Math.min(rawTotalPercent, 128);
  const scale = rawTotalPercent > 0 ? displayTotalPercent / rawTotalPercent : 1;
  let lowerDisplayPercent = 0;

  lowerDisplayPercent = setLayer('extra-layer-label', 'extra-liquid', result.alphaGib, input.gpuGib, scale, lowerDisplayPercent);
  lowerDisplayPercent = setLayer('kv-layer-label', 'kv-liquid', result.kvGib, input.gpuGib, scale, lowerDisplayPercent);
  setLayer('model-layer-label', 'model-liquid', result.modelGib, input.gpuGib, scale, lowerDisplayPercent);

  setText('jar-model', `${number(result.modelGib, 1)} GiB`);
  setText('jar-kv', `${number(result.kvGib, 1)} GiB`);
  setText('jar-extra', `${number(result.alphaGib, 1)} GiB`);
  setText('capacity-label', `${number(input.gpuGib, input.gpuGib % 1 ? 1 : 0)} GiB`);

  const stage = byId('jar-stage');
  stage.classList.toggle('oom', !result.fits);
  byId('overflow-label').hidden = result.fits;
  stage.querySelector('.jar-image').alt = `Glass jar showing ${number(result.utilization * 100, 0)}% of GPU VRAM used`;
}

function renderResult(input, result) {
  const fitStatus = byId('fit-status');
  fitStatus.textContent = result.fits ? 'Fits' : 'Out of memory';
  fitStatus.className = result.fits ? 'fits' : 'oom';
  byId('jar-stage').classList.toggle('fits', result.fits);

  setText('total-needed', `${number(result.totalGib, 1)} GiB`);
  setText('total-available', `${number(result.capacityGib, 1)} GiB`);
  setText('difference-label', result.fits ? 'Free' : 'Over');
  setText('difference-value', `${number(result.fits ? result.remainingGib : result.overflowGib, 1)} GiB`);
  setText(
    'plain-verdict',
    result.fits
      ? `The model can load with ${number(result.remainingGib, 1)} GiB left for variance.`
      : `The estimate is ${number(result.overflowGib, 1)} GiB larger than this GPU.`,
  );

  renderJar(input, result);
}

function renderFormulae(input, result) {
  const parameterBillions = model.parameterCount / 1e9;
  setText(
    'model-formula',
    `${number(parameterBillions, 3)}B parameters × ${number(input.modelBytes, 1)} bytes ÷ 1,073,741,824`,
  );
  setText(
    'kv-formula',
    `2 (K + V) × ${compactInteger(model.layers)} layers × ${compactInteger(model.kvHeads)} KV heads × ${compactInteger(model.headDim)} head dim × ${number(input.kvBytes, 1)} bytes × ${compactInteger(input.contextTokens)} tokens × ${compactInteger(input.concurrentRequests)} ${input.concurrentRequests === 1 ? 'request' : 'requests'}`,
  );
  setText(
    'extra-formula',
    `(${number(result.modelGib, 2)} GiB model + ${number(result.kvGib, 2)} GiB KV) × ${number(input.alphaPercent, 0)}%`,
  );
  setText(
    'total-formula',
    `${number(result.modelGib, 2)} GiB + ${number(result.kvGib, 2)} GiB + ${number(result.alphaGib, 2)} GiB`,
  );
  setText('model-result', `${number(result.modelGib, 2)} GiB`);
  setText('kv-result', `${number(result.kvGib, 2)} GiB`);
  setText('extra-result', `${number(result.alphaGib, 2)} GiB`);
  setText('total-result', `${number(result.totalGib, 2)} GiB`);
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
  const result = calculateVram(input, model);
  if (result.errors.length) {
    renderError(result.errors[0]);
    return;
  }

  clearError();
  renderResult(input, result);
  renderFormulae(input, result);
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
  byId('custom-gpu-field').hidden = byId('gpu-gib').value !== 'custom';
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

setModel({ ...DEFAULT_MODEL });
Object.entries(DEFAULT_INPUT).forEach(([key, value]) => {
  const input = form.elements.namedItem(key);
  if (input) input.value = String(value);
});
update();
