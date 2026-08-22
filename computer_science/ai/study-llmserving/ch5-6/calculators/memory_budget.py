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


def main() -> None:
  """Compare 7B BF16 and quantized weight budgets on a 16 GB-class GPU."""
  model = ModelShape(7.61, 28, 28, 4, 3584)
  gpu_gib = REPORTED_GPU_MEMORY_MIB / 1024
  for name, bytes_per_parameter in [("BF16", 2), ("FP8", 1), ("INT4", 0.5)]:
    weights = weight_gib(model.parameters_billions, bytes_per_parameter)
    available = available_kv_gib(gpu_gib, weights, reserve_gib=1.5)
    batch = max_batch_size(available, model, 2, sequence_length=4096)
    print(f"{name}: weights={weights:.1f} GiB, KV budget={available:.1f} GiB, batch≈{batch}")


if __name__ == "__main__":
  main()
