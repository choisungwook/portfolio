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
  """Reproduce the Chapter 5 simplified Transformer projection estimate.

  This keeps the book's denominator, where the output matrix is counted as
  h x h. It is what reproduces the printed decode value of 0.5.
  """
  operations = sequence_length * hidden_size * hidden_size
  moved_values = sequence_length * hidden_size + 2 * hidden_size * hidden_size
  return operations / moved_values


def projection_intensity(sequence_length: int, hidden_size: int) -> float:
  """Return the projection intensity with the output matrix sized [s, h].

  A [s,h] x [h,h] matmul writes an [s,h] output, not an [h,h] one. Using that
  size gives 1.0 for decode instead of 0.5. Both land far below any crossover
  point, so the conclusion does not change, but the arithmetic does.
  """
  operations = sequence_length * hidden_size * hidden_size
  moved_values = 2 * sequence_length * hidden_size + hidden_size * hidden_size
  return operations / moved_values


def bottleneck(intensity: float, accelerator: Accelerator) -> str:
  """Classify a workload as compute or memory bandwidth bound."""
  if intensity >= crossover_flops_per_byte(accelerator):
    return "compute-bound"
  return "memory-bandwidth-bound"


ACCELERATORS = [
  Accelerator("L40S (book)", peak_tflops=362, memory_bandwidth_gbps=864),
  Accelerator("RTX 5060 Ti (measured)", peak_tflops=50.3, memory_bandwidth_gbps=384),
]


def main() -> None:
  """Show how the same workload changes verdict when the accelerator changes."""
  for accelerator in ACCELERATORS:
    crossover = crossover_flops_per_byte(accelerator)
    print(f"\n{accelerator.name}: crossover={crossover:.0f} FLOPS/B")
    for sequence_length in [1, 64, 512, 4096]:
      intensity = projection_intensity(sequence_length, 4096)
      phase = "decode " if sequence_length == 1 else "prefill"
      verdict = bottleneck(intensity, accelerator)
      print(f"  {phase} s={sequence_length:>4}: {intensity:8.1f} FLOPS/B  {verdict}")


if __name__ == "__main__":
  main()
