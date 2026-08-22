"""Generate load against the real dynamic batching server."""

import asyncio
import os
import time
from pathlib import Path

import httpx

from benchmark.common import percentile, save_json, wait_for_health

BASE_URL = os.getenv("MODEL_BASE_URL", "http://model-server:8000")
CONCURRENCY = 16
REQUESTS = 40
WARMUP_REQUESTS = 8


async def run() -> dict[str, object]:
  """Measure queue, batch, latency, and throughput for one server configuration."""
  config = await wait_for_health(BASE_URL)
  semaphore = asyncio.Semaphore(CONCURRENCY)

  async with httpx.AsyncClient(timeout=180) as client:

    async def request(index: int) -> dict[str, object]:
      async with semaphore:
        payload = {"prompt": f"Request {index}: explain batching in one short sentence."}
        response = await client.post(f"{BASE_URL}/generate", json=payload)
        response.raise_for_status()
        return response.json()

    await asyncio.gather(*[request(-index) for index in range(WARMUP_REQUESTS)])
    started = time.perf_counter()
    responses = await asyncio.gather(*[request(index) for index in range(REQUESTS)])
    elapsed = time.perf_counter() - started
  batch_sizes = [int(item["batch_size"]) for item in responses]
  queue_delays = [float(item["queue_delay_ms"]) for item in responses]
  latencies = [float(item["latency_ms"]) for item in responses]
  output_tokens = sum(int(item["output_tokens"]) for item in responses)
  report = {
    "model": config["model"],
    "max_batch_size": config["max_batch_size"],
    "max_delay_ms": config["max_delay_ms"],
    "concurrency": CONCURRENCY,
    "requests": REQUESTS,
    "elapsed_seconds": elapsed,
    "rps": REQUESTS / elapsed,
    "output_tps": output_tokens / elapsed,
    "average_actual_batch_size": sum(batch_sizes) / len(batch_sizes),
    "queue_delay_p95_ms": percentile(queue_delays, 0.95),
    "e2e_latency_p95_ms": percentile(latencies, 0.95),
  }
  path = Path(f"results/dynamic-b{config['max_batch_size']}-delay{config['max_delay_ms']}ms.json")
  save_json(report, path)
  print(report)
  return report


def main() -> None:
  """Run one dynamic batching measurement."""
  asyncio.run(run())


if __name__ == "__main__":
  main()
