"""Measure the real roofline of the installed GPU with matmul microbenchmarks.

Chapter 5 draws the roofline from vendor spec sheets. This module measures the
same two numbers on the card that is actually installed, so the crossover point
is observed rather than quoted.
"""

import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import torch

BYTES_PER_ELEMENT = 2
SQUARE_SIZES = [64, 128, 256, 512, 1024, 2048, 4096, 8192]
SEQUENCE_LENGTHS = [1, 8, 64, 512, 2048, 4096]
HIDDEN_SIZE = int(os.getenv("HIDDEN_SIZE", "2048"))
WARMUP_ITERATIONS = 5
MEASURED_ITERATIONS = 20
BANDWIDTH_ELEMENTS = 256 * 1024 * 1024


@dataclass(frozen=True)
class MatmulPoint:
  """Record one matmul shape with its intensity and achieved throughput.

  `implied_gbps` is the Chapter 5 byte count divided by the measured time, not
  observed HBM traffic. Tiled kernels reuse operands in on-chip memory, so the
  real traffic is lower. Treat it as the model's own accounting.
  """

  label: str
  m: int
  n: int
  k: int
  arithmetic_intensity: float
  achieved_tflops: float
  implied_gbps: float
  milliseconds: float


def arithmetic_intensity(m: int, n: int, k: int) -> float:
  """Return FLOPS per byte for one [m,k]x[k,n] matmul, as in Chapter 5."""
  operations = 2 * m * n * k
  moved_bytes = BYTES_PER_ELEMENT * (m * k + k * n + m * n)
  return operations / moved_bytes


def time_matmul(m: int, n: int, k: int) -> float:
  """Return the median seconds of one [m,k]x[k,n] BF16 matmul."""
  left = torch.randn(m, k, device="cuda", dtype=torch.bfloat16)
  right = torch.randn(k, n, device="cuda", dtype=torch.bfloat16)
  for _ in range(WARMUP_ITERATIONS):
    left @ right
  torch.cuda.synchronize()
  samples = []
  for _ in range(MEASURED_ITERATIONS):
    started = time.perf_counter()
    left @ right
    torch.cuda.synchronize()
    samples.append(time.perf_counter() - started)
  return sorted(samples)[len(samples) // 2]


def measure_matmul(label: str, m: int, n: int, k: int) -> MatmulPoint:
  """Measure achieved compute and data movement for one matmul shape."""
  seconds = time_matmul(m, n, k)
  operations = 2 * m * n * k
  moved_bytes = BYTES_PER_ELEMENT * (m * k + k * n + m * n)
  return MatmulPoint(
    label=label,
    m=m,
    n=n,
    k=k,
    arithmetic_intensity=arithmetic_intensity(m, n, k),
    achieved_tflops=operations / seconds / 1e12,
    implied_gbps=moved_bytes / seconds / 1e9,
    milliseconds=seconds * 1000,
  )


def measure_peak_bandwidth() -> float:
  """Return achieved GB/s for a large device-to-device copy."""
  source = torch.empty(BANDWIDTH_ELEMENTS, device="cuda", dtype=torch.bfloat16)
  destination = torch.empty_like(source)
  moved_bytes = 2 * source.numel() * BYTES_PER_ELEMENT
  for _ in range(WARMUP_ITERATIONS):
    destination.copy_(source)
  torch.cuda.synchronize()
  samples = []
  for _ in range(MEASURED_ITERATIONS):
    started = time.perf_counter()
    destination.copy_(source)
    torch.cuda.synchronize()
    samples.append(time.perf_counter() - started)
  return moved_bytes / sorted(samples)[len(samples) // 2] / 1e9


def square_sweep() -> list[MatmulPoint]:
  """Measure square matmuls, reproducing the Chapter 5 M=N=K table."""
  return [measure_matmul(f"square-{size}", size, size, size) for size in SQUARE_SIZES]


def llm_shape_sweep() -> list[MatmulPoint]:
  """Measure the [s,h]x[h,h] projection shape for prefill and decode."""
  points = []
  for sequence_length in SEQUENCE_LENGTHS:
    phase = "decode" if sequence_length == 1 else "prefill"
    label = f"{phase}-s{sequence_length}"
    points.append(measure_matmul(label, sequence_length, HIDDEN_SIZE, HIDDEN_SIZE))
  return points


def build_report() -> dict[str, object]:
  """Run every probe and return the roofline report."""
  squares = square_sweep()
  peak_tflops = max(point.achieved_tflops for point in squares)
  peak_gbps = measure_peak_bandwidth()
  return {
    "device": torch.cuda.get_device_name(0),
    "hidden_size": HIDDEN_SIZE,
    "peak_tflops_measured": peak_tflops,
    "peak_gbps_measured": peak_gbps,
    "crossover_flops_per_byte": peak_tflops * 1e12 / (peak_gbps * 1e9),
    "square_sweep": [asdict(point) for point in squares],
    "llm_shape_sweep": [asdict(point) for point in llm_shape_sweep()],
  }


def main() -> None:
  """Measure the roofline and write it next to the other benchmark results."""
  if not torch.cuda.is_available():
    raise RuntimeError("roofline_probe requires a CUDA device")
  report = build_report()
  output = Path("results/roofline-probe.json")
  output.parent.mkdir(parents=True, exist_ok=True)
  output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
  print(f"device={report['device']}")
  print(
    f"peak={report['peak_tflops_measured']:.1f} TFLOPS, {report['peak_gbps_measured']:.0f} GB/s"
  )
  print(f"crossover={report['crossover_flops_per_byte']:.0f} FLOPS/B")
  for point in report["llm_shape_sweep"]:
    verdict = (
      "compute-bound"
      if point["arithmetic_intensity"] >= report["crossover_flops_per_byte"]
      else "memory-bandwidth-bound"
    )
    print(f"  {point['label']:>16}: {point['arithmetic_intensity']:8.1f} FLOPS/B  {verdict}")


if __name__ == "__main__":
  main()
