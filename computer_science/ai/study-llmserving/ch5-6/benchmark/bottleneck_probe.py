"""Drive vLLM into a bandwidth bottleneck and a compute bottleneck on purpose.

GPU utilization alone cannot separate the two: a stalled memory pipeline and a
saturated tensor core both report a busy GPU. This module runs workloads built
to sit on opposite sides of the roofline and records what each one does.

Adding MEM_COPY_UTIL does not rescue the classification. On a GeForce card it
was measured tracking GPU_UTIL closely even in the compute-bound prefill run,
because both are time-busy ratios rather than bandwidth ratios, and no
DCGM_FI_PROF_* metric is exposed there. The pair is still collected, but only
the ceiling ratio below should be read as a verdict.

That ceiling is the useful number. Generating one token at batch size 1 reads
every model weight once, so bandwidth divided by weight bytes is the highest
token rate the card can reach no matter how fast its math units are.
"""

import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from benchmark.common import (
  fetch_metric_mean,
  fetch_metric_peak,
  metric_summary,
  save_json,
  stream_completion,
  wait_for_health,
)

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_ID = os.getenv("MODEL_ID", "Qwen/Qwen2.5-3B-Instruct")
BYTES_PER_PARAMETER = 2
MEASURED_BANDWIDTH_GBPS = float(os.getenv("MEASURED_BANDWIDTH_GBPS", "0"))


@dataclass(frozen=True)
class Scenario:
  """Describe a workload built to land on one side of the roofline."""

  name: str
  concurrency: int
  prompt_tokens: int
  max_tokens: int
  expectation: str


SCENARIOS = [
  Scenario("decode-bound", 1, 32, 512, "memory-bandwidth-bound"),
  Scenario("decode-bound-batched", 16, 32, 512, "memory-bandwidth-bound, amortized"),
  Scenario("prefill-bound", 8, 3584, 1, "compute-bound"),
  Scenario("mixed", 8, 512, 128, "mixed"),
]


def weight_bytes(parameters_billions: float) -> float:
  """Return BF16 weight bytes for a parameter count."""
  return parameters_billions * 1e9 * BYTES_PER_PARAMETER


def decode_ceiling_tps(bandwidth_gbps: float, parameters_billions: float) -> float:
  """Return the highest batch-1 decode token rate memory bandwidth allows."""
  return bandwidth_gbps * 1e9 / weight_bytes(parameters_billions)


def build_prompt(prompt_tokens: int) -> str:
  """Build a prompt of roughly the requested token length with no cache reuse."""
  return f"unique-{time.time_ns()} " + " serving" * max(1, prompt_tokens)


async def run_scenario(client: httpx.AsyncClient, scenario: Scenario) -> dict[str, object]:
  """Run one scenario and collect latency plus GPU indicators."""
  semaphore = asyncio.Semaphore(scenario.concurrency)
  prompts = [build_prompt(scenario.prompt_tokens) for _ in range(scenario.concurrency * 2)]

  async def limited(prompt: str):
    async with semaphore:
      return await stream_completion(client, BASE_URL, MODEL_NAME, prompt, scenario.max_tokens)

  started_epoch = time.time()
  started = time.perf_counter()
  metrics = await asyncio.gather(*[limited(prompt) for prompt in prompts])
  elapsed = time.perf_counter() - started
  finished_epoch = time.time()
  indicators = await _fetch_indicators(started_epoch, finished_epoch)
  return {
    "scenario": scenario.name,
    "expectation": scenario.expectation,
    "concurrency": scenario.concurrency,
    "prompt_tokens": scenario.prompt_tokens,
    "max_tokens": scenario.max_tokens,
    "elapsed_seconds": elapsed,
    **metric_summary(metrics, elapsed),
    **indicators,
  }


async def _fetch_indicators(started_epoch: float, finished_epoch: float) -> dict[str, float | None]:
  """Read the GPU indicators that separate a stalled pipeline from a busy one."""
  mean_queries = {
    "gpu_util_mean": "DCGM_FI_DEV_GPU_UTIL",
    "mem_copy_util_mean": "DCGM_FI_DEV_MEM_COPY_UTIL",
    "power_watt_mean": "DCGM_FI_DEV_POWER_USAGE",
  }
  peak_queries = {
    "gpu_util_peak": "DCGM_FI_DEV_GPU_UTIL",
    "mem_copy_util_peak": "DCGM_FI_DEV_MEM_COPY_UTIL",
    "kv_usage_peak_perc": "vllm:kv_cache_usage_perc or vllm:gpu_cache_usage_perc",
    "peak_vram_mib": "DCGM_FI_DEV_FB_USED",
  }
  means = await asyncio.gather(
    *[
      fetch_metric_mean(PROMETHEUS_URL, query, started_epoch, finished_epoch)
      for query in mean_queries.values()
    ]
  )
  peaks = await asyncio.gather(
    *[
      fetch_metric_peak(PROMETHEUS_URL, query, started_epoch, finished_epoch)
      for query in peak_queries.values()
    ]
  )
  return {
    **dict(zip(mean_queries.keys(), means, strict=True)),
    **dict(zip(peak_queries.keys(), peaks, strict=True)),
  }


def annotate_decode_ceiling(step: dict[str, object], ceiling_tps: float) -> None:
  """Add how close a decode scenario ran to the bandwidth ceiling."""
  per_sequence_tps = float(step["output_tps"]) / int(step["concurrency"])
  step["decode_ceiling_tps"] = ceiling_tps
  step["per_sequence_output_tps"] = per_sequence_tps
  step["ceiling_ratio"] = per_sequence_tps / ceiling_tps if ceiling_tps else None


def require_measured_bandwidth() -> float:
  """Return the measured bandwidth, refusing to run without it.

  The decode ceiling is the whole point of this module. With bandwidth left at
  zero the ceiling is zero and every ratio comes back null, which reads like a
  valid result instead of a missing input.
  """
  if MEASURED_BANDWIDTH_GBPS <= 0:
    raise SystemExit(
      "MEASURED_BANDWIDTH_GBPS is unset or not positive. "
      "Run `make ch5-roofline` first and pass its measured bandwidth, "
      "or use `make ch5-bottleneck` which supplies it."
    )
  return MEASURED_BANDWIDTH_GBPS


async def main() -> None:
  """Run every scenario and save the bottleneck comparison."""
  bandwidth_gbps = require_measured_bandwidth()
  await wait_for_health(BASE_URL)
  parameters_billions = float(os.getenv("PARAMETERS_BILLIONS", "3.09"))
  ceiling = decode_ceiling_tps(bandwidth_gbps, parameters_billions)
  steps = []
  async with httpx.AsyncClient(timeout=900) as client:
    for scenario in SCENARIOS:
      step = await run_scenario(client, scenario)
      annotate_decode_ceiling(step, ceiling)
      steps.append(step)
      print(step)
  report = {
    "model": MODEL_ID,
    "parameters_billions": parameters_billions,
    "weight_gib": weight_bytes(parameters_billions) / 1024**3,
    "measured_bandwidth_gbps": bandwidth_gbps,
    "decode_ceiling_tps": ceiling,
    "scenarios": steps,
  }
  save_json(report, Path("results/bottleneck-probe.json"))


if __name__ == "__main__":
  asyncio.run(main())
