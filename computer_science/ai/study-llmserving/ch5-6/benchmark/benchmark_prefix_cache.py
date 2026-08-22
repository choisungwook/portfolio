"""Compare cold, warm, and reordered prefix TTFT."""

import asyncio
import os
from pathlib import Path

import httpx

from benchmark.common import save_json, stream_completion, wait_for_health

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
MODEL_NAME = os.getenv("SERVED_MODEL_NAME", "qwen")
MODEL_LABEL = os.getenv("MODEL_LABEL", "unknown")
STATIC_CONTEXT = "A serving system stores reusable KV blocks for repeated context. " * 160


async def run() -> dict[str, object]:
  """Measure TTFT for one unique prefix sequence."""
  await wait_for_health(BASE_URL)
  cold = f"prefix-lab-a {STATIC_CONTEXT} Question: summarize the context."
  warm = f"prefix-lab-a {STATIC_CONTEXT} Question: state the main optimization."
  miss = f"prefix-lab-b Question: state the main optimization. {STATIC_CONTEXT}"
  async with httpx.AsyncClient(timeout=300) as client:
    cold_metric = await stream_completion(client, BASE_URL, MODEL_NAME, cold, 32)
    warm_metric = await stream_completion(client, BASE_URL, MODEL_NAME, warm, 32)
    miss_metric = await stream_completion(client, BASE_URL, MODEL_NAME, miss, 32)
  report = {
    "model": MODEL_LABEL,
    "cold_ttft_ms": cold_metric.ttft_ms,
    "warm_ttft_ms": warm_metric.ttft_ms,
    "reordered_ttft_ms": miss_metric.ttft_ms,
    "warm_speedup": cold_metric.ttft_ms / max(warm_metric.ttft_ms, 0.001),
  }
  save_json(report, Path(f"results/prefix-cache-{MODEL_LABEL}.json"))
  print(report)
  return report


def main() -> None:
  """Run the prefix cache benchmark."""
  asyncio.run(run())


if __name__ == "__main__":
  main()
