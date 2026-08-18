// Reads a Hugging Face style config.json and turns it into the model the rest
// of the page draws. Nothing here touches the DOM, so the tests run on plain
// node without a browser and without a build.

// Every field a config may spell differently. The first alias present wins, and
// the alias that matched is kept as `source` so the page can point an arrow at
// the exact line of the config the reader is looking at.
export const FIELD_ALIASES = {
  hidden: ['hidden_size', 'n_embd', 'd_model', 'dim'],
  layers: ['num_hidden_layers', 'n_layer', 'num_layers', 'n_layers'],
  heads: ['num_attention_heads', 'n_head', 'num_heads'],
  kvHeads: ['num_key_value_heads', 'num_kv_heads'],
  headDim: ['head_dim'],
  intermediate: ['intermediate_size', 'n_inner', 'ffn_dim', 'd_ff'],
  vocab: ['vocab_size'],
  context: ['max_position_embeddings', 'n_positions', 'max_sequence_length'],
  activation: ['hidden_act', 'activation_function', 'hidden_activation'],
  normEps: ['rms_norm_eps', 'layer_norm_epsilon', 'layer_norm_eps'],
  ropeTheta: ['rope_theta'],
  experts: ['num_local_experts', 'num_experts', 'n_routed_experts'],
  expertsPerToken: ['num_experts_per_tok', 'num_experts_per_token', 'top_k'],
  slidingWindow: ['sliding_window'],
  tieEmbeddings: ['tie_word_embeddings'],
};

// Activations whose MLP has a gate projection, so the block holds three
// matrices instead of two. Getting this wrong misses a third of the parameters.
const GATED_ACTIVATIONS = ['silu', 'swish', 'swiglu', 'geglu', 'gelu_pytorch_tanh'];

/**
 * Parse config.json text.
 * @param {string} text raw file or pasted document
 * @returns {object} the parsed config
 * @throws {Error} when the text is not JSON or not a model config
 */
export function parseConfig(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    throw new Error('Paste a config.json or open one.');
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`Not valid JSON: ${error.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('A config.json is a JSON object.');
  }
  const config = unwrapTextConfig(parsed);
  if (readField(config, 'hidden') === null || readField(config, 'layers') === null) {
    throw new Error('No hidden size or layer count found. This does not look like a model config.json.');
  }
  return config;
}

// Multimodal configs keep the language model one level down. The page draws the
// text stack, so it is the nested object that matters.
function unwrapTextConfig(config) {
  if (readField(config, 'hidden') !== null) return config;
  for (const key of ['text_config', 'llm_config', 'language_config', 'decoder']) {
    const nested = config[key];
    if (nested && typeof nested === 'object' && readField(nested, 'hidden') !== null) {
      return { ...nested, model_type: nested.model_type ?? config.model_type, architectures: config.architectures };
    }
  }
  return config;
}

/**
 * Read one logical field through its aliases.
 * @param {object} config parsed config
 * @param {string} key a key of FIELD_ALIASES
 * @returns {{value: *, source: string}|null} the value and the config field it came from
 */
export function readField(config, key) {
  for (const alias of FIELD_ALIASES[key] ?? []) {
    const value = config[alias];
    if (value !== undefined && value !== null) return { value, source: alias };
  }
  return null;
}

function numberField(config, key, fallback = null) {
  const found = readField(config, key);
  if (found === null || typeof found.value !== 'number') {
    return fallback === null ? null : { value: fallback, source: null };
  }
  return found;
}

/**
 * Turn a config into the model description the 2D and 3D views read.
 * @param {object} config parsed config
 * @returns {object} dims, flags, per-field sources and a parameter estimate
 */
export function deriveModel(config) {
  const hidden = numberField(config, 'hidden');
  const layers = numberField(config, 'layers');
  const heads = numberField(config, 'heads', 1);
  const kvHeads = numberField(config, 'kvHeads', heads.value);
  const headDim = numberField(config, 'headDim', Math.floor(hidden.value / heads.value));
  const intermediate = numberField(config, 'intermediate', hidden.value * 4);
  const vocab = numberField(config, 'vocab', 32000);
  const context = numberField(config, 'context', 2048);
  const experts = numberField(config, 'experts');
  const expertsPerToken = numberField(config, 'expertsPerToken', 1);
  const activation = readField(config, 'activation') ?? { value: 'silu', source: null };
  const normEps = readField(config, 'normEps');
  const ropeTheta = readField(config, 'ropeTheta');
  const slidingWindow = readField(config, 'slidingWindow');
  const tie = readField(config, 'tieEmbeddings');

  const sources = {
    hidden: hidden.source,
    layers: layers.source,
    heads: heads.source,
    kvHeads: kvHeads.source,
    headDim: headDim.source,
    intermediate: intermediate.source,
    vocab: vocab.source,
    context: context.source,
    activation: activation.source,
    normEps: normEps?.source ?? null,
    ropeTheta: ropeTheta?.source ?? null,
    experts: experts?.source ?? null,
    expertsPerToken: expertsPerToken?.source ?? null,
    slidingWindow: slidingWindow?.source ?? null,
    tieEmbeddings: tie?.source ?? null,
  };

  const dims = {
    hidden: hidden.value,
    layers: layers.value,
    heads: heads.value,
    kvHeads: kvHeads.value,
    headDim: headDim.value,
    intermediate: intermediate.value,
    vocab: vocab.value,
    context: context.value,
  };

  const flags = {
    attention: attentionKind(dims.heads, dims.kvHeads),
    gated: GATED_ACTIVATIONS.includes(String(activation.value).toLowerCase()),
    activation: String(activation.value),
    normKind: normEps?.source === 'rms_norm_eps' ? 'RMSNorm' : 'LayerNorm',
    normEps: normEps?.value ?? null,
    rope: ropeTheta?.value ?? null,
    slidingWindow: typeof slidingWindow?.value === 'number' ? slidingWindow.value : null,
    tied: tie?.value === true,
    moe: experts === null ? null : { experts: experts.value, topK: expertsPerToken.value },
  };

  const model = {
    name: modelName(config),
    modelType: config.model_type ?? null,
    architectures: Array.isArray(config.architectures) ? config.architectures : [],
    dims,
    flags,
    sources,
    config,
  };
  model.params = countParams(model);
  return model;
}

function modelName(config) {
  if (Array.isArray(config.architectures) && config.architectures.length > 0) {
    return config.architectures[0];
  }
  return config.model_type ?? 'model';
}

/**
 * Name the attention scheme from the head counts.
 * @param {number} heads query heads
 * @param {number} kvHeads key and value heads
 * @returns {'MHA'|'GQA'|'MQA'} the scheme
 */
export function attentionKind(heads, kvHeads) {
  if (kvHeads === 1 && heads > 1) return 'MQA';
  if (kvHeads < heads) return 'GQA';
  return 'MHA';
}

/**
 * Estimate the parameter count from the shapes alone.
 * @param {object} model the model from deriveModel
 * @returns {object} per-part counts and the total
 */
export function countParams(model) {
  const { hidden, layers, heads, kvHeads, headDim, intermediate, vocab } = model.dims;
  const qDim = heads * headDim;
  const kvDim = kvHeads * headDim;
  const attentionPerLayer = hidden * qDim + hidden * kvDim * 2 + qDim * hidden;
  const mlpMatrices = model.flags.gated ? 3 : 2;
  const expertCount = model.flags.moe ? model.flags.moe.experts : 1;
  const router = model.flags.moe ? hidden * model.flags.moe.experts : 0;
  const mlpPerLayer = mlpMatrices * hidden * intermediate * expertCount + router;
  const normsPerLayer = hidden * 2;

  const embedding = vocab * hidden;
  const attention = attentionPerLayer * layers;
  const mlp = mlpPerLayer * layers;
  const norms = normsPerLayer * layers + hidden;
  const lmHead = model.flags.tied ? 0 : vocab * hidden;
  return {
    embedding,
    attention,
    mlp,
    norms,
    lmHead,
    perLayer: attentionPerLayer + mlpPerLayer + normsPerLayer,
    total: embedding + attention + mlp + norms + lmHead,
  };
}

/**
 * Format a count the way model cards do.
 * @param {number} n a parameter count
 * @returns {string} for example "6.7B"
 */
export function humanCount(n) {
  if (!Number.isFinite(n)) return '-';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(n / 1e9 >= 10 ? 0 : 1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(n / 1e6 >= 10 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(n);
}

/**
 * The headline facts shown above the diagram.
 * @param {object} model the model from deriveModel
 * @returns {Array<{label: string, value: string, field: string|null}>} summary rows
 */
export function summary(model) {
  const { dims, flags } = model;
  const rows = [
    { label: 'Parameters', value: `${humanCount(model.params.total)} (estimated)`, field: null },
    { label: 'Layers', value: String(dims.layers), field: model.sources.layers },
    { label: 'Hidden size', value: String(dims.hidden), field: model.sources.hidden },
    { label: 'Attention', value: `${flags.attention}, ${dims.heads} heads / ${dims.kvHeads} kv`, field: model.sources.heads },
    { label: 'Head dim', value: String(dims.headDim), field: model.sources.headDim },
    { label: 'MLP width', value: String(dims.intermediate), field: model.sources.intermediate },
    { label: 'Vocabulary', value: String(dims.vocab), field: model.sources.vocab },
    { label: 'Context', value: `${dims.context} tokens`, field: model.sources.context },
    { label: 'Activation', value: flags.activation, field: model.sources.activation },
    { label: 'Normalization', value: flags.normKind, field: model.sources.normEps },
  ];
  if (flags.rope !== null) {
    rows.push({ label: 'RoPE theta', value: String(flags.rope), field: model.sources.ropeTheta });
  }
  if (flags.slidingWindow !== null) {
    rows.push({ label: 'Sliding window', value: `${flags.slidingWindow} tokens`, field: model.sources.slidingWindow });
  }
  if (flags.moe) {
    rows.push({
      label: 'Experts',
      value: `${flags.moe.experts}, ${flags.moe.topK} active per token`,
      field: model.sources.experts,
    });
  }
  if (flags.tied) {
    rows.push({ label: 'Output weights', value: 'tied to the embedding', field: model.sources.tieEmbeddings });
  }
  return rows;
}
