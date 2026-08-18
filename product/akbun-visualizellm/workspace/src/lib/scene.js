// The 3D view: every weight matrix of the model placed in space, sized by its
// shape. Pure geometry, so the layout is testable without a WebGL context.

const MIN_SIDE = 0.5;
const MAX_SIDE = 9;
const GAP = 0.9;
const LAYER_GAP = 2.4;

/**
 * Log scale a dimension into a drawable side length.
 * @param {number} n a tensor dimension
 * @returns {number} a side length between MIN_SIDE and MAX_SIDE
 */
export function side(n) {
  const scaled = Math.log2(Math.max(n, 2)) / 2;
  return Math.min(MAX_SIDE, Math.max(MIN_SIDE, scaled));
}

/**
 * Place every matrix of the model along the flow axis.
 * @param {object} model the model from deriveModel
 * @returns {{blocks: Array<object>, span: number, layerSpan: number, layers: number}} the scene
 */
export function buildScene(model) {
  const blocks = [];
  let x = 0;

  const push = (block) => {
    const width = block.w ?? 0.55;
    blocks.push({ ...block, w: width, x: x + width / 2 });
    x += width + GAP;
    return blocks[blocks.length - 1];
  };

  push(matrix({
    id: 'embedding',
    tone: 'embed',
    label: 'Token Embedding',
    rows: model.dims.vocab,
    cols: model.dims.hidden,
    rowsLabel: 'vocab',
    colsLabel: 'hidden',
    role: 'One row per vocabulary entry. A token id selects a row, and that row is the vector the layers work on.',
  }));

  const layerStart = x;
  const layerBlocks = layerTemplate(model);
  for (let i = 0; i < model.dims.layers; i += 1) {
    for (const block of layerBlocks) {
      push({ ...block, id: `layer${i}-${block.id}`, layer: i, label: `${block.label} (layer ${i})` });
    }
    x += LAYER_GAP - GAP;
  }
  const layerSpan = model.dims.layers > 0 ? (x - layerStart) / model.dims.layers : 0;
  x -= LAYER_GAP - GAP;

  push(matrix({
    id: 'norm-final',
    tone: 'norm',
    label: `Final ${model.flags.normKind}`,
    rows: model.dims.hidden,
    cols: 1,
    rowsLabel: 'hidden',
    colsLabel: 'scale',
    role: 'The last rescale before the vocabulary scores are read off.',
  }));
  push(matrix({
    id: 'lm-head',
    tone: 'head',
    label: model.flags.tied ? 'LM Head (tied to the embedding)' : 'LM Head',
    rows: model.dims.hidden,
    cols: model.dims.vocab,
    rowsLabel: 'hidden',
    colsLabel: 'vocab',
    role: 'Scores every vocabulary entry against the final vector. The sampler reads these numbers and picks the next token.',
  }));

  return { blocks, span: x, layerSpan, layers: model.dims.layers };
}

function layerTemplate(model) {
  const { dims, flags } = model;
  const qDim = dims.heads * dims.headDim;
  const kvDim = dims.kvHeads * dims.headDim;
  const blocks = [
    matrix({
      id: 'norm-in',
      tone: 'norm',
      label: `Input ${flags.normKind}`,
      rows: dims.hidden,
      cols: 1,
      rowsLabel: 'hidden',
      colsLabel: 'scale',
      role: 'One weight per channel, applied before attention reads the stream.',
    }),
    matrix({
      id: 'q',
      tone: 'attn',
      label: 'Q Projection',
      rows: dims.hidden,
      cols: qDim,
      rowsLabel: 'hidden',
      colsLabel: `${dims.heads} heads x ${dims.headDim}`,
      role: 'What this token is looking for, split across the query heads.',
    }),
    matrix({
      id: 'k',
      tone: 'attn',
      label: 'K Projection',
      rows: dims.hidden,
      cols: kvDim,
      rowsLabel: 'hidden',
      colsLabel: `${dims.kvHeads} heads x ${dims.headDim}`,
      role: 'How this token advertises itself to the queries. Its output is what the KV cache stores.',
    }),
    matrix({
      id: 'v',
      tone: 'attn',
      label: 'V Projection',
      rows: dims.hidden,
      cols: kvDim,
      rowsLabel: 'hidden',
      colsLabel: `${dims.kvHeads} heads x ${dims.headDim}`,
      role: 'What this token hands over when a query picks it. Cached alongside K.',
    }),
    scores(model),
    matrix({
      id: 'o',
      tone: 'attn',
      label: 'Output Projection',
      rows: qDim,
      cols: dims.hidden,
      rowsLabel: 'heads',
      colsLabel: 'hidden',
      role: 'Folds the heads back to the hidden width so the result can be added to the stream.',
    }),
    matrix({
      id: 'norm-post',
      tone: 'norm',
      label: `Post-Attention ${flags.normKind}`,
      rows: dims.hidden,
      cols: 1,
      rowsLabel: 'hidden',
      colsLabel: 'scale',
      role: 'The second rescale, in front of the feed-forward block.',
    }),
  ];
  return blocks.concat(mlpTemplate(model));
}

function scores(model) {
  const { dims } = model;
  const width = side(dims.context) / 2;
  return {
    id: 'scores',
    tone: 'attn',
    kind: 'activation',
    label: 'Attention Scores',
    shape: `${dims.heads} heads x T x T`,
    rows: dims.context,
    cols: dims.context,
    h: side(dims.context),
    d: side(dims.context),
    w: width,
    params: 0,
    role: 'Not a weight. It is built at run time, one T by T square per head, which is why long prompts cost memory that the file size never shows.',
  };
}

function mlpTemplate(model) {
  const { dims, flags } = model;
  const names = flags.gated
    ? [['gate', 'Gate Projection', 'Decides how much of the widened vector survives.'], ['up', 'Up Projection', 'Widens the vector to the MLP width.'], ['down', 'Down Projection', 'Squeezes it back to the hidden width.']]
    : [['up', 'Up Projection', 'Widens the vector to the MLP width.'], ['down', 'Down Projection', 'Squeezes it back to the hidden width.']];

  const single = names.map(([id, label, role]) => matrix({
    id,
    tone: 'mlp',
    label,
    rows: id === 'down' ? dims.intermediate : dims.hidden,
    cols: id === 'down' ? dims.hidden : dims.intermediate,
    rowsLabel: id === 'down' ? 'mlp' : 'hidden',
    colsLabel: id === 'down' ? 'hidden' : 'mlp',
    role,
  }));

  if (!flags.moe) return single;

  const router = matrix({
    id: 'router',
    tone: 'mlp',
    label: 'Router',
    rows: dims.hidden,
    cols: flags.moe.experts,
    rowsLabel: 'hidden',
    colsLabel: 'experts',
    role: `Scores the experts for this token and keeps the top ${flags.moe.topK}.`,
  });
  // Every expert is the same stack of matrices, so they are drawn as copies
  // offset along z rather than as separate entries in the flow.
  const experts = single.map((block) => ({
    ...block,
    label: `${block.label} x ${flags.moe.experts} experts`,
    copies: flags.moe.experts,
    role: `${block.role} One per expert, all resident, ${flags.moe.topK} of them run for a given token.`,
  }));
  return [router, ...experts];
}

function matrix({ id, tone, label, rows, cols, rowsLabel, colsLabel, role }) {
  return {
    id,
    tone,
    kind: 'weight',
    label,
    rows,
    cols,
    shape: `${rowsLabel} ${rows} x ${colsLabel} ${cols}`,
    params: rows * cols,
    h: side(rows),
    d: side(cols),
  };
}

/**
 * Sum the weights actually placed in the scene.
 * @param {{blocks: Array<object>}} scene the scene from buildScene
 * @returns {number} parameter count of every weight block
 */
export function sceneParams(scene) {
  return scene.blocks.reduce((sum, b) => sum + (b.params ?? 0) * (b.copies ?? 1), 0);
}
