"""Compare our hand-rolled service against a vLLM OpenAI-compatible server.

Works on Apple Silicon too: the vLLM side is reached over HTTP, so it can run
on the Ubuntu box (or any remote host) while the client runs on the Mac.
"""

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


async def bench_ours(url: str, prompts, timeout: float):
  async with httpx.AsyncClient(timeout=timeout) as client:
    started = time.perf_counter()
    response = await client.post(f"{url}/generate", json={"prompts": prompts})
    response.raise_for_status()
    elapsed = time.perf_counter() - started
  return elapsed, response.json()["generated_texts"][0]


async def bench_vllm(url: str, model: str, prompts, max_tokens: int, timeout: float):
  async def one(client, prompt):
    response = await client.post(
      f"{url}/v1/completions",
      json={"model": model, "prompt": prompt, "max_tokens": max_tokens, "temperature": 0.7},
    )
    response.raise_for_status()
    return response.json()["choices"][0]["text"]

  async with httpx.AsyncClient(timeout=timeout) as client:
    started = time.perf_counter()
    texts = await asyncio.gather(*[one(client, p) for p in prompts])
    elapsed = time.perf_counter() - started
  return elapsed, texts[0]


async def main(args):
  prompts = [PROMPTS[i % len(PROMPTS)] for i in range(args.total)]

  print(f"prompts={args.total} max_tokens={args.max_tokens}")
  if args.ours_url:
    elapsed, sample = await bench_ours(args.ours_url, prompts, args.timeout)
    print(f"ours  : {elapsed:6.2f}s  {args.total / elapsed:6.2f} prompt/s  {sample[:50]!r}")
  if args.vllm_url:
    elapsed, sample = await bench_vllm(
      args.vllm_url, args.model, prompts, args.max_tokens, args.timeout
    )
    print(f"vllm  : {elapsed:6.2f}s  {args.total / elapsed:6.2f} prompt/s  {sample[:50]!r}")


if __name__ == "__main__":
  parser = argparse.ArgumentParser()
  parser.add_argument("--ours-url", default="http://localhost:8000")
  parser.add_argument("--vllm-url", default="http://localhost:8100")
  parser.add_argument("--model", default="facebook/opt-125m")
  parser.add_argument("--total", type=int, default=16)
  parser.add_argument("--max-tokens", type=int, default=20)
  parser.add_argument("--timeout", type=float, default=600)
  asyncio.run(main(parser.parse_args()))
