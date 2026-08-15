"""Stream from /generate_stream and report TTFT / inter-token latency.

Requests are launched with a stagger so late arrivals join a batch that is
already decoding, reproducing Table 3-1 from the chapter.
"""

import argparse
import asyncio
import json
import time

import httpx

PROMPTS = [
  "Hello, I am",
  "I want to",
  "I like to",
  "The best way to",
  "Kubernetes is",
  "Model serving means",
]


async def stream_one(url: str, prompt: str, label: str, delay: float, verbose: bool):
  await asyncio.sleep(delay)
  started = time.perf_counter()
  first_token_at = None
  tokens = []

  async with httpx.AsyncClient(timeout=600) as client:
    async with client.stream("POST", f"{url}/generate_stream", json={"prompt": prompt}) as response:
      response.raise_for_status()
      async for line in response.aiter_lines():
        if not line.startswith("data: "):
          continue
        data = json.loads(line[6:])
        if first_token_at is None:
          first_token_at = time.perf_counter()
        tokens.append(data["token"])
        if verbose:
          print(f"[{label}] +{time.perf_counter() - started:6.2f}s {data['token']!r}")

  total = time.perf_counter() - started
  ttft = (first_token_at - started) if first_token_at else float("nan")
  tpot = (total - ttft) / max(len(tokens) - 1, 1)
  return {
    "label": label,
    "prompt": prompt,
    "ttft": ttft,
    "total": total,
    "tokens": len(tokens),
    "tpot": tpot,
    "text": "".join(tokens),
  }


async def main(url: str, count: int, stagger: float, verbose: bool):
  tasks = [
    stream_one(url, PROMPTS[i % len(PROMPTS)], chr(ord("A") + i), i * stagger, verbose)
    for i in range(count)
  ]
  results = await asyncio.gather(*tasks)

  print()
  print(f"{'req':>4} {'TTFT(s)':>9} {'total(s)':>9} {'tokens':>7} {'TPOT(s)':>9}  text")
  for r in results:
    print(
      f"{r['label']:>4} {r['ttft']:>9.2f} {r['total']:>9.2f} "
      f"{r['tokens']:>7} {r['tpot']:>9.3f}  {r['text'][:40]!r}"
    )


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--url", default="http://localhost:8000")
  parser.add_argument("--count", type=int, default=4)
  parser.add_argument("--stagger", type=float, default=1.0)
  parser.add_argument("--verbose", action="store_true")
  args = parser.parse_args()
  asyncio.run(main(args.url, args.count, args.stagger, args.verbose))
