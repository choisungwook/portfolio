"""Classify workloads with a simplified roofline model."""

from dataclasses import dataclass


@dataclass(frozen=True)
class Accelerator:
  """Describe peak compute and memory bandwidth."""

  name: str
  peak_tflops: float
  memory_bandwidth_gbps: float


def crossover_flops_per_byte(accelerator: Accelerator) -> float:
  """Return the roofline crossover point."""
  return accelerator.peak_tflops * 1000 / accelerator.memory_bandwidth_gbps


def transformer_projection_intensity(sequence_length: int, hidden_size: int) -> float:
  """Reproduce the Chapter 5 simplified Transformer projection estimate."""
  operations = sequence_length * hidden_size * hidden_size
  moved_values = sequence_length * hidden_size + 2 * hidden_size * hidden_size
  return operations / moved_values


def bottleneck(intensity: float, accelerator: Accelerator) -> str:
  """Classify a workload as compute or memory bandwidth bound."""
  if intensity >= crossover_flops_per_byte(accelerator):
    return "compute-bound"
  return "memory-bandwidth-bound"


def main() -> None:
  """Compare simplified L40S prefill and decode workloads."""
  l40s = Accelerator("L40S", peak_tflops=362, memory_bandwidth_gbps=864)
  print(f"{l40s.name} crossover={crossover_flops_per_byte(l40s):.1f} FLOPS/B")
  for sequence_length in [64, 512, 4096]:
    prefill = transformer_projection_intensity(sequence_length, 4096)
    decode = transformer_projection_intensity(1, 4096)
    print(
      f"sequence={sequence_length}: prefill={prefill:.1f} {bottleneck(prefill, l40s)}, "
      f"decode={decode:.1f} {bottleneck(decode, l40s)}"
    )


if __name__ == "__main__":
  main()
