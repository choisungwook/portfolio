"""Estimate model weight and KV cache memory."""

from dataclasses import dataclass

BYTES_PER_GIB = 1024**3
REPORTED_GPU_MEMORY_MIB = 16311


@dataclass(frozen=True)
class ModelShape:
  """Describe the model fields required for memory estimation."""

  parameters_billions: float
  layers: int
  attention_heads: int
  kv_heads: int
  hidden_size: int

  @property
  def head_dimension(self) -> int:
    """Return the dimension of one attention head."""
    return self.hidden_size // self.attention_heads


def weight_gib(parameters_billions: float, bytes_per_parameter: float) -> float:
  """Estimate model weight memory in GiB."""
  return parameters_billions * 1_000_000_000 * bytes_per_parameter / BYTES_PER_GIB


def kv_bytes_per_token(model: ModelShape, bytes_per_element: float) -> float:
  """Estimate Key and Value cache bytes for one token."""
  return 2 * model.layers * model.kv_heads * model.head_dimension * bytes_per_element


def total_kv_gib(
  model: ModelShape,
  bytes_per_element: float,
  batch_size: int,
  sequence_length: int,
) -> float:
  """Estimate total KV cache memory in GiB."""
  tokens = batch_size * sequence_length
  return kv_bytes_per_token(model, bytes_per_element) * tokens / BYTES_PER_GIB


def available_kv_gib(gpu_gib: float, weight_memory_gib: float, reserve_gib: float) -> float:
  """Return memory available for KV cache after fixed allocations."""
  return max(0.0, gpu_gib - weight_memory_gib - reserve_gib)


def max_batch_size(
  available_gib: float,
  model: ModelShape,
  bytes_per_element: float,
  sequence_length: int,
) -> int:
  """Estimate the batch size allowed by the KV cache budget."""
  request_bytes = kv_bytes_per_token(model, bytes_per_element) * sequence_length
  return max(0, int(available_gib * BYTES_PER_GIB // request_bytes))


# The weight budget uses the model the OOM hands-on actually loads, so the
# printed numbers and the experiment stay in step. Llama-2-7B is here only as
# the book's MHA example.
QWEN_2_5_7B = ModelShape(7.61, 28, 28, 4, 3584)
QWEN_2_5_3B = ModelShape(3.09, 36, 16, 2, 2048)
LLAMA_2_7B = ModelShape(6.74, 32, 32, 32, 4096)


def print_weight_budget(model: ModelShape, gpu_gib: float) -> None:
  """Show how precision changes the weight and KV budget on one GPU."""
  for name, bytes_per_parameter in [("BF16", 2), ("FP8", 1), ("INT4", 0.5)]:
    weights = weight_gib(model.parameters_billions, bytes_per_parameter)
    available = available_kv_gib(gpu_gib, weights, reserve_gib=1.5)
    batch = max_batch_size(available, model, 2, sequence_length=4096)
    print(f"  {name:>4}: weights={weights:5.1f} GiB, KV budget={available:5.1f} GiB, batch~{batch}")


def print_attention_comparison(gpu_gib: float) -> None:
  """Compare MHA and GQA KV cost for the same GPU and sequence length."""
  print("\nKV cost per token, same 16 GB card, 4096-token requests")
  models = [
    ("Llama-2-7B  (MHA)   ", LLAMA_2_7B),
    ("Qwen2.5-7B  (GQA 4) ", QWEN_2_5_7B),
    ("Qwen2.5-3B  (GQA 2) ", QWEN_2_5_3B),
  ]
  for label, model in models:
    per_token = kv_bytes_per_token(model, 2)
    weights = weight_gib(model.parameters_billions, 2)
    available = available_kv_gib(gpu_gib, weights, reserve_gib=1.5)
    batch = max_batch_size(available, model, 2, sequence_length=4096)
    print(
      f"  {label}: kv_heads={model.kv_heads:>2}, "
      f"{per_token / 1024:7.1f} KiB/token, weights={weights:5.1f} GiB, batch~{batch}"
    )


def main() -> None:
  """Compare weight budgets and show why KV heads decide serving capacity."""
  gpu_gib = REPORTED_GPU_MEMORY_MIB / 1024
  print("Qwen2.5-7B weight budget (the model the OOM hands-on loads)")
  print_weight_budget(QWEN_2_5_7B, gpu_gib)
  print_attention_comparison(gpu_gib)


if __name__ == "__main__":
  main()
