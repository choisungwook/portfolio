const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

export const DEFAULT_INPUT = Object.freeze({
  promptTokens: 1024,
  outputTokens: 256,
  targetRps: 1.5,
  totalGpus: 4,
  tensorParallel: 2,
  reservePercent: 20,
  prefillTps: 4200,
  decodeTps: 680,
  decodeConcurrency: 16,
  overheadMs: 25,
  kvCacheGib: 24,
  layers: 32,
  kvHeads: 8,
  headDim: 128,
  kvBytes: 2,
  blockSize: 16,
});

export const PRESETS = Object.freeze({
  chat: { promptTokens: 1024, outputTokens: 256, targetRps: 1.5 },
  rag: { promptTokens: 4096, outputTokens: 512, targetRps: 0.5 },
  agent: { promptTokens: 8192, outputTokens: 1024, targetRps: 0.2 },
});

const POSITIVE_FIELDS = [
  'promptTokens', 'outputTokens', 'totalGpus', 'tensorParallel', 'prefillTps',
  'decodeTps', 'decodeConcurrency', 'kvCacheGib', 'layers', 'kvHeads',
  'headDim', 'kvBytes', 'blockSize',
];

const INTEGER_FIELDS = [
  'promptTokens', 'outputTokens', 'totalGpus', 'tensorParallel',
  'decodeConcurrency', 'layers', 'kvHeads', 'headDim', 'blockSize',
];

export function validateInput(input) {
  const errors = [];
  for (const field of [...POSITIVE_FIELDS, 'targetRps', 'reservePercent', 'overheadMs']) {
    if (!Number.isFinite(input[field])) errors.push(`${field} must be a number`);
  }
  for (const field of POSITIVE_FIELDS) {
    if (Number.isFinite(input[field]) && input[field] <= 0) errors.push(`${field} must be greater than zero`);
  }
  for (const field of INTEGER_FIELDS) {
    if (Number.isFinite(input[field]) && !Number.isInteger(input[field])) errors.push(`${field} must be a whole number`);
  }
  if (input.targetRps < 0) errors.push('targetRps cannot be negative');
  if (input.reservePercent < 0 || input.reservePercent > 95) errors.push('reservePercent must be from 0 to 95');
  if (input.overheadMs < 0) errors.push('overheadMs cannot be negative');
  if (input.tensorParallel > input.totalGpus) errors.push('Tensor parallel cannot exceed total GPUs');
  return errors;
}

export function calculate(input) {
  const errors = validateInput(input);
  if (errors.length) return { errors };

  const replicas = Math.floor(input.totalGpus / input.tensorParallel);
  const allocatedGpus = replicas * input.tensorParallel;
  const unusedGpus = input.totalGpus - allocatedGpus;
  const safeFactor = 1 - (input.reservePercent / 100);

  const rawPrefillTps = input.prefillTps * replicas;
  const rawDecodeTps = input.decodeTps * replicas;
  const safePrefillTps = rawPrefillTps * safeFactor;
  const safeDecodeTps = rawDecodeTps * safeFactor;

  const prefillRps = safePrefillTps / input.promptTokens;
  const decodeRps = safeDecodeTps / input.outputTokens;
  const maxRps = Math.min(prefillRps, decodeRps);
  const bottleneck = prefillRps <= decodeRps ? 'prefill' : 'decode';
  const totalTps = maxRps * (input.promptTokens + input.outputTokens);
  const requestsPerHour = maxRps * 3600;
  const tpsPerGpu = totalTps / allocatedGpus;

  const prefillUtilization = (input.targetRps * input.promptTokens) / rawPrefillTps;
  const decodeUtilization = (input.targetRps * input.outputTokens) / rawDecodeTps;
  const targetSafeRatio = maxRps === 0 ? Infinity : input.targetRps / maxRps;
  const targetFits = input.targetRps <= maxRps;
  const perReplicaSafeRps = Math.min(
    (input.prefillTps * safeFactor) / input.promptTokens,
    (input.decodeTps * safeFactor) / input.outputTokens,
  );
  const recommendedReplicas = Math.max(1, Math.ceil(input.targetRps / perReplicaSafeRps));
  const recommendedGpus = recommendedReplicas * input.tensorParallel;

  // These latency figures intentionally use the measured aggregate rates. TTFT
  // is an optimistic service-time estimate. TPOT divides aggregate decode rate
  // by the concurrency at which that rate was measured.
  const ttftMs = (input.promptTokens / input.prefillTps) * 1000;
  const itlMs = (input.decodeConcurrency / input.decodeTps) * 1000;
  const generationMs = Math.max(0, input.outputTokens - 1) * itlMs;
  const inferenceMs = ttftMs + generationMs;
  const e2eMs = inferenceMs + input.overheadMs;
  const outputSpeed = input.outputTokens / (inferenceMs / 1000);
  const targetConcurrency = input.targetRps * (inferenceMs / 1000);

  // A standard decoder-only attention cache stores both key and value for each
  // layer, KV head and head dimension. Token allocation rounds to cache blocks.
  const contextTokens = input.promptTokens + input.outputTokens;
  const roundedContextTokens = Math.ceil(contextTokens / input.blockSize) * input.blockSize;
  const kvBytesPerToken = 2 * input.layers * input.kvHeads * input.headDim * input.kvBytes;
  const kvBytesPerRequest = kvBytesPerToken * roundedContextTokens;
  const kvSequencesPerReplica = Math.floor((input.kvCacheGib * GIB) / kvBytesPerRequest);
  const kvSequencesSystem = kvSequencesPerReplica * replicas;
  const kvPressure = kvSequencesSystem === 0 ? Infinity : targetConcurrency / kvSequencesSystem;

  return {
    errors: [],
    replicas,
    allocatedGpus,
    unusedGpus,
    safeFactor,
    rawPrefillTps,
    rawDecodeTps,
    safePrefillTps,
    safeDecodeTps,
    prefillRps,
    decodeRps,
    maxRps,
    bottleneck,
    totalTps,
    requestsPerHour,
    tpsPerGpu,
    prefillUtilization,
    decodeUtilization,
    targetSafeRatio,
    targetFits,
    recommendedReplicas,
    recommendedGpus,
    ttftMs,
    itlMs,
    generationMs,
    inferenceMs,
    e2eMs,
    outputSpeed,
    targetConcurrency,
    contextTokens,
    roundedContextTokens,
    kvBytesPerToken,
    kvBytesPerRequest,
    kvRequestMib: kvBytesPerRequest / MIB,
    kvSequencesPerReplica,
    kvSequencesSystem,
    kvPressure,
  };
}
