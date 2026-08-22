"""Run one fixed LLM workload at concurrency 1, 4, and 8."""

import asyncio
import os
import time
from dataclasses import dataclass
from pathlib import Path

import httpx

from benchmark.common import (
  RequestMetric,
  fetch_peak_vram_mib,
  metric_summary,
  metrics_to_dict,
  save_json,
  stream_completion,
  wait_for_health,
)

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
PROMETHEUS_URL = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_LABEL = os.getenv("MODEL_LABEL", "unknown")
PRECISION = os.getenv("PRECISION", "unknown")
MAX_NUM_SEQS = int(os.getenv("VLLM_MAX_NUM_SEQS", "8"))
MAX_NUM_BATCHED_TOKENS = int(os.getenv("VLLM_MAX_NUM_BATCHED_TOKENS", "4096"))
CONCURRENCY_LEVELS = [1, 4, 8]
WARMUP_REQUESTS = 5
MEASURED_REQUESTS = 20


@dataclass(frozen=True)
class Workload:
  """Describe prompt and output lengths for one bottleneck."""

  name: str
  prompt_body: str
  max_tokens: int


async def run_workload(workload: Workload) -> dict[str, object]:
  """Run one workload across the fixed concurrency levels."""
  await wait_for_health(BASE_URL)
  results = []
  async with httpx.AsyncClient(timeout=300) as client:
    for concurrency in CONCURRENCY_LEVELS:
      await _warm_up(client, workload, concurrency)
      result = await _measure(client, workload, concurrency)
      results.append(result)
      print(result)
  report = {
    "model": MODEL_LABEL,
    "precision": PRECISION,
    "workload": workload.name,
    "scheduler": {
      "max_num_seqs": MAX_NUM_SEQS,
      "max_num_batched_tokens": MAX_NUM_BATCHED_TOKENS,
    },
    "results": results,
  }
  output = Path(f"results/performance-{MODEL_LABEL}-{workload.name}.json")
  save_json(report, output)
  return report


async def _warm_up(
  client: httpx.AsyncClient,
  workload: Workload,
  concurrency: int,
) -> None:
  """Warm kernels and model state before measurement."""
  semaphore = asyncio.Semaphore(concurrency)
  prompts = [_prompt(workload, index, warmup=True) for index in range(WARMUP_REQUESTS)]

  async def limited_request(prompt: str) -> RequestMetric:
    async with semaphore:
      return await stream_completion(client, BASE_URL, MODEL_NAME, prompt, workload.max_tokens)

  await asyncio.gather(*[limited_request(prompt) for prompt in prompts])


async def _measure(
  client: httpx.AsyncClient,
  workload: Workload,
  concurrency: int,
) -> dict[str, object]:
  """Measure one concurrency level."""
  semaphore = asyncio.Semaphore(concurrency)
  prompts = [_prompt(workload, index, warmup=False) for index in range(MEASURED_REQUESTS)]

  async def limited_request(prompt: str) -> RequestMetric:
    async with semaphore:
      return await stream_completion(client, BASE_URL, MODEL_NAME, prompt, workload.max_tokens)

  started_epoch = time.time()
  started = time.perf_counter()
  metrics = await asyncio.gather(*[limited_request(prompt) for prompt in prompts])
  elapsed = time.perf_counter() - started
  finished_epoch = time.time()
  summary = metric_summary(metrics, elapsed)
  summary["peak_vram_mib"] = await fetch_peak_vram_mib(
    PROMETHEUS_URL,
    started_epoch,
    finished_epoch,
  )
  return {
    "concurrency": concurrency,
    "elapsed_seconds": elapsed,
    **summary,
    "requests": metrics_to_dict(metrics),
  }


def _prompt(workload: Workload, index: int, warmup: bool) -> str:
  """Create a unique prefix so quantization tests do not become cache tests."""
  phase = "warmup" if warmup else "measure"
  return f"unique-{phase}-{index} {workload.prompt_body}"
