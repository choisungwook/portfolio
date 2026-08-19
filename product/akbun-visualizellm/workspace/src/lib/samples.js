// Configs to start from, written the way each family actually spells its
// fields. They exist so the page has something to draw before the reader has
// found a config.json of their own.

export const SAMPLES = [
  {
    id: 'dense-7b',
    label: 'Dense 7B',
    note: 'The common decoder: 32 layers, multi-head attention, gated MLP',
    config: {
      architectures: ['LlamaForCausalLM'],
      model_type: 'llama',
      hidden_size: 4096,
      intermediate_size: 11008,
      num_hidden_layers: 32,
      num_attention_heads: 32,
      num_key_value_heads: 32,
      max_position_embeddings: 4096,
      vocab_size: 32000,
      hidden_act: 'silu',
      rms_norm_eps: 1e-5,
      rope_theta: 10000.0,
      tie_word_embeddings: false,
      torch_dtype: 'bfloat16',
    },
  },
  {
    id: 'gqa-1_5b',
    label: 'Small chat 1.5B',
    note: 'Grouped-query attention, a sliding window, output weights tied to the embedding',
    config: {
      architectures: ['Qwen2ForCausalLM'],
      model_type: 'qwen2',
      hidden_size: 1536,
      intermediate_size: 8960,
      num_hidden_layers: 28,
      num_attention_heads: 12,
      num_key_value_heads: 2,
      max_position_embeddings: 32768,
      sliding_window: 4096,
      vocab_size: 151936,
      hidden_act: 'silu',
      rms_norm_eps: 1e-6,
      rope_theta: 1000000.0,
      tie_word_embeddings: true,
      torch_dtype: 'bfloat16',
    },
  },
  {
    id: 'moe-8x7b',
    label: 'Mixture of experts 8x7B',
    note: 'Eight expert MLPs per layer, two of them run for any one token',
    config: {
      architectures: ['MixtralForCausalLM'],
      model_type: 'mixtral',
      hidden_size: 4096,
      intermediate_size: 14336,
      num_hidden_layers: 32,
      num_attention_heads: 32,
      num_key_value_heads: 8,
      num_local_experts: 8,
      num_experts_per_tok: 2,
      max_position_embeddings: 32768,
      vocab_size: 32000,
      hidden_act: 'silu',
      rms_norm_eps: 1e-5,
      rope_theta: 1000000.0,
      tie_word_embeddings: false,
      torch_dtype: 'bfloat16',
    },
  },
  {
    id: 'gpt2',
    label: 'GPT-2 small',
    note: 'The older field names: n_embd, n_layer, n_head, learned positions instead of RoPE',
    config: {
      architectures: ['GPT2LMHeadModel'],
      model_type: 'gpt2',
      n_embd: 768,
      n_layer: 12,
      n_head: 12,
      n_positions: 1024,
      n_inner: 3072,
      vocab_size: 50257,
      activation_function: 'gelu_new',
      layer_norm_epsilon: 1e-5,
      tie_word_embeddings: true,
    },
  },
];

/**
 * Find a sample by id.
 * @param {string} id the sample id
 * @returns {object|undefined} the sample entry
 */
export function sampleById(id) {
  return SAMPLES.find((sample) => sample.id === id);
}
