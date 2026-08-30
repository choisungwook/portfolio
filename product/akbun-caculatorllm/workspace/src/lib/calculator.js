const GIB = 1024 ** 3;

export const DEFAULT_INPUT = Object.freeze({
  gpuGib: 16,
  contextTokens: 8192,
  concurrentRequests: 1,
  modelBytes: 2,
  kvBytes: 2,
  alphaPercent: 20,
});

export const MODEL_FORMATS = Object.freeze({
  fp32: { label: 'FP32', bytes: 4 },
  bf16: { label: 'BF16', bytes: 2 },
  fp16: { label: 'FP16', bytes: 2 },
  fp8: { label: 'FP8', bytes: 1 },
  int8: { label: 'INT8', bytes: 1 },
  int4: { label: 'INT4', bytes: 0.5 },
  awq4: { label: 'AWQ 4-bit', bytes: 0.5 },
  gptq4: { label: 'GPTQ 4-bit', bytes: 0.5 },
  nf4: { label: 'bitsandbytes NF4', bytes: 0.5 },
  'gguf-q8': { label: 'GGUF Q8', bytes: 1 },
  'gguf-q6': { label: 'GGUF Q6', bytes: 0.75 },
  'gguf-q5': { label: 'GGUF Q5', bytes: 0.625 },
  'gguf-q4': { label: 'GGUF Q4', bytes: 0.5 },
  'gguf-q3': { label: 'GGUF Q3', bytes: 0.375 },
  'gguf-q2': { label: 'GGUF Q2', bytes: 0.25 },
});

export const DEFAULT_MODEL = Object.freeze({
  id: 'Qwen/Qwen2.5-7B-Instruct',
  parameterCount: 7_615_616_512,
  parameterSource: 'Hugging Face metadata',
  layers: 28,
  attentionHeads: 28,
  kvHeads: 4,
  hiddenSize: 3584,
  headDim: 128,
  modelType: 'qwen2',
});

const GATED_MODEL_TYPES = new Set([
  'gemma', 'gemma2', 'gemma3', 'llama', 'mistral', 'mixtral', 'phi3',
  'qwen2', 'qwen3',
]);

function firstNumber(config, keys) {
  for (const key of keys) {
    if (Number.isFinite(Number(config[key]))) return Number(config[key]);
  }
  return null;
}

function normalizeModelType(value) {
  return String(value ?? 'unknown').trim().toLowerCase();
}

function isGatedMlp(config) {
  const activation = String(config.hidden_act ?? config.activation_function ?? '').toLowerCase();
  return GATED_MODEL_TYPES.has(normalizeModelType(config.model_type))
    || activation.includes('silu')
    || activation.includes('swish');
}

export function estimateParameterCount(config, shape) {
  const vocabSize = firstNumber(config, ['vocab_size', 'padded_vocab_size']);
  const intermediateSize = firstNumber(config, ['intermediate_size', 'n_inner', 'ffn_dim']);
  if (!vocabSize || !intermediateSize || !GATED_MODEL_TYPES.has(shape.modelType)) return null;

  const kvWidth = shape.kvHeads * shape.headDim;
  const embeddings = vocabSize * shape.hiddenSize;
  const outputHead = config.tie_word_embeddings === false ? embeddings : 0;
  const attentionPerLayer = (2 * shape.hiddenSize * shape.hiddenSize)
    + (2 * shape.hiddenSize * kvWidth);
  const mlpMultiplier = isGatedMlp(config) ? 3 : 2;
  const mlpPerLayer = mlpMultiplier * shape.hiddenSize * intermediateSize;
  const normsPerLayer = 2 * shape.hiddenSize;
  const finalNorm = shape.hiddenSize;

  return Math.round(
    embeddings
    + outputHead
    + shape.layers * (attentionPerLayer + mlpPerLayer + normsPerLayer)
    + finalNorm,
  );
}

export function modelFromConfig(config, exactParameterCount = null, fallbackId = 'Uploaded config.json') {
  const layers = firstNumber(config, ['num_hidden_layers', 'n_layer', 'num_layers']);
  const attentionHeads = firstNumber(config, ['num_attention_heads', 'n_head']);
  const hiddenSize = firstNumber(config, ['hidden_size', 'n_embd', 'd_model']);
  const kvHeads = firstNumber(config, ['num_key_value_heads', 'n_head_kv']) ?? attentionHeads;
  const explicitHeadDim = firstNumber(config, ['head_dim']);
  const inferredHeadDim = hiddenSize && attentionHeads && hiddenSize % attentionHeads === 0
    ? hiddenSize / attentionHeads
    : null;
  const headDim = explicitHeadDim ?? inferredHeadDim;

  const missing = [
    ['layers', layers],
    ['attention heads', attentionHeads],
    ['KV heads', kvHeads],
    ['hidden size', hiddenSize],
    ['head dimension', headDim],
  ].filter(([, value]) => !Number.isInteger(value) || value <= 0).map(([name]) => name);

  if (missing.length) {
    throw new Error(`config.json is missing ${missing.join(', ')}.`);
  }

  const shape = {
    id: config._name_or_path || fallbackId,
    layers,
    attentionHeads,
    kvHeads,
    hiddenSize,
    headDim,
    modelType: normalizeModelType(config.model_type),
  };
  const embeddedParameterCount = firstNumber(config, [
    'num_parameters', 'parameter_count', 'n_params', 'num_params',
  ]);
  const parameterCount = exactParameterCount
    ?? embeddedParameterCount
    ?? estimateParameterCount(config, shape);

  return {
    ...shape,
    parameterCount,
    parameterSource: exactParameterCount
      ? 'Hugging Face metadata'
      : embeddedParameterCount
        ? 'config.json'
        : parameterCount
          ? 'Estimated from config.json'
          : 'Manual input required',
  };
}

export function detectModelFormat(config) {
  const quantization = config.quantization_config ?? {};
  const method = String(quantization.quant_method ?? '').trim().toLowerCase();
  const quantizationType = String(
    quantization.quantization_type ?? quantization.format ?? config.quantization_type ?? '',
  ).trim().toLowerCase();
  const bits = firstNumber(quantization, ['bits']);

  if (method.includes('awq')) return 'awq4';
  if (method.includes('gptq')) return 'gptq4';
  if (method.includes('bitsandbytes') && (bits === 4 || quantization.load_in_4bit)) return 'nf4';

  const ggufMatch = `${method} ${quantizationType}`.match(/(?:^|[^0-9])q([2-8])(?:[^0-9]|$)/);
  if (ggufMatch && ['2', '3', '4', '5', '6', '8'].includes(ggufMatch[1])) {
    return `gguf-q${ggufMatch[1]}`;
  }

  if (bits === 4) return 'int4';
  if (bits === 8) return 'int8';

  const dtype = String(config.torch_dtype ?? config.dtype ?? '').toLowerCase();
  if (dtype.includes('float32') || dtype === 'fp32') return 'fp32';
  if (dtype.includes('bfloat16') || dtype === 'bf16') return 'bf16';
  if (dtype.includes('float16') || dtype === 'fp16') return 'fp16';
  if (dtype.includes('float8') || dtype.includes('fp8')) return 'fp8';
  if (dtype.includes('int8')) return 'int8';
  if (dtype.includes('int4') || dtype.includes('4bit')) return 'int4';
  return 'bf16';
}

export function detectModelBytes(config) {
  return MODEL_FORMATS[detectModelFormat(config)].bytes;
}

function validateModelLoad(input, model) {
  const errors = [];
  const positive = [
    ['GPU VRAM', input.gpuGib],
    ['Model format', input.modelBytes],
  ];

  for (const [name, value] of positive) {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${name} must be greater than zero.`);
  }
  if (!Number.isFinite(model.parameterCount) || model.parameterCount <= 0) {
    errors.push('Enter the model parameter count in Advanced.');
  }
  return errors;
}

export function validateInput(input, model) {
  const errors = validateModelLoad(input, model);
  const positive = [
    ['Max context', input.contextTokens],
    ['Concurrent requests', input.concurrentRequests],
    ['KV cache precision', input.kvBytes],
    ['Layers', model.layers],
    ['KV heads', model.kvHeads],
    ['Head dimension', model.headDim],
  ];

  for (const [name, value] of positive) {
    if (!Number.isFinite(value) || value <= 0) errors.push(`${name} must be greater than zero.`);
  }
  if (!Number.isInteger(input.contextTokens)) errors.push('Max context must be a whole number.');
  if (!Number.isInteger(input.concurrentRequests)) errors.push('Concurrent requests must be a whole number.');
  if (!Number.isFinite(input.alphaPercent) || input.alphaPercent < 0 || input.alphaPercent > 200) {
    errors.push('Extra memory must be from 0% to 200%.');
  }
  return errors;
}

export function calculateModelLoad(input, model) {
  const errors = validateModelLoad(input, model);
  if (errors.length) return { errors };

  const modelBytes = model.parameterCount * input.modelBytes;
  const capacityBytes = input.gpuGib * GIB;
  const remainingBytes = capacityBytes - modelBytes;

  return {
    errors: [],
    modelGib: modelBytes / GIB,
    totalGib: modelBytes / GIB,
    capacityGib: input.gpuGib,
    remainingGib: Math.max(0, remainingBytes / GIB),
    overflowGib: Math.max(0, -remainingBytes / GIB),
    fits: modelBytes <= capacityBytes,
    utilization: modelBytes / capacityBytes,
  };
}

export function calculateVram(input, model) {
  const errors = validateInput(input, model);
  if (errors.length) return { errors };

  const modelBytes = model.parameterCount * input.modelBytes;
  const kvBytesPerToken = 2 * model.layers * model.kvHeads * model.headDim * input.kvBytes;
  const kvBytes = kvBytesPerToken * input.contextTokens * input.concurrentRequests;
  const baseBytes = modelBytes + kvBytes;
  const alphaBytes = baseBytes * (input.alphaPercent / 100);
  const totalBytes = baseBytes + alphaBytes;
  const capacityBytes = input.gpuGib * GIB;
  const remainingBytes = capacityBytes - totalBytes;

  return {
    errors: [],
    modelGib: modelBytes / GIB,
    kvGib: kvBytes / GIB,
    alphaGib: alphaBytes / GIB,
    totalGib: totalBytes / GIB,
    capacityGib: input.gpuGib,
    remainingGib: Math.max(0, remainingBytes / GIB),
    overflowGib: Math.max(0, -remainingBytes / GIB),
    fits: totalBytes <= capacityBytes,
    utilization: totalBytes / capacityBytes,
    kvBytesPerToken,
  };
}
