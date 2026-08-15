"""Send N concurrent requests to /basic_generate and report throughput."""

import argparse
import asyncio
import time

import httpx

PROMPTS = [
  "Hello, I am",
  "The weather is",
  "I want to",
  "The best way to",
  "The most efficient way to",
  "Kubernetes is",
  "A GPU is useful because",
  "Model serving means",
]


async def send(client: httpx.AsyncClient, url: str, prompt: str):
  started = time.perf_counter()
  response = await client.post(f"{url}/basic_generate", json={"prompt": prompt})
  response.raise_for_status()
  return time.perf_counter() - started, response.json()["generated_text"]


async def main(url: str, concurrency: int):
  prompts = [PROMPTS[i % len(PROMPTS)] for i in range(concurrency)]
  async with httpx.AsyncClient(timeout=600) as client:
    wall_start = time.perf_counter()
    results = await asyncio.gather(*[send(client, url, p) for p in prompts])
    wall = time.perf_counter() - wall_start

  latencies = sorted(r[0] for r in results)
  print(f"requests      : {concurrency}")
  print(f"wall time     : {wall:.2f}s")
  print(f"throughput    : {concurrency / wall:.2f} req/s")
  print(f"latency p50   : {latencies[len(latencies) // 2]:.2f}s")
  print(f"latency max   : {latencies[-1]:.2f}s")
  print(f"sample output : {results[0][1][:80]!r}")


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--url", default="http://localhost:8000")
  parser.add_argument("--concurrency", type=int, default=8)
  args = parser.parse_args()
  asyncio.run(main(args.url, args.concurrency))
