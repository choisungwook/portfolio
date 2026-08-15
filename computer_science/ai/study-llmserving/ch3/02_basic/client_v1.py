"""Send N concurrent requests to /basic_generate and report throughput."""

import argparse
import asyncio
import time

import httpx

PROMPTS = [
  "Explain how an API server sends an LLM request to a separate model worker process.",
  "Explain why multiprocessing queues are useful for local model serving.",
  "Describe what happens when many HTTP requests share one model worker.",
  "Explain the difference between request concurrency and model batching.",
  "Describe how queue waiting time affects API request latency.",
  "Explain why a model worker loads its model once and then waits for tasks.",
  "Describe how request IDs connect queued tasks with their generated responses.",
  "Explain why increasing client concurrency may not improve model throughput.",
]


async def send(client: httpx.AsyncClient, url: str, prompt: str, min_processing_seconds: float):
  started = time.perf_counter()
  response = await client.post(
    f"{url}/basic_generate",
    json={"prompt": prompt, "min_processing_seconds": min_processing_seconds},
  )
  response.raise_for_status()
  return time.perf_counter() - started, response.json()["generated_text"]


async def main(url: str, concurrency: int, min_processing_seconds: float):
  prompts = [PROMPTS[i % len(PROMPTS)] for i in range(concurrency)]
  async with httpx.AsyncClient(timeout=600) as client:
    wall_start = time.perf_counter()
    results = await asyncio.gather(
      *[send(client, url, prompt, min_processing_seconds) for prompt in prompts]
    )
    wall = time.perf_counter() - wall_start

  latencies = sorted(r[0] for r in results)
  print(f"requests      : {concurrency}")
  print(f"minimum/task  : {min_processing_seconds:.1f}s")
  print(f"wall time     : {wall:.2f}s")
  print(f"throughput    : {concurrency / wall:.2f} req/s")
  print(f"latency p50   : {latencies[len(latencies) // 2]:.2f}s")
  print(f"latency max   : {latencies[-1]:.2f}s")
  print(f"sample output : {results[0][1][:80]!r}")


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--url", default="http://localhost:8000")
  parser.add_argument("--concurrency", type=int, default=8)
  parser.add_argument("--min-processing-seconds", type=float, default=15)
  args = parser.parse_args()
  asyncio.run(main(args.url, args.concurrency, args.min_processing_seconds))
