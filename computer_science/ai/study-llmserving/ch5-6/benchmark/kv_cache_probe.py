"""Compare the Chapter 5 KV cache formula against what vLLM actually reserves.

Chapter 5 estimates KV cache from max batch size times max sequence length.
vLLM inverts that: it reserves one pool at startup and reports how full the pool
is. This module puts both numbers in the same table so the gap is visible.
"""

import asyncio
import os
import re
import time
from pathlib import Path

import httpx

from benchmark.common import (
  ServerGaugeSampler,
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
BYTES_PER_ELEMENT = 2
OUTPUT_TOKENS = int(os.getenv("OUTPUT_TOKENS", "128"))
SWEEP = [(1, 256), (4, 256), (8, 256), (8, 2048), (16, 2048), (32, 2048), (48, 2048)]
SAMPLED_GAUGES = [
  "vllm:kv_cache_usage_perc",
  "vllm:num_requests_running",
  "vllm:num_requests_waiting",
]
CACHE_INFO_PATTERN = re.compile(r"vllm:cache_config_info\{([^}]*)\}")


def kv_bytes_per_token(layers: int, kv_heads: int, head_dimension: int) -> float:
  """Return Key and Value cache bytes for one token, as in Chapter 5."""
  return 2 * layers * kv_heads * head_dimension * BYTES_PER_ELEMENT


def read_model_shape() -> dict[str, int]:
  """Return the attention layout that drives the KV cache formula."""
  from transformers import AutoConfig

  config = AutoConfig.from_pretrained(MODEL_ID)
  hidden_size = int(config.hidden_size)
  attention_heads = int(config.num_attention_heads)
  return {
    "layers": int(config.num_hidden_layers),
    "attention_heads": attention_heads,
    "kv_heads": int(config.num_key_value_heads),
    "head_dimension": getattr(config, "head_dim", None) or hidden_size // attention_heads,
    "hidden_size": hidden_size,
  }


def parse_cache_config(metrics_text: str) -> dict[str, int]:
  """Extract the KV pool geometry vLLM published in its own metrics."""
  match = CACHE_INFO_PATTERN.search(metrics_text)
  if not match:
    return {}
  labels = dict(re.findall(r'(\w+)="([^"]*)"', match.group(1)))
  wanted = ["num_gpu_blocks", "block_size"]
  return {key: int(labels[key]) for key in wanted if labels.get(key, "").isdigit()}


async def fetch_cache_config() -> dict[str, int]:
  """Read the KV pool geometry from the running server."""
  async with httpx.AsyncClient(timeout=20) as client:
    response = await client.get(f"{BASE_URL}/metrics")
    response.raise_for_status()
  return parse_cache_config(response.text)


def build_prompt(prompt_tokens: int) -> str:
  """Build a prompt of roughly the requested token length."""
  from transformers import AutoTokenizer

  tokenizer = AutoTokenizer.from_pretrained(MODEL_ID)
  unit = " serving"
  repeats = max(1, prompt_tokens // max(1, len(tokenizer.encode(unit, add_special_tokens=False))))
  return f"unique-{time.time_ns()}" + unit * repeats


async def run_step(
  client: httpx.AsyncClient,
  concurrency: int,
  prompt_tokens: int,
) -> dict[str, object]:
  """Hold `concurrency` requests of one prompt length and watch the KV pool."""
  prompts = [build_prompt(prompt_tokens) for _ in range(concurrency)]
  started_epoch = time.time()
  started = time.perf_counter()
  async with ServerGaugeSampler(f"{BASE_URL}/metrics", SAMPLED_GAUGES) as sampler:
    metrics = await asyncio.gather(
      *[
        stream_completion(client, BASE_URL, MODEL_NAME, prompt, OUTPUT_TOKENS) for prompt in prompts
      ]
    )
    elapsed = time.perf_counter() - started
  finished_epoch = time.time()
  return {
    "concurrency": concurrency,
    "prompt_tokens": prompt_tokens,
    "output_tokens": OUTPUT_TOKENS,
    **metric_summary(metrics, elapsed),
    "kv_usage_peak_perc": sampler.peaks.get("vllm:kv_cache_usage_perc"),
    "requests_running_peak": sampler.peaks.get("vllm:num_requests_running"),
    "requests_waiting_peak": sampler.peaks.get("vllm:num_requests_waiting"),
    **await _fetch_gpu_peaks(started_epoch, finished_epoch),
  }


async def _fetch_gpu_peaks(started_epoch: float, finished_epoch: float) -> dict[str, float | None]:
  """Read the peak GPU indicators, which only DCGM publishes."""
  queries = {
    "peak_vram_mib": "DCGM_FI_DEV_FB_USED",
    "gpu_util_peak": "DCGM_FI_DEV_GPU_UTIL",
    "mem_copy_util_peak": "DCGM_FI_DEV_MEM_COPY_UTIL",
  }
  results = await asyncio.gather(
    *[
      fetch_metric_peak(PROMETHEUS_URL, query, started_epoch, finished_epoch)
      for query in queries.values()
    ]
  )
  return dict(zip(queries.keys(), results, strict=True))


def predict_usage(step: dict[str, object], pool_tokens: int) -> dict[str, float]:
  """Predict pool occupancy with the Chapter 5 formula."""
  tokens = int(step["concurrency"]) * (int(step["prompt_tokens"]) + OUTPUT_TOKENS)
  return {
    "predicted_tokens": tokens,
    "predicted_kv_usage_perc": tokens / pool_tokens if pool_tokens else 0.0,
  }


async def main() -> None:
  """Run the batch and sequence sweep and save the theory-versus-measured table."""
  await wait_for_health(BASE_URL)
  shape = read_model_shape()
  bytes_per_token = kv_bytes_per_token(
    shape["layers"],
    shape["kv_heads"],
    shape["head_dimension"],
  )
  cache_config = await fetch_cache_config()
  pool_tokens = cache_config.get("num_gpu_blocks", 0) * cache_config.get("block_size", 0)
  steps = []
  async with httpx.AsyncClient(timeout=600) as client:
    for concurrency, prompt_tokens in SWEEP:
      step = await run_step(client, concurrency, prompt_tokens)
      step.update(predict_usage(step, pool_tokens))
      steps.append(step)
      print(step)
  report = {
    "model": MODEL_ID,
    "model_shape": shape,
    "kv_bytes_per_token": bytes_per_token,
    "kv_mib_per_token": bytes_per_token / 1024**2,
    "cache_config": cache_config,
    "pool_tokens_measured": pool_tokens,
    "pool_gib_measured": pool_tokens * bytes_per_token / 1024**3,
    "sweep": steps,
  }
  save_json(report, Path("results/kv-cache-probe.json"))
  print(f"pool={pool_tokens} tokens = {report['pool_gib_measured']:.2f} GiB")


if __name__ == "__main__":
  asyncio.run(main())
