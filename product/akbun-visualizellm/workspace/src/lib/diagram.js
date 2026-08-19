// The 2D view: the whole model as one column of blocks, with the role of each
// block and the config fields that decided its shape. Pure data, no DOM.

import { humanCount } from './model.js';

// A block's shape line: one entry per tensor, matrix dimensions inside an entry.
const shape = (...parts) => parts.join(' \u00b7 ');

/**
 * Build the block list the 2D view draws.
 * @param {object} model the model from deriveModel
 * @returns {{sections: Array<object>}} sections in flow order
 */
export function buildDiagram(model) {
  return { sections: [inputSection(model), layerSection(model), outputSection(model)] };
}

function inputSection(model) {
  const { dims, sources } = model;
  return {
    id: 'input',
    kind: 'flow',
    title: 'Input',
    nodes: [
      {
        id: 'tokens',
        tone: 'io',
        title: 'Token IDs',
        shape: shape('T tokens'),
        role: 'The tokenizer has already turned the prompt into integers. Each one is a row number, nothing more, and T is how many of them the prompt became.',
        fields: [],
      },
      {
        id: 'embedding',
        tone: 'embed',
        title: 'Token Embedding',
        shape: shape(`vocab ${dims.vocab} x hidden ${dims.hidden}`),
        role: 'A lookup table with one row per vocabulary entry. Each token id is replaced by its row, so the sequence becomes a stack of vectors the layers can work on.',
        fields: [sources.vocab, sources.hidden],
        params: dims.vocab * dims.hidden,
      },
      positionNode(model),
    ].filter(Boolean),
  };
}

function positionNode(model) {
  if (model.flags.rope === null) return null;
  return {
    id: 'rope',
    tone: 'embed',
    title: 'Rotary Position (RoPE)',
    shape: shape(`theta ${model.flags.rope}`, `up to ${model.dims.context} tokens`),
    role: 'Position is not added to the vector, it is rotated into the query and key of every layer. The angle grows with the distance between two tokens, which is how attention can tell "before" from "after". A larger theta stretches the same rotation over a longer context.',
    fields: [model.sources.ropeTheta, model.sources.context],
  };
}

function layerSection(model) {
  const { dims, flags, sources } = model;
  const qDim = dims.heads * dims.headDim;
  const kvDim = dims.kvHeads * dims.headDim;
  const nodes = [
    normNode(model, 'norm-in', 'Input Norm'),
    {
      id: 'qkv',
      tone: 'attn',
      title: 'Q, K, V Projections',
      shape: shape(`Q ${dims.hidden} -> ${qDim}`, `K,V ${dims.hidden} -> ${kvDim}`),
      role: `Three matrices read the same vector and produce three different views of it: what this token is looking for, how it advertises itself, and what it hands over when picked. ${attentionNote(model)}`,
      fields: [sources.heads, sources.kvHeads, sources.headDim],
      params: dims.hidden * qDim + dims.hidden * kvDim * 2,
    },
    {
      id: 'scores',
      tone: 'attn',
      title: 'Attention Scores + Softmax',
      shape: shape(`${dims.heads} heads`, 'T x T per head'),
      role: `Every query is compared against every key, which is why cost grows with the square of the sequence. A causal mask blanks out the future, softmax turns what is left into weights, and each head mixes the values with them.${windowNote(model)}`,
      fields: [sources.heads, sources.context, model.sources.slidingWindow].filter(Boolean),
    },
    {
      id: 'attn-out',
      tone: 'attn',
      title: 'Output Projection',
      shape: shape(`${qDim} x hidden ${dims.hidden}`),
      role: 'The heads are concatenated and mapped back to the hidden width, so the block returns exactly the shape it was given and can be added back to the stream.',
      fields: [sources.hidden],
      params: qDim * dims.hidden,
    },
    residualNode('residual-attn', 'the attention block'),
    normNode(model, 'norm-post', 'Post-Attention Norm'),
    ...mlpNodes(model),
    residualNode('residual-mlp', 'the feed-forward block'),
  ];
  return {
    id: 'layer',
    kind: 'stack',
    title: `Transformer Layer x ${dims.layers}`,
    repeat: dims.layers,
    subtitle: `${humanCount(model.params.perLayer)} parameters per layer, the same shape repeated ${dims.layers} times`,
    fields: [sources.layers],
    role: 'One layer reads the whole sequence, writes what it learned back into the residual stream, and hands it on unchanged in shape. Depth is this block repeated, not a different block each time.',
    nodes,
    flags,
  };
}

function attentionNote(model) {
  const { attention } = model.flags;
  if (attention === 'MQA') {
    return 'All query heads share a single key and value head, which shrinks the cache that has to be kept for every token generated so far.';
  }
  if (attention === 'GQA') {
    return `Query heads outnumber key/value heads ${model.dims.heads} to ${model.dims.kvHeads}, so several queries share one cached key and value. That is the memory the KV cache does not have to hold.`;
  }
  return 'Each query head has its own key and value head.';
}

function windowNote(model) {
  if (model.flags.slidingWindow === null) return '';
  return ` This model limits the view to the last ${model.flags.slidingWindow} tokens, so the square never grows past the window.`;
}

function normNode(model, id, title) {
  return {
    id,
    tone: 'norm',
    title: `${title} (${model.flags.normKind})`,
    shape: shape(`hidden ${model.dims.hidden}`),
    role: 'Rescales the vector to a stable size before the next block reads it. It holds one weight per hidden channel, which is a rounding error in the parameter count and the difference between a model that trains and one that does not.',
    fields: [model.sources.normEps, model.sources.hidden].filter(Boolean),
    params: model.dims.hidden,
  };
}

function residualNode(id, what) {
  return {
    id,
    tone: 'residual',
    title: 'Residual Add',
    shape: 'in + out',
    role: `The input of ${what} is added back to its output. The stream running down the model is never replaced, only written into, which is what lets gradients reach the first layer.`,
    fields: [],
  };
}

function mlpNodes(model) {
  const { dims, flags, sources } = model;
  const matrices = flags.gated ? 3 : 2;
  const expertParams = matrices * dims.hidden * dims.intermediate;
  if (!flags.moe) {
    return [
      {
        id: 'mlp',
        tone: 'mlp',
        title: flags.gated ? 'Gated MLP' : 'MLP',
        shape: shape(`${dims.hidden} -> ${dims.intermediate}`, `${dims.intermediate} -> ${dims.hidden}`),
        role: `Each token is widened to ${dims.intermediate} channels, passed through ${flags.activation}, and squeezed back. Attention moves information between tokens; this block is where a token thinks about itself, and it holds most of the weights.${flags.gated ? ' The gate projection is a second wide matrix that decides how much of the first one survives.' : ''}`,
        fields: [sources.intermediate, sources.activation],
        params: expertParams,
      },
    ];
  }
  return [
    {
      id: 'router',
      tone: 'mlp',
      title: 'Router',
      shape: shape(`hidden ${dims.hidden} x ${flags.moe.experts} experts`),
      role: `A small matrix scores the experts for this token and keeps the top ${flags.moe.topK}. Routing is per token, not per sequence, so two words in the same sentence can be handled by different experts.`,
      fields: [sources.experts, sources.expertsPerToken],
      params: dims.hidden * flags.moe.experts,
    },
    {
      id: 'experts',
      tone: 'mlp',
      title: `Expert MLPs x ${flags.moe.experts}`,
      shape: shape(`${dims.hidden} -> ${dims.intermediate}`, `${flags.moe.topK} of ${flags.moe.experts} run per token`),
      role: `Every expert is an ordinary MLP of the same shape. All of them sit in memory, only ${flags.moe.topK} run for a given token, which is why a mixture model is far larger on disk than it is expensive per token.`,
      fields: [sources.intermediate, sources.experts, sources.expertsPerToken],
      params: expertParams * flags.moe.experts,
    },
  ];
}

function outputSection(model) {
  const { dims, flags, sources } = model;
  return {
    id: 'output',
    kind: 'flow',
    title: 'Output',
    nodes: [
      normNode(model, 'norm-final', 'Final Norm'),
      {
        id: 'lm-head',
        tone: 'head',
        title: flags.tied ? 'LM Head (tied)' : 'LM Head',
        shape: shape(`hidden ${dims.hidden} x vocab ${dims.vocab}`),
        role: flags.tied
          ? 'Scores every vocabulary entry against the final vector, reusing the embedding matrix transposed instead of holding its own copy. That saves one of the largest matrices in a small model.'
          : 'Scores every vocabulary entry against the final vector. One number per token in the vocabulary, before any temperature or sampling is applied.',
        fields: [sources.vocab, sources.tieEmbeddings].filter(Boolean),
        params: flags.tied ? 0 : dims.vocab * dims.hidden,
      },
      {
        id: 'logits',
        tone: 'io',
        title: 'Logits -> Next Token',
        shape: shape(`vocab ${dims.vocab}`),
        role: 'Softmax turns the scores into a distribution and the sampler picks one token. That token is appended to the prompt and the whole column runs again.',
        fields: [],
      },
    ],
  };
}

/**
 * List every config field the diagram points at, with its value and targets.
 * @param {object} model the model from deriveModel
 * @param {object} diagram the diagram from buildDiagram
 * @returns {Array<{field: string, value: *, nodes: string[]}>} one row per field
 */
export function annotations(model, diagram) {
  const byField = new Map();
  for (const section of diagram.sections) {
    const targets = [{ id: section.id, fields: section.fields ?? [] }, ...section.nodes.map((n) => ({ id: n.id, fields: n.fields }))];
    for (const target of targets) {
      for (const field of target.fields) {
        if (!field) continue;
        if (!byField.has(field)) byField.set(field, { field, value: model.config[field], nodes: [] });
        byField.get(field).nodes.push(target.id);
      }
    }
  }
  return [...byField.values()];
}
