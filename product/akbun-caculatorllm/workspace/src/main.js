import './styles.css';
import { calculate, DEFAULT_INPUT, PRESETS } from './lib/calculator.js';

const STORAGE_KEY = 'akbun-caculatorllm.input.v1';
const form = document.getElementById('calculator-form');
const inputs = [...form.querySelectorAll('input')];
const errorBanner = document.getElementById('error-banner');
let lastResult = null;
let lastInput = null;

const byId = (id) => document.getElementById(id);
const number = (value, digits = 0) => new Intl.NumberFormat('en-US', {
  maximumFractionDigits: digits,
  minimumFractionDigits: digits,
}).format(value);

function compact(value, digits = 1) {
  return new Intl.NumberFormat('en-US', {
    notation: value >= 10000 ? 'compact' : 'standard',
    maximumFractionDigits: digits,
  }).format(value);
}

function duration(ms) {
  if (ms < 1000) return `${number(ms, ms < 10 ? 1 : 0)} ms`;
  return `${number(ms / 1000, 2)} s`;
}

function readInput() {
  return Object.fromEntries(inputs.map((input) => [input.name, Number(input.value)]));
}

function writeInput(values) {
  for (const input of inputs) {
    if (values[input.name] !== undefined) input.value = values[input.name];
  }
}

function loadInput() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (stored && typeof stored === 'object') writeInput({ ...DEFAULT_INPUT, ...stored });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function utilizationClass(value) {
  if (value > 1) return 'danger';
  if (value > 0.8) return 'warning';
  return 'healthy';
}

function setFill(id, value) {
  const element = byId(id);
  const percent = Math.max(0, Math.min(100, value * 100));
  element.style.width = `${percent}%`;
  element.className = utilizationClass(value);
}

function renderError(errors) {
  errorBanner.hidden = false;
  errorBanner.textContent = errors[0];
  document.querySelectorAll('.results-panel article, .interpretation').forEach((element) => {
    element.classList.add('results-disabled');
  });
}

function clearError() {
  errorBanner.hidden = true;
  document.querySelectorAll('.results-disabled').forEach((element) => {
    element.classList.remove('results-disabled');
  });
}

function renderFormulae(input, result) {
  byId('rps-formula').innerHTML = `
    <p><strong>Safe prefill RPS</strong><code>(${number(input.prefillTps)} × ${result.replicas} replicas × ${number(result.safeFactor, 2)}) ÷ ${number(input.promptTokens)} = ${number(result.prefillRps, 2)} req/s</code></p>
    <p><strong>Safe decode RPS</strong><code>(${number(input.decodeTps)} × ${result.replicas} replicas × ${number(result.safeFactor, 2)}) ÷ ${number(input.outputTokens)} = ${number(result.decodeRps, 2)} req/s</code></p>
    <p>The lower of the two budgets is the sustainable limit.</p>`;

  byId('latency-formula').innerHTML = `
    <p><strong>TTFT estimate</strong><code>${number(input.promptTokens)} prompt tokens ÷ ${number(input.prefillTps)} prefill tok/s = ${duration(result.ttftMs)}</code></p>
    <p><strong>Inter-token latency</strong><code>${number(input.decodeConcurrency)} active sequences ÷ ${number(input.decodeTps)} decode tok/s = ${duration(result.itlMs)}</code></p>
    <p><strong>Generation time</strong><code>(${number(input.outputTokens)} − 1) × ${duration(result.itlMs)} = ${duration(result.generationMs)}</code></p>
    <p>TTFT is an optimistic service-time estimate. Actual batching, scheduling, prefix caching, token-length variance, and queueing alter latency.</p>`;

  byId('kv-formula').innerHTML = `
    <p><strong>Bytes per token</strong><code>2 (K + V) × ${number(input.layers)} layers × ${number(input.kvHeads)} KV heads × ${number(input.headDim)} head dim × ${number(input.kvBytes, 2)} bytes = ${compact(result.kvBytesPerToken)} bytes</code></p>
    <p><strong>Request allocation</strong><code>ceil(${number(result.contextTokens)} ÷ ${number(input.blockSize)}) × ${number(input.blockSize)} = ${number(result.roundedContextTokens)} tokens = ${number(result.kvRequestMib, 1)} MiB</code></p>
    <p><strong>Sequence ceiling</strong><code>floor(${number(input.kvCacheGib, 1)} GiB ÷ ${number(result.kvRequestMib, 1)} MiB) × ${result.replicas} replicas = ${number(result.kvSequencesSystem)} sequences</code></p>`;
}

function renderInterpretation(input, result) {
  const targetText = result.targetFits
    ? `The ${number(input.targetRps, 2)} req/s target fits with ${number((1 - result.targetSafeRatio) * 100, 0)}% safe-capacity headroom.`
    : `The target exceeds safe capacity. At least ${result.recommendedReplicas} replicas (${result.recommendedGpus} GPUs at TP=${input.tensorParallel}) are estimated for this workload.`;
  const unusedText = result.unusedGpus
    ? `${result.unusedGpus} GPU cannot form a complete TP=${input.tensorParallel} replica and is excluded.`
    : `All ${result.allocatedGpus} GPUs form complete serving replicas.`;
  byId('interpretation').innerHTML = `
    <span class="note-icon dark" aria-hidden="true">→</span>
    <div><strong>${result.bottleneck === 'prefill' ? 'Prompt processing' : 'Token generation'} is the limiting budget.</strong><p>${targetText} ${unusedText}</p></div>`;
}

function render(input, result) {
  clearError();
  lastInput = input;
  lastResult = result;

  byId('max-rps').textContent = number(result.maxRps, 2);
  byId('bottleneck-badge').textContent = `${result.bottleneck.toUpperCase()} BOUND`;
  byId('target-status').textContent = result.targetFits ? 'Target fits' : 'Target exceeds capacity';
  byId('target-status').className = result.targetFits ? 'fit' : 'miss';
  byId('target-ratio').textContent = `${number(result.targetSafeRatio * 100, 0)}% of safe capacity`;
  byId('target-fill').style.width = `${Math.min(100, result.targetSafeRatio * 100)}%`;
  byId('target-fill').className = result.targetFits ? '' : 'over';
  byId('target-marker').style.left = `${Math.min(100, result.targetSafeRatio * 100)}%`;

  byId('total-tps').textContent = compact(result.totalTps);
  byId('requests-hour').textContent = compact(result.requestsPerHour);
  byId('replicas').textContent = String(result.replicas);
  byId('replicas-note').textContent = `${result.allocatedGpus} GPUs allocated${result.unusedGpus ? ` · ${result.unusedGpus} unused` : ''}`;
  byId('tps-gpu').textContent = compact(result.tpsPerGpu);

  byId('prefill-util').textContent = `${number(result.prefillUtilization * 100, 0)}%`;
  byId('decode-util').textContent = `${number(result.decodeUtilization * 100, 0)}%`;
  byId('prefill-util').className = utilizationClass(result.prefillUtilization);
  byId('decode-util').className = utilizationClass(result.decodeUtilization);
  setFill('prefill-fill', result.prefillUtilization);
  setFill('decode-fill', result.decodeUtilization);
  byId('prefill-capacity').textContent = `${number(result.rawPrefillTps)} tok/s raw · ${number(result.safePrefillTps)} safe`;
  byId('decode-capacity').textContent = `${number(result.rawDecodeTps)} tok/s raw · ${number(result.safeDecodeTps)} safe`;
  const targetVerdict = byId('target-verdict');
  targetVerdict.textContent = result.targetFits ? 'READY' : 'OVER TARGET';
  targetVerdict.className = `verdict ${result.targetFits ? '' : 'danger'}`;

  byId('ttft').textContent = duration(result.ttftMs);
  byId('itl').textContent = duration(result.itlMs);
  byId('e2e').textContent = duration(result.e2eMs);
  byId('output-speed').textContent = `${number(result.outputSpeed, 1)} tok/s`;
  const latencyTotal = result.e2eMs || 1;
  byId('ttft-segment').style.flexGrow = Math.max(0.03, result.ttftMs / latencyTotal);
  byId('decode-segment').style.flexGrow = Math.max(0.03, result.generationMs / latencyTotal);
  byId('overhead-segment').style.flexGrow = Math.max(0.03, input.overheadMs / latencyTotal);

  byId('kv-sequences').textContent = number(result.kvSequencesSystem);
  byId('kv-request').textContent = `${number(result.kvRequestMib, 1)} MiB`;
  byId('kv-pressure').textContent = `${number(result.kvPressure * 100, 0)}%`;
  byId('kv-pressure').className = `kv-pressure ${utilizationClass(result.kvPressure)}`;
  byId('kv-summary').textContent = `Target traffic implies about ${number(result.targetConcurrency, 1)} in-flight inference requests. The memory estimate allows ${number(result.kvSequencesPerReplica)} full-length sequences per replica before runtime overhead.`;

  renderFormulae(input, result);
  renderInterpretation(input, result);
}

function update() {
  const input = readInput();
  const result = calculate(input);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(input)); } catch { /* private mode */ }
  if (result.errors.length) {
    lastResult = null;
    renderError(result.errors);
    return;
  }
  render(input, result);
}

function summaryText(input, result) {
  return [
    'akbun caculatorllm — serving capacity estimate',
    `Workload: ${number(input.promptTokens)} prompt + ${number(input.outputTokens)} output tokens`,
    `Deployment: ${result.replicas} replicas, TP=${input.tensorParallel}, ${result.allocatedGpus} GPUs, ${input.reservePercent}% reserve`,
    `Sustainable load: ${number(result.maxRps, 2)} req/s (${result.bottleneck} bound)`,
    `Throughput: ${number(result.totalTps)} total tok/s · ${number(result.requestsPerHour)} req/hour`,
    `Latency estimate: TTFT ${duration(result.ttftMs)} · ITL ${duration(result.itlMs)} · E2E ${duration(result.e2eMs)}`,
    `Target: ${number(input.targetRps, 2)} req/s · ${result.targetFits ? 'fits safe capacity' : 'exceeds safe capacity'}`,
    `KV cache: ${number(result.kvSequencesSystem)} full-length sequences · ${number(result.kvRequestMib, 1)} MiB/request`,
    'Assumption: measured rates match the production workload; this is not a benchmark or queueing simulation.',
  ].join('\n');
}

form.addEventListener('input', () => {
  document.querySelectorAll('.preset').forEach((button) => button.classList.remove('active'));
  update();
});

document.querySelectorAll('.preset').forEach((button) => {
  button.addEventListener('click', () => {
    writeInput(PRESETS[button.dataset.preset]);
    document.querySelectorAll('.preset').forEach((item) => item.classList.toggle('active', item === button));
    update();
  });
});

document.getElementById('reset-button').addEventListener('click', () => {
  writeInput(DEFAULT_INPUT);
  document.querySelectorAll('.preset').forEach((button) => button.classList.toggle('active', button.dataset.preset === 'chat'));
  update();
});

document.querySelectorAll('[data-formula-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const target = byId(button.dataset.formulaToggle);
    const open = target.hidden;
    target.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'Hide calculation' : button.dataset.formulaToggle === 'latency-formula' ? 'Show assumptions' : button.dataset.formulaToggle === 'kv-formula' ? 'Show memory formula' : 'Show calculation';
  });
});

document.getElementById('copy-button').addEventListener('click', async (event) => {
  if (!lastResult) return;
  const button = event.currentTarget;
  try {
    await navigator.clipboard.writeText(summaryText(lastInput, lastResult));
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy summary'; }, 1400);
  } catch {
    button.textContent = 'Copy unavailable';
  }
});

loadInput();
update();
